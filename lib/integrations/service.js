// Integration lifecycle: marketplace view, entitlement, connect / validate /
// re-check / disconnect, and OAuth. Used by both the customer and studio routes.
import { getSettings, saveSettings, getProject, patchProject } from '../db.js';
import { encryptJson, decryptJson, signState, verifyState } from '../crypto.js';
import { allProviders, getProvider, CATEGORIES } from './registry.js';
import { http } from './providers.js';
import { listInstances, getInstance, upsertInstance, deleteInstance, setInstanceStatus } from './store.js';

const PLAN_RANK = { '': 0, Starter: 1, Professional: 2, Growth: 3 };

/** Admin configuration for one provider (defaults: enabled, visible, included). */
export function providerSettings(settings, id) {
  const c = settings.integrationPlatform?.[id] || {};
  return {
    enabled: c.enabled !== false,
    visible: c.visible !== false,
    tier: c.tier === 'premium' ? 'premium' : 'included',
    requiredPlan: PLAN_RANK[c.requiredPlan] ? c.requiredPlan : '',
    setupFee: String(c.setupFee || '').slice(0, 60),
    hasCredentials: !!c.creds
  };
}

function platformCreds(settings, id) {
  const c = settings.integrationPlatform?.[id]?.creds;
  return c ? decryptJson(c) : null;
}

/** May this project use this provider? Pricing is only ever what the administrator configured. */
export function entitlement(cfg, project) {
  if (!cfg.enabled) return { allowed: false, reason: 'This integration is switched off.' };
  const granted = (project?.integrationGrants || []).includes(cfg.id);
  if (granted) return { allowed: true, granted: true };
  if (cfg.requiredPlan && (PLAN_RANK[project?.briefInput?.package || ''] || 0) < PLAN_RANK[cfg.requiredPlan]) {
    return { allowed: false, reason: `Included with the ${cfg.requiredPlan} plan. Contact us to upgrade.`, upgrade: true };
  }
  if (cfg.tier === 'premium') return { allowed: false, reason: `Premium integration${cfg.setupFee ? ` (${cfg.setupFee})` : ''}. Contact us to add it to your website.`, upgrade: true };
  return { allowed: true };
}

function card(p, cfg, inst, ent, role) {
  const oauthReady = !!p.oauth && cfg.hasCredentials;
  return {
    id: p.id, name: p.name, category: p.category, description: p.description, features: p.features || [], color: p.color, ink: p.ink || '#fff',
    complexity: p.complexity, capabilities: p.capabilities || [], permissions: p.permissions || [], setup: p.setup || [],
    auth: oauthReady ? 'oauth' : p.auth,
    configSchema: (p.configSchema || []).map(f => ({ key: f.key, label: f.label, type: f.type, required: !!f.required, placeholder: f.placeholder || '', help: f.help || '', dynamic: f.dynamic || null })),
    secretSchema: oauthReady ? [] : (p.secretSchema || []).map(f => ({ key: f.key, label: f.label, placeholder: f.placeholder || '', help: f.help || '', optional: !!f.optional })),
    placements: p.placements || [],
    pricing: cfg.requiredPlan ? { label: `${cfg.requiredPlan} plan`, kind: 'plan' } : cfg.tier === 'premium' ? { label: cfg.setupFee ? `Premium · ${cfg.setupFee}` : 'Premium', kind: 'premium' } : { label: 'Included', kind: 'included' },
    entitled: ent.allowed, entitlementNote: ent.allowed ? '' : ent.reason,
    unavailable: !!p.unavailable, availabilityNote: p.availabilityNote || '',
    status: p.unavailable ? 'unavailable' : inst ? inst.status : 'available',
    // Customers see a plain message; the technical error is for staff.
    error: inst?.status === 'error' ? (role === 'staff' ? inst.error : 'This connection stopped working. Reconnect it to fix it.') : '',
    note: inst?.config?._note || '',
    needs: inst?.config?._needs || '',
    config: inst ? Object.fromEntries(Object.entries(inst.config).filter(([k]) => !k.startsWith('_'))) : {},
    options: inst?.config?._options || {},
    hasSecrets: !!inst?.hasSecrets,
    lastCheckedAt: inst?.lastCheckedAt || null
  };
}

export async function marketplace(site, role) {
  const settings = await getSettings();
  const project = await getProject(site.projectId);
  const instances = new Map((await listInstances(site.id)).map(i => [i.provider, i]));
  const items = [];
  for (const p of allProviders()) {
    const cfg = { id: p.id, ...providerSettings(settings, p.id) };
    const inst = instances.get(p.id);
    // Hidden or disabled providers disappear, unless this site already uses one.
    if ((!cfg.visible || !cfg.enabled) && !inst && role !== 'staff') continue;
    items.push({ ...card(p, cfg, inst, entitlement(cfg, project), role), ...(role === 'staff' ? { admin: cfg } : {}) });
  }
  return { categories: CATEGORIES.map(([id, label]) => ({ id, label })), integrations: items };
}

async function platformFacts(settings) {
  return { emailConfigured: !!settings.resendApiKey };
}

/**
 * Connect (or update) an integration. The provider's validate() runs against
 * the real service; the status only becomes 'connected' when it passes.
 */
export async function connect(site, providerId, { config = {}, secrets = {} } = {}, { actorId = null } = {}) {
  const p = getProvider(providerId);
  if (!p) throw { status: 404, message: 'Unknown integration' };
  if (p.unavailable) throw { status: 400, message: p.availabilityNote || 'This integration is not available yet.' };
  const settings = await getSettings();
  const project = await getProject(site.projectId);
  const ent = entitlement({ id: p.id, ...providerSettings(settings, p.id) }, project);
  if (!ent.allowed) throw { status: 403, message: ent.reason };

  const existing = await getInstance(site.id, p.id, { withSecrets: true });
  // Blank secret fields mean "keep what is stored".
  const mergedSecrets = { ...(existing?.secrets || {}) };
  for (const [k, v] of Object.entries(secrets || {})) if (typeof v === 'string' && v.trim()) mergedSecrets[k] = v.trim().slice(0, 600);
  const cleanConfig = {};
  for (const f of p.configSchema || []) if (config[f.key] !== undefined) cleanConfig[f.key] = f.type === 'checkbox' ? !!config[f.key] : String(config[f.key]).slice(0, 600);

  let result;
  try { result = await p.validate({ config: { ...(existing?.config || {}), ...cleanConfig }, secrets: mergedSecrets, platform: await platformFacts(settings) }); }
  catch (e) {
    const message = String(e.message || 'Could not connect.').slice(0, 300);
    // A working connection that now fails is marked as an error; a first attempt just reports why.
    if (existing?.status === 'connected') await setInstanceStatus(site.id, p.id, 'error', message);
    throw { status: 400, message };
  }
  const stored = { ...(result.config || {}) };
  if (result.note) stored._note = result.note;
  if (result.needs) stored._needs = result.needs;
  if (result.options) stored._options = result.options;
  const status = result.needs ? 'configuration_required' : 'connected';
  await upsertInstance(site.id, p.id, { status, config: stored, secrets: result.secrets || mergedSecrets, error: '', actorId });
  return { status, needs: result.needs || '', note: result.note || '' };
}

export async function recheck(site, providerId) {
  const p = getProvider(providerId);
  const inst = await getInstance(site.id, providerId, { withSecrets: true });
  if (!p || !inst) throw { status: 404, message: 'Not connected' };
  const settings = await getSettings();
  try {
    const cfg = Object.fromEntries(Object.entries(inst.config).filter(([k]) => !k.startsWith('_')));
    const r = await p.validate({ config: cfg, secrets: inst.secrets, platform: await platformFacts(settings) });
    const stored = { ...(r.config || {}) };
    if (r.note) stored._note = r.note;
    if (r.needs) stored._needs = r.needs;
    if (r.options) stored._options = r.options;
    await upsertInstance(site.id, providerId, { status: r.needs ? 'configuration_required' : 'connected', config: stored, secrets: r.secrets || inst.secrets, error: '' });
    return { status: r.needs ? 'configuration_required' : 'connected' };
  } catch (e) {
    await setInstanceStatus(site.id, providerId, 'error', String(e.message || 'Check failed').slice(0, 300));
    return { status: 'error', error: String(e.message || '') };
  }
}

export async function disconnect(site, providerId) {
  await deleteInstance(site.id, providerId);
  return { status: 'available' };
}

// ---- OAuth (only offered when the administrator has set platform credentials) ----

export async function oauthStart(site, providerId, user, origin) {
  const p = getProvider(providerId);
  const settings = await getSettings();
  const creds = p && platformCreds(settings, providerId);
  if (!p?.oauth || !creds?.clientId) throw { status: 400, message: 'This integration is not set up for one-click sign-in yet.' };
  const project = await getProject(site.projectId);
  const ent = entitlement({ id: p.id, ...providerSettings(settings, p.id) }, project);
  if (!ent.allowed) throw { status: 403, message: ent.reason };
  const state = signState({ s: site.id, p: providerId, u: user.id });
  const url = new URL(p.oauth.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', creds.clientId);
  url.searchParams.set('redirect_uri', `${origin}/api/integrations/oauth/callback`);
  if (p.oauth.scopes?.length) url.searchParams.set('scope', p.oauth.scopes.join(' '));
  url.searchParams.set('state', state);
  return url.toString();
}

/** Exchange the code, validate the connection, store tokens encrypted. Returns the site id. */
export async function oauthCallback({ code, state }, user, origin) {
  const st = verifyState(state);
  if (!st || st.u !== user.id) throw { status: 400, message: 'This sign-in link is not valid any more. Start again from Integrations.' };
  const p = getProvider(st.p);
  const settings = await getSettings();
  const creds = p && platformCreds(settings, st.p);
  if (!p?.oauth || !creds?.clientId || !code) throw { status: 400, message: 'The connection could not be completed.' };
  const res = await http(p.oauth.tokenUrl, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: creds.clientId, client_secret: creds.clientSecret || '', redirect_uri: `${origin}/api/integrations/oauth/callback`, code: String(code) }).toString()
  });
  if (!res.ok) throw { status: 400, message: `${p.name} did not accept the sign-in. Please try again.` };
  const tok = await res.json();
  const secrets = { accessToken: tok.access_token, refreshToken: tok.refresh_token || '', expiresAt: tok.expires_in ? Date.now() + tok.expires_in * 1000 : 0, via: 'oauth' };
  if (p.oauth.metadataUrl) {
    const meta = await http(p.oauth.metadataUrl, { headers: { authorization: `OAuth ${tok.access_token}` } });
    if (meta.ok) { const m = await meta.json(); if (m.dc) secrets.dc = m.dc; }
  }
  return { siteId: st.s, providerId: st.p, secrets };
}

// ---- Studio administration ----------------------------------------------------

export async function adminOverview() {
  const settings = await getSettings();
  return allProviders().map(p => ({
    id: p.id, name: p.name, category: p.category, auth: p.auth, complexity: p.complexity, unavailable: !!p.unavailable, availabilityNote: p.availabilityNote || '',
    supportsOAuth: !!p.oauth, ...providerSettings(settings, p.id)
  }));
}

export async function adminUpdate(id, patch) {
  if (!getProvider(id)) throw { status: 404, message: 'Unknown integration' };
  const settings = await getSettings();
  const all = { ...(settings.integrationPlatform || {}) };
  const cur = { ...(all[id] || {}) };
  if (patch.enabled !== undefined) cur.enabled = !!patch.enabled;
  if (patch.visible !== undefined) cur.visible = !!patch.visible;
  if (patch.tier !== undefined) cur.tier = patch.tier === 'premium' ? 'premium' : 'included';
  if (patch.requiredPlan !== undefined) cur.requiredPlan = PLAN_RANK[patch.requiredPlan] ? patch.requiredPlan : '';
  if (patch.setupFee !== undefined) cur.setupFee = String(patch.setupFee || '').slice(0, 60);
  if (patch.credentials) {
    const clientId = String(patch.credentials.clientId || '').trim().slice(0, 300);
    const clientSecret = String(patch.credentials.clientSecret || '').trim().slice(0, 300);
    if (clientId && clientSecret) cur.creds = encryptJson({ clientId, clientSecret });
    else if (patch.credentials.clear) delete cur.creds;
  }
  all[id] = cur;
  await saveSettings({ integrationPlatform: all });
  return providerSettings({ integrationPlatform: all }, id);
}

export async function setGrant(projectId, providerId, granted) {
  const project = await getProject(projectId);
  if (!project) throw { status: 404, message: 'Project not found' };
  const set = new Set(project.integrationGrants || []);
  if (granted) set.add(providerId); else set.delete(providerId);
  await patchProject(projectId, { integrationGrants: [...set] });
  return [...set];
}
