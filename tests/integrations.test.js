import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { sql, getProject, saveSettings, getSettings } from '@/lib/db';
import { freshDb, makeUser, signIn, signOut, jsonReq } from './helpers';
import { sampleProject } from './fixtures';
import { startSiteBuild, runJob } from '@/lib/gen/pipeline';
import { getSiteByProject, getSite, publishSite } from '@/lib/site/store';
import { inviteCustomer, redeemToken } from '@/lib/customers';
import { PROVIDERS, assertPublicHttpsUrl, sign } from '@/lib/integrations/providers';
import { getInstance } from '@/lib/integrations/store';
import { encryptJson, decryptJson, signState, verifyState } from '@/lib/crypto';
import { GET as mkGET, POST as mkPOST } from '@/app/api/sites/[id]/integrations/route';
import { GET as siteGET, PATCH as sitePATCH } from '@/app/api/sites/[id]/route';
import { POST as sitePublishPOST } from '@/app/api/sites/[id]/publish/route';
import { GET as previewGET } from '@/app/preview/[slug]/route';
import { GET as previewPathGET } from '@/app/preview/[slug]/[...path]/route';
import { POST as formPOST } from '@/app/api/forms/[siteId]/route';
import { GET as adminGET, PATCH as adminPATCH } from '@/app/api/integrations/admin/route';
import { GET as oauthStartGET } from '@/app/api/integrations/oauth/start/route';
import { GET as oauthCallbackGET } from '@/app/api/integrations/oauth/callback/route';

const P = id => ({ params: { id } });

async function seedSite(name) {
  const p = sampleProject('p_' + Math.random().toString(36).slice(2, 8), { status: 'paid' });
  p.business.name = name;
  const now = Date.now();
  await sql`INSERT INTO projects (id, owner_id, data, created_at, updated_at) VALUES (${p.id}, NULL, ${JSON.stringify(p)}::jsonb, ${now}, ${now})`;
  const job = await startSiteBuild(p, { autoApprove: true }, null);
  let v; for (let i = 0; i < 10; i++) { v = await runJob(job.id); if (v.status !== 'running') break; }
  const site = await getSiteByProject(p.id);
  await publishSite(site.id, {});
  return { project: await getProject(p.id), site: await getSite(site.id) };
}
async function owner(project, email) {
  const inv = await inviteCustomer(project.id, { email, origin: '' });
  const id = await redeemToken(inv.link.split('/').pop(), 'invite', { password: 'correct-horse-battery' });
  return { id, email };
}

/** A fake internet for provider calls. routes: [ [regex, handler(url, init) → {status, json?, text?}] ] */
function fakeNet(routes) {
  const calls = [];
  globalThis.__integrationNoDns = true;
  globalThis.__integrationFetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    for (const [re, fn] of routes) if (re.test(u)) { const r = await fn(u, init); return new Response(r.json !== undefined ? JSON.stringify(r.json) : (r.text || ''), { status: r.status || 200, headers: { 'content-type': 'application/json' } }); }
    return new Response('not found', { status: 404 });
  };
  return calls;
}

let admin;
beforeEach(async () => { await freshDb(); globalThis.__wflNoRemote = true; globalThis.__integrationFetch = undefined; admin = await makeUser('admin'); });

describe('registry', () => {
  it('every provider follows the standard shape', () => {
    const ids = new Set();
    for (const p of PROVIDERS) {
      expect(ids.has(p.id), p.id).toBe(false); ids.add(p.id);
      for (const k of ['name', 'category', 'description', 'complexity', 'auth']) expect(p[k], `${p.id}.${k}`).toBeTruthy();
      expect(Array.isArray(p.capabilities) && p.capabilities.length > 0, p.id).toBe(true);
      expect(Array.isArray(p.permissions), p.id).toBe(true);
      expect(typeof p.validate, p.id).toBe('function');
      for (const pl of p.placements || []) expect(typeof p.renderSection, `${p.id} placement needs a renderer`).toBe('function');
      // secrets are declared separately from public config
      for (const f of p.secretSchema || []) expect((p.configSchema || []).some(c => c.key === f.key), `${p.id}.${f.key}`).toBe(false);
    }
    expect(ids.size).toBeGreaterThanOrEqual(18);
    for (const cat of ['scheduling', 'payments', 'marketing', 'forms', 'communication', 'reputation', 'maps']) expect(PROVIDERS.some(p => p.category === cat), cat).toBe(true);
  });

  it('refuses private and non-HTTPS webhook addresses', async () => {
    globalThis.__integrationNoDns = true;
    for (const bad of ['http://example.com/hook', 'https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://192.168.1.10/x', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/x', 'https://user:pw@example.com/x', 'https://example.com:8443/x', 'https://intranet/x', 'not a url']) {
      await expect(assertPublicHttpsUrl(bad), bad).rejects.toThrow();
    }
    expect((await assertPublicHttpsUrl('https://hooks.example.com/catch/1')).hostname).toBe('hooks.example.com');
  });

  it('encrypts credentials and signs state', () => {
    const enc = encryptJson({ token: 'pat-secret-123' });
    expect(enc).not.toContain('pat-secret-123');
    expect(decryptJson(enc)).toEqual({ token: 'pat-secret-123' });
    expect(decryptJson(enc.slice(0, -4) + 'AAAA')).toEqual({});     // tampered → rejected
    const st = signState({ s: 'site1', u: 'u1' });
    expect(verifyState(st)).toMatchObject({ s: 'site1', u: 'u1' });
    expect(verifyState(st.replace(/.$/, c => (c === 'A' ? 'B' : 'A')))).toBeNull();
    expect(verifyState(signState({ s: 'x' }, -1000))).toBeNull();   // expired
  });
});

describe('connecting integrations', () => {
  it('only shows Connected after the provider validates, and renders the block on the published site', async () => {
    const { project, site } = await seedSite('Alpha Roofing');
    const me = await owner(project, 'o@alpha.test');
    await signIn(me);
    fakeNet([[/calendly\.com\/alpha\/30min/, () => ({ status: 200, text: 'ok' })], [/calendly\.com\/ghost/, () => ({ status: 404 })]]);

    let mk = await (await mkGET(jsonReq('/x'), P(site.id))).json();
    const cal = mk.integrations.find(i => i.id === 'calendly');
    expect(cal).toMatchObject({ status: 'available', entitled: true, pricing: { kind: 'included' }, complexity: 'Easy' });
    expect(cal.setup.length).toBeGreaterThan(1);
    expect(mk.categories.map(c => c.id)).toContain('scheduling');

    // a link that does not exist is not "connected"
    const bad = await mkPOST(jsonReq('/x', 'POST', { action: 'connect', provider: 'calendly', config: { url: 'https://calendly.com/ghost' } }), P(site.id));
    expect(bad.status).toBe(400);
    expect(await getInstance(site.id, 'calendly')).toBeNull();
    const wrongHost = await mkPOST(jsonReq('/x', 'POST', { action: 'connect', provider: 'calendly', config: { url: 'https://evil.example/calendly.com' } }), P(site.id));
    expect(wrongHost.status).toBe(400);

    const ok = await (await mkPOST(jsonReq('/x', 'POST', { action: 'connect', provider: 'calendly', config: { url: 'calendly.com/alpha/30min/' } }), P(site.id))).json();
    expect(ok.status).toBe('connected');
    expect(ok.integrations.find(i => i.id === 'calendly').config.url).toBe('https://calendly.com/alpha/30min');

    // place the booking block on the contact page, then publish
    const model = (await (await siteGET(jsonReq('/x'), P(site.id))).json()).site;
    expect(model.integrationBlocks).toContainEqual(expect.objectContaining({ provider: 'calendly', kind: 'booking' }));
    const contact = model.pages.find(p => p.slug === 'contact');
    const placed = await sitePATCH(jsonReq('/x', 'PATCH', { rev: model.rev, ops: [{ op: 'integration.place', pageId: contact.id, provider: 'calendly', kind: 'booking' }] }), P(site.id));
    expect(placed.status).toBe(200);
    await sitePublishPOST(jsonReq('/x', 'POST', {}), P(site.id));
    const res = await previewPathGET(jsonReq('/x'), { params: { slug: site.slug, path: ['contact'] } });
    const html = await res.text();
    expect(html).toContain('<iframe src="https://calendly.com/alpha/30min?hide_gdpr_banner=1&amp;embed_type=Inline"');
    expect(res.headers.get('content-security-policy')).toContain('https://calendly.com');
    // the stored page holds a reference, not third-party markup
    const draft = (await getSite(site.id)).draft;
    const sec = draft.pages.find(p => p.slug === 'contact').sections.at(-1);
    expect(sec).toMatchObject({ html: '', integration: { provider: 'calendly', kind: 'booking' } });

    // disconnecting removes the block from the next publish without breaking the page
    await mkPOST(jsonReq('/x', 'POST', { action: 'disconnect', provider: 'calendly' }), P(site.id));
    await sitePublishPOST(jsonReq('/x', 'POST', {}), P(site.id));
    const after = await (await previewPathGET(jsonReq('/x'), { params: { slug: site.slug, path: ['contact'] } })).text();
    expect(after).not.toContain('calendly.com');
    expect(after).toContain('data-form="contact"');
  });

  it('a block cannot be placed for an integration that is not connected', async () => {
    const { project, site } = await seedSite('Alpha Roofing');
    await signIn(await owner(project, 'o@alpha.test'));
    const model = (await (await siteGET(jsonReq('/x'), P(site.id))).json()).site;
    const res = await sitePATCH(jsonReq('/x', 'PATCH', { rev: model.rev, ops: [{ op: 'integration.place', pageId: model.pages[0].id, provider: 'stripe_link', kind: 'payment' }] }), P(site.id));
    expect(res.status).toBe(400);
  });

  it('keeps API credentials on the server: never in responses, never in pages', async () => {
    const { project, site } = await seedSite('Alpha Roofing');
    await signIn(await owner(project, 'o@alpha.test'));
    const TOKEN = 'pat-na1-SUPERSECRET-0001';
    const calls = fakeNet([[/api\.hubapi\.com\/crm\/v3\/objects\/contacts\?limit=1/, (u, init) => ({ status: init.headers.authorization === `Bearer ${TOKEN}` ? 200 : 401, json: { results: [] } })],
      [/api\.hubapi\.com\/crm\/v3\/objects\/contacts$/, () => ({ status: 201, json: { id: '1' } })]]);
    const bad = await mkPOST(jsonReq('/x', 'POST', { action: 'connect', provider: 'hubspot', secrets: { token: 'pat-wrong' } }), P(site.id));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/rejected that token/);
    const res = await mkPOST(jsonReq('/x', 'POST', { action: 'connect', provider: 'hubspot', secrets: { token: TOKEN } }), P(site.id));
    const body = await res.text();
    expect(JSON.parse(body).status).toBe('connected');
    expect(body).not.toContain('SUPERSECRET');
    expect(await (await mkGET(jsonReq('/x'), P(site.id))).text()).not.toContain('SUPERSECRET');
    const row = (await sql`SELECT secrets, config FROM integration_instances WHERE provider = 'hubspot'`)[0];
    expect(row.secrets).not.toContain('SUPERSECRET');             // encrypted at rest
    expect(JSON.stringify(row.config)).not.toContain('SUPERSECRET');
    await sitePublishPOST(jsonReq('/x', 'POST', {}), P(site.id));
    const files = await sql`SELECT content FROM site_files`;
    expect(files.map(f => f.content).join('')).not.toContain('SUPERSECRET');

    // a website form submission is delivered to HubSpot server-side
    signOut();
    const sub = await formPOST(jsonReq('/x', 'POST', { form: 'contact', fields: { name: 'Sam Lee', email: 'sam@example.test', phone: '555', message: 'Hi' } }, { 'x-forwarded-for': '5.5.5.5' }), { params: { siteId: site.id } });
    expect(sub.status).toBe(200);
    const post = calls.find(c => c.method === 'POST' && /contacts$/.test(c.url));
    expect(post.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(post.body).properties).toEqual({ email: 'sam@example.test', firstname: 'Sam', lastname: 'Lee', phone: '555' });
    expect((await sql`SELECT delivery FROM form_submissions`)[0].delivery.integrations).toEqual([{ provider: 'hubspot', ok: true }]);
  });

  it('marks a connection as an error when the provider stops accepting it', async () => {
    const { project, site } = await seedSite('Alpha Roofing');
    await signIn(await owner(project, 'o@alpha.test'));
    let accept = true;
    fakeNet([[/hubapi\.com/, () => ({ status: accept ? 200 : 401, json: {} })]]);
    await mkPOST(jsonReq('/x', 'POST', { action: 'connect', provider: 'hubspot', secrets: { token: 'pat-ok' } }), P(site.id));
    accept = false;
    signOut();
    await formPOST(jsonReq('/x', 'POST', { fields: { name: 'A', email: 'a@example.test', message: 'm' } }, { 'x-forwarded-for': '6.6.6.6' }), { params: { siteId: site.id } });
    expect((await getInstance(site.id, 'hubspot')).status).toBe('error');
    await signIn(await makeUser('admin', 'admin2'));
    const overview = await (await adminGET()).json();
    expect(overview.connections.find(c => c.provider === 'hubspot')).toMatchObject({ status: 'error', businessName: 'Alpha Roofing' });
  });

  it('Mailchimp: validates the key, asks for an audience, then subscribes newsletter signups', async () => {
    const { project, site } = await seedSite('Alpha Roofing');
    await signIn(await owner(project, 'o@alpha.test'));
    const calls = fakeNet([[/us21\.api\.mailchimp\.com\/3\.0\/ping/, () => ({ status: 200, json: { health_status: 'ok' } })],
      [/us21\.api\.mailchimp\.com\/3\.0\/lists\?/, () => ({ status: 200, json: { lists: [{ id: 'aaa', name: 'Customers' }, { id: 'bbb', name: 'Newsletter' }] } })],
      [/\/lists\/bbb\/members\//, () => ({ status: 200, json: {} })]]);
    expect((await mkPOST(jsonReq('/x', 'POST', { action: 'connect', provider: 'mailchimp', secrets: { apiKey: 'nodatacenter' } }), P(site.id))).status).toBe(400);
    const first = await (await mkPOST(jsonReq('/x', 'POST', { action: 'connect', provider: 'mailchimp', secrets: { apiKey: 'abc123-us21' } }), P(site.id))).json();
    expect(first.status).toBe('configuration_required');           // honest: not "connected" until an audience is chosen
    const card = first.integrations.find(i => i.id === 'mailchimp');
    expect(card.options.lists).toHaveLength(2);
    const second = await (await mkPOST(jsonReq('/x', 'POST', { action: 'connect', provider: 'mailchimp', config: { listId: 'bbb' } }), P(site.id))).json();
    expect(second.status).toBe('connected');                         // the saved key was reused
    signOut();
    await formPOST(jsonReq('/x', 'POST', { form: 'newsletter', fields: { name: 'Jo', email: 'Jo@Example.test' } }, { 'x-forwarded-for': '7.7.7.7' }), { params: { siteId: site.id } });
    const put = calls.find(c => c.method === 'PUT');
    expect(put.url).toContain('/lists/bbb/members/' + crypto.createHash('md5').update('jo@example.test').digest('hex'));
    expect(JSON.parse(put.body)).toMatchObject({ email_address: 'Jo@Example.test', status_if_new: 'subscribed' });
    // a contact-form message is NOT added to the mailing list
    await formPOST(jsonReq('/x', 'POST', { form: 'contact', fields: { name: 'Al', email: 'al@example.test', message: 'hi' } }, { 'x-forwarded-for': '8.8.8.8' }), { params: { siteId: site.id } });
    expect(calls.filter(c => c.method === 'PUT')).toHaveLength(1);
  });

  it('webhook: requires a successful signed test, then delivers signed submissions', async () => {
    const { project, site } = await seedSite('Alpha Roofing');
    await signIn(await owner(project, 'o@alpha.test'));
    let status = 500;
    const calls = fakeNet([[/hooks\.example\.com/, () => ({ status })]]);
    expect((await mkPOST(jsonReq('/x', 'POST', { action: 'connect', provider: 'webhook', config: { url: 'https://hooks.example.com/catch/1' } }), P(site.id))).status).toBe(400);
    expect((await mkPOST(jsonReq('/x', 'POST', { action: 'connect', provider: 'webhook', config: { url: 'https://192.168.0.4/hook' } }), P(site.id))).status).toBe(400);
    status = 200;
    const ok = await (await mkPOST(jsonReq('/x', 'POST', { action: 'connect', provider: 'webhook', config: { url: 'https://hooks.example.com/catch/1' }, secrets: { secret: 'shh' } }), P(site.id))).json();
    expect(ok.status).toBe('connected');
    signOut();
    await formPOST(jsonReq('/x', 'POST', { fields: { name: 'A', email: 'a@example.test', message: 'm' } }, { 'x-forwarded-for': '4.3.2.1' }), { params: { siteId: site.id } });
    const delivery = calls.at(-1);
    expect(JSON.parse(delivery.body)).toMatchObject({ type: 'form.submitted', form: 'contact', fields: { name: 'A' } });
    expect(delivery.headers['x-499-signature']).toBe(sign('shh', delivery.body));
  });

  it('analytics and chat are loaded by the platform runtime from validated ids', async () => {
    const { project, site } = await seedSite('Alpha Roofing');
    await signIn(await owner(project, 'o@alpha.test'));
    fakeNet([[/googletagmanager\.com\/gtag\/js\?id=G-AB12CD34EF/, () => ({ status: 200, text: '//js' })]]);
    expect((await mkPOST(jsonReq('/x', 'POST', { action: 'connect', provider: 'ga4', config: { measurementId: '"><script>alert(1)</script>' } }), P(site.id))).status).toBe(400);
    const ga = await (await mkPOST(jsonReq('/x', 'POST', { action: 'connect', provider: 'ga4', config: { measurementId: 'g-ab12cd34ef' } }), P(site.id))).json();
    expect(ga.status).toBe('connected');
    expect(ga.integrations.find(i => i.id === 'ga4').note).toMatch(/Realtime/);
    await mkPOST(jsonReq('/x', 'POST', { action: 'connect', provider: 'whatsapp', config: { phone: '+1 (404) 555-0142', greeting: 'Hi "there" <b>' } }), P(site.id));
    await sitePublishPOST(jsonReq('/x', 'POST', {}), P(site.id));
    const res = await previewGET(jsonReq('/x'), { params: { slug: site.slug } });
    const html = await res.text();
    expect(html).toMatch(/<html [^>]*data-ga="G-AB12CD34EF"/);
    expect(html).toContain('href="https://wa.me/14045550142?text=Hi%20%22there%22%20%3Cb%3E"');
    expect(html).not.toMatch(/<script(?![^>]*(src="\/preview\/[^"]+\/assets\/site\.js|application\/ld\+json))/);   // still no inline or third-party script tags
    const csp = res.headers.get('content-security-policy');
    expect(csp).toContain('https://www.googletagmanager.com');
    expect(csp).not.toContain("'unsafe-inline' https://www.googletagmanager");
  });

  it('unavailable providers say so and cannot be connected', async () => {
    const { project, site } = await seedSite('Alpha Roofing');
    await signIn(await owner(project, 'o@alpha.test'));
    const mk = await (await mkGET(jsonReq('/x'), P(site.id))).json();
    const w = mk.integrations.find(i => i.id === 'google_reviews_widget');
    expect(w).toMatchObject({ status: 'unavailable', unavailable: true });
    expect(w.availabilityNote).toMatch(/approval/);
    expect((await mkPOST(jsonReq('/x', 'POST', { action: 'connect', provider: 'google_reviews_widget' }), P(site.id))).status).toBe(400);
  });
});

describe('entitlement and administration', () => {
  it('premium / plan-gated integrations need an upgrade or a grant; hidden ones disappear', async () => {
    const { project, site } = await seedSite('Alpha Roofing');
    const me = await owner(project, 'o@alpha.test');
    await signIn(admin);
    await adminPATCH(jsonReq('/x', 'PATCH', { id: 'stripe_link', tier: 'premium', setupFee: '$49 one-time' }));
    await adminPATCH(jsonReq('/x', 'PATCH', { id: 'hubspot', requiredPlan: 'Growth' }));
    await adminPATCH(jsonReq('/x', 'PATCH', { id: 'paypal', visible: false }));
    await adminPATCH(jsonReq('/x', 'PATCH', { id: 'crisp', enabled: false }));
    await signIn(me);
    fakeNet([[/buy\.stripe\.com/, () => ({ status: 200 })]]);
    let mk = await (await mkGET(jsonReq('/x'), P(site.id))).json();
    expect(mk.integrations.find(i => i.id === 'stripe_link')).toMatchObject({ entitled: false, pricing: { kind: 'premium', label: 'Premium · $49 one-time' } });
    expect(mk.integrations.find(i => i.id === 'hubspot')).toMatchObject({ entitled: false, pricing: { kind: 'plan', label: 'Growth plan' } });
    expect(mk.integrations.find(i => i.id === 'calendly').pricing).toEqual({ kind: 'included', label: 'Included' });   // no price invented
    expect(mk.integrations.some(i => i.id === 'paypal')).toBe(false);
    expect(mk.integrations.some(i => i.id === 'crisp')).toBe(false);
    const blocked = await mkPOST(jsonReq('/x', 'POST', { action: 'connect', provider: 'stripe_link', config: { url: 'https://buy.stripe.com/test_123' } }), P(site.id));
    expect(blocked.status).toBe(403);
    // the customer cannot change marketplace settings
    expect((await adminPATCH(jsonReq('/x', 'PATCH', { id: 'stripe_link', tier: 'included' }))).status).toBe(403);
    // the administrator grants it to this customer
    await signIn(admin);
    await adminPATCH(jsonReq('/x', 'PATCH', { grant: { projectId: project.id, provider: 'stripe_link', granted: true } }));
    await signIn(me);
    const ok = await (await mkPOST(jsonReq('/x', 'POST', { action: 'connect', provider: 'stripe_link', config: { url: 'https://buy.stripe.com/test_123' } }), P(site.id))).json();
    expect(ok.status).toBe('connected');
  });

  it('one customer cannot see or change another site’s integrations', async () => {
    const A = await seedSite('Alpha Roofing');
    const B = await seedSite('Bravo Plumbing');
    await signIn(await owner(B.project, 'b@bravo.test'));
    fakeNet([[/./, () => ({ status: 200 })]]);
    await mkPOST(jsonReq('/x', 'POST', { action: 'connect', provider: 'google_maps', config: { address: '1 Bravo St, Atlanta' } }), P(B.site.id));
    await signIn(await owner(A.project, 'a@alpha.test'));
    expect((await mkGET(jsonReq('/x'), P(B.site.id))).status).toBe(404);
    expect((await mkPOST(jsonReq('/x', 'POST', { action: 'disconnect', provider: 'google_maps' }), P(B.site.id))).status).toBe(404);
    expect((await getInstance(B.site.id, 'google_maps')).status).toBe('connected');
    const mine = await (await mkGET(jsonReq('/x'), P(A.site.id))).json();
    expect(mine.integrations.find(i => i.id === 'google_maps').status).toBe('available');
  });

  it('OAuth: only offered with platform credentials, bound to the signed-in person, tokens stored encrypted', async () => {
    const { project, site } = await seedSite('Alpha Roofing');
    const me = await owner(project, 'o@alpha.test');
    await signIn(me);
    const none = await oauthStartGET(jsonReq(`/x?site=${site.id}&provider=hubspot`));
    expect(none.status).toBe(400);                                  // no platform credentials configured → honest refusal
    await signIn(admin);
    await adminPATCH(jsonReq('/x', 'PATCH', { id: 'hubspot', credentials: { clientId: 'cid-123', clientSecret: 'csecret-XYZ' } }));
    const s = await getSettings();
    expect(JSON.stringify(s.integrationPlatform)).not.toContain('csecret-XYZ');   // encrypted in settings
    expect(await (await adminGET()).text()).not.toContain('csecret-XYZ');
    await signIn(me);
    const start = await oauthStartGET(jsonReq(`/x?site=${site.id}&provider=hubspot`));
    expect(start.status).toBe(307);
    const loc = new URL(start.headers.get('location'));
    expect(loc.origin + loc.pathname).toBe('https://app.hubspot.com/oauth/authorize');
    expect(loc.searchParams.get('client_id')).toBe('cid-123');
    expect(loc.searchParams.get('scope')).toBe('crm.objects.contacts.read crm.objects.contacts.write');   // least privilege
    expect(loc.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/integrations/oauth/callback');
    const state = loc.searchParams.get('state');

    const calls = fakeNet([[/oauth\/v1\/token/, (u, init) => ({ status: 200, json: { access_token: 'at-LIVE-1', refresh_token: 'rt-1', expires_in: 1800 } })], [/crm\/v3\/objects\/contacts/, (u, init) => ({ status: init.headers.authorization === 'Bearer at-LIVE-1' ? 200 : 401, json: {} })]]);
    // someone else cannot complete this person's flow
    const other = await owner((await seedSite('Bravo Plumbing')).project, 'b@bravo.test');
    await signIn(other);
    const stolen = await oauthCallbackGET(jsonReq(`/x?code=abc&state=${encodeURIComponent(state)}`));
    expect(stolen.headers.get('location')).toMatch(/integration_error=/);
    expect(await getInstance(site.id, 'hubspot')).toBeNull();
    // a forged state is rejected
    await signIn(me);
    expect((await oauthCallbackGET(jsonReq('/x?code=abc&state=forged.sig'))).headers.get('location')).toMatch(/integration_error=/);
    const done = await oauthCallbackGET(jsonReq(`/x?code=abc&state=${encodeURIComponent(state)}`));
    expect(done.headers.get('location')).toBe(`http://localhost:3000/dashboard/site/${site.id}/integrations?connected=hubspot`);
    expect(calls.find(c => /token/.test(c.url)).body).toContain('client_secret=csecret-XYZ');
    const inst = await getInstance(site.id, 'hubspot', { withSecrets: true });
    expect(inst.status).toBe('connected');
    expect(inst.secrets.accessToken).toBe('at-LIVE-1');
    expect((await sql`SELECT secrets FROM integration_instances WHERE provider = 'hubspot'`)[0].secrets).not.toContain('at-LIVE-1');
  });
});
