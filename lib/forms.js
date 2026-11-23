// Website form submissions (contact, quote request, newsletter).
//
// Generated sites post here from the browser — from the platform preview and
// from customers' own domains — so the endpoint is public and CORS-enabled.
// Every submission is validated, rate limited, stored, emailed to the business
// and handed to the site's connected integrations (CRM, email list, webhook).
// No credentials ever appear in page code: delivery happens server-side.
import { sql, initDb, getProject } from './db.js';
import { newId } from './auth.js';
import { getSiteMeta } from './site/store.js';
import { formSubmission } from './email.js';
import { deliverToIntegrations } from './integrations/delivery.js';

const MAX_FIELDS = 30;
const FORM_NAMES = { contact: 'contact', quote: 'quote request', newsletter: 'newsletter signup', booking: 'booking request' };

export function cleanSubmission(body) {
  const raw = body && typeof body.fields === 'object' && body.fields ? body.fields : {};
  // Honeypot: real people never fill this hidden field.
  if (raw.company_website) return { spam: true };
  const fields = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (n >= MAX_FIELDS) break;
    const key = String(k).replace(/[^\w \-]/g, '').slice(0, 40).trim();
    if (!key || key === 'company_website') continue;
    const val = String(v ?? '').replace(/\u0000/g, '').slice(0, 4000).trim();
    if (!val) continue;
    fields[key] = val; n++;
  }
  const email = fields.email || fields.Email || '';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'Please enter a valid email address.' };
  if (!Object.keys(fields).length) return { error: 'Please fill in the form.' };
  const text = Object.values(fields).join(' ');
  // Cheap link-spam filter: lots of URLs in a contact message is almost never a customer.
  if ((text.match(/https?:\/\//gi) || []).length > 3) return { spam: true };
  const form = String(body.form || 'contact').replace(/[^\w\-]/g, '').slice(0, 30) || 'contact';
  return { fields, form, page: String(body.page || '').slice(0, 200) };
}

/**
 * Store and deliver one submission.
 * @returns {{ ok: true, id }}  (spam is accepted silently and discarded)
 */
export async function handleSubmission(siteId, body) {
  await initDb();
  const site = await getSiteMeta(siteId);
  if (!site) throw { status: 404, message: 'This form is not available.' };
  const clean = cleanSubmission(body);
  if (clean.error) throw { status: 400, message: clean.error };
  if (clean.spam) return { ok: true, id: null };
  const project = await getProject(site.projectId);
  const rows = await sql`SELECT draft->'settings'->>'formRecipient' AS recipient FROM sites WHERE id = ${siteId}`;
  const recipient = rows[0]?.recipient || project?.business?.email || '';
  const id = newId('fs');
  const delivery = { email: null, integrations: [] };
  if (recipient) {
    const r = await formSubmission(recipient, project?.business?.name, FORM_NAMES[clean.form] || clean.form, clean.fields, clean.page).catch(e => ({ error: e.message }));
    delivery.email = r?.ok ? 'sent' : r?.skipped ? 'not_configured' : 'failed';
  } else delivery.email = 'no_recipient';
  try { delivery.integrations = await deliverToIntegrations(siteId, { id, form: clean.form, page: clean.page, fields: clean.fields, businessName: project?.business?.name || '' }); }
  catch (e) { delivery.integrations = [{ provider: 'unknown', ok: false, error: String(e.message || e).slice(0, 200) }]; }
  await sql`INSERT INTO form_submissions (id, site_id, form_key, page, data, delivery, created_at)
            VALUES (${id}, ${siteId}, ${clean.form}, ${clean.page}, ${JSON.stringify(clean.fields)}::jsonb, ${JSON.stringify(delivery)}::jsonb, ${Date.now()})`;
  return { ok: true, id };
}

export async function listSubmissions(siteId, { limit = 100 } = {}) {
  await initDb();
  const rows = await sql`SELECT id, form_key, page, data, delivery, created_at FROM form_submissions WHERE site_id = ${siteId} ORDER BY created_at DESC LIMIT ${limit}`;
  return rows.map(r => ({ id: r.id, form: r.form_key, page: r.page, fields: r.data, delivery: r.delivery, at: Number(r.created_at) }));
}

export async function formStats(siteId) {
  await initDb();
  const since = Date.now() - 30 * 86400000;
  const rows = await sql`SELECT COUNT(*)::int AS total, COALESCE(MAX(created_at), 0) AS last, COUNT(*) FILTER (WHERE created_at > ${since})::int AS recent FROM form_submissions WHERE site_id = ${siteId}`;
  return { total: rows[0].total, last30: rows[0].recent, lastAt: Number(rows[0].last) || null };
}
