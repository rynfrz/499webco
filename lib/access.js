// Authorisation for website resources.
//
// Staff (admin / designer) can reach every site. A customer can reach a site
// only through a membership row linking their account to that site's project.
// Every customer-facing route goes through siteAccess()/projectAccess(), so
// tenant isolation is enforced in one place.
import { sql, initDb } from './db.js';
import { requireSession, isStaff } from './auth.js';
import { getSite, getSiteMeta } from './site/store.js';

export class AccessError extends Error {
  constructor(message, status) { super(message); this.name = 'AccessError'; this.status = status; }
}

export async function membershipFor(userId, projectId) {
  await initDb();
  const rows = await sql`SELECT role FROM project_members WHERE user_id = ${userId} AND project_id = ${projectId}`;
  return rows[0]?.role || null;
}

/**
 * @returns {{ user, role: 'staff'|'owner'|'editor', projectId }}
 * Not-found and not-allowed look the same to a customer (404), so ids cannot be probed.
 */
export async function projectAccess(projectId, { staffOnly = false } = {}) {
  const user = await requireSession();
  if (isStaff(user)) return { user, role: 'staff', projectId };
  if (staffOnly) throw new AccessError('Staff access required', 403);
  const role = projectId ? await membershipFor(user.id, projectId) : null;
  if (!role) throw new AccessError('Not found', 404);
  return { user, role: role === 'editor' ? 'editor' : 'owner', projectId };
}

/** Load a site and check the caller may use it. `full` loads the draft too. */
export async function siteAccess(siteId, { full = true, staffOnly = false, ownerOnly = false } = {}) {
  const user = await requireSession();
  const site = full ? await getSite(siteId) : await getSiteMeta(siteId);
  if (isStaff(user)) {
    if (!site) throw new AccessError('Site not found', 404);
    return { user, role: 'staff', site };
  }
  if (staffOnly) throw new AccessError('Staff access required', 403);
  const role = site ? await membershipFor(user.id, site.projectId) : null;
  if (!role) throw new AccessError('Not found', 404);
  if (ownerOnly && role !== 'owner') throw new AccessError('Only the account owner can do that.', 403);
  return { user, role: role === 'editor' ? 'editor' : 'owner', site };
}

/** The projects (with their site ids) a customer belongs to. */
export async function projectsForUser(userId) {
  await initDb();
  const rows = await sql`SELECT m.project_id, m.role, p.data->'business'->>'name' AS name, p.data->>'status' AS status, s.id AS site_id, s.slug
                         FROM project_members m JOIN projects p ON p.id = m.project_id LEFT JOIN sites s ON s.project_id = m.project_id
                         WHERE m.user_id = ${userId} ORDER BY m.created_at`;
  return rows.map(r => ({ projectId: r.project_id, role: r.role, name: r.name || 'Your website', status: r.status || '', siteId: r.site_id || null, slug: r.slug || null }));
}

/** Uniform JSON error response for route handlers. */
export function errorResponse(e) {
  const status = e?.status || 500;
  const message = status === 500 ? (e?.message || 'Something went wrong') : e.message;
  return Response.json({ error: message, ...(e?.errors ? { details: e.errors } : {}) }, { status });
}
