// Persistence for integration instances (one row per site + provider).
// Secrets are encrypted at rest and never returned to a browser.
import { sql, initDb } from '../db.js';
import { newId } from '../auth.js';
import { encryptJson, decryptJson } from '../crypto.js';

function rowTo(r, withSecrets = false) {
  const out = {
    id: r.id, siteId: r.site_id, provider: r.provider, status: r.status, config: r.config || {}, error: r.error || '',
    lastCheckedAt: r.last_checked_at ? Number(r.last_checked_at) : null, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
    hasSecrets: !!r.secrets
  };
  if (withSecrets) out.secrets = r.secrets ? decryptJson(r.secrets) : {};
  return out;
}

export async function listInstances(siteId) {
  await initDb();
  const rows = await sql`SELECT * FROM integration_instances WHERE site_id = ${siteId} ORDER BY created_at`;
  return rows.map(r => rowTo(r));
}

export async function getInstance(siteId, provider, { withSecrets = false } = {}) {
  await initDb();
  const rows = await sql`SELECT * FROM integration_instances WHERE site_id = ${siteId} AND provider = ${provider}`;
  return rows[0] ? rowTo(rows[0], withSecrets) : null;
}

export async function upsertInstance(siteId, provider, { status, config = {}, secrets = null, error = '', actorId = null }) {
  await initDb();
  const now = Date.now();
  const existing = await getInstance(siteId, provider, { withSecrets: true });
  const enc = secrets == null ? null : (Object.keys(secrets).length ? encryptJson(secrets) : '');
  if (existing) {
    if (enc == null) {
      await sql`UPDATE integration_instances SET status = ${status}, config = ${JSON.stringify(config)}::jsonb, error = ${String(error).slice(0, 500)}, last_checked_at = ${now}, updated_at = ${now} WHERE id = ${existing.id}`;
    } else {
      await sql`UPDATE integration_instances SET status = ${status}, config = ${JSON.stringify(config)}::jsonb, secrets = ${enc}, error = ${String(error).slice(0, 500)}, last_checked_at = ${now}, updated_at = ${now} WHERE id = ${existing.id}`;
    }
  } else {
    await sql`INSERT INTO integration_instances (id, site_id, provider, status, config, secrets, error, last_checked_at, created_by, created_at, updated_at)
              VALUES (${newId('int')}, ${siteId}, ${provider}, ${status}, ${JSON.stringify(config)}::jsonb, ${enc || ''}, ${String(error).slice(0, 500)}, ${now}, ${actorId}, ${now}, ${now})`;
  }
  return getInstance(siteId, provider);
}

export async function setInstanceStatus(siteId, provider, status, error = '') {
  await sql`UPDATE integration_instances SET status = ${status}, error = ${String(error).slice(0, 500)}, last_checked_at = ${Date.now()}, updated_at = ${Date.now()} WHERE site_id = ${siteId} AND provider = ${provider}`;
}

export async function deleteInstance(siteId, provider) {
  await initDb();
  await sql`DELETE FROM integration_instances WHERE site_id = ${siteId} AND provider = ${provider}`;
}

export async function allInstances({ onlyErrors = false } = {}) {
  await initDb();
  const rows = onlyErrors
    ? await sql`SELECT i.*, s.slug, p.data->'business'->>'name' AS business_name FROM integration_instances i JOIN sites s ON s.id = i.site_id JOIN projects p ON p.id = s.project_id WHERE i.status = 'error' ORDER BY i.updated_at DESC LIMIT 200`
    : await sql`SELECT i.*, s.slug, p.data->'business'->>'name' AS business_name FROM integration_instances i JOIN sites s ON s.id = i.site_id JOIN projects p ON p.id = s.project_id ORDER BY i.updated_at DESC LIMIT 500`;
  return rows.map(r => ({ ...rowTo(r), slug: r.slug, businessName: r.business_name || '' }));
}
