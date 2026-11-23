// Persistence for structured websites: drafts, immutable versions, rendered
// files, publishing and rollback.
//
// Safety model
//   - `draft` is the only thing editors change.
//   - Publishing renders the draft into a NEW version + files first; only when
//     that fully succeeds does one UPDATE move `published_version_id`.
//     A failed render or insert leaves the live site exactly as it was.
//   - Rollback is the same pointer move, back to an earlier version.
//   - A pre-2.0 single-page site is stored as a 'legacy' version, so it sits in
//     the same history and can be restored at any time.
import { sql, tx, initDb } from '../db.js';
import { newId } from '../auth.js';
import { slugify as projectSlug } from '../projectModel.js';
import { sanitizeDoc } from './clean.js';
import { validateDoc, isLegacyDoc, legacyDoc, normalizeDoc, outline } from './schema.js';
import { renderSite } from './render.js';

export class ConflictError extends Error {
  constructor(message) { super(message); this.name = 'ConflictError'; this.status = 409; }
}
export class ValidationError extends Error {
  constructor(message, errors = []) { super(message); this.name = 'ValidationError'; this.status = 400; this.errors = errors; }
}

function rowToSite(r) {
  if (!r) return null;
  return {
    id: r.id, projectId: r.project_id, slug: r.slug, status: r.status, draft: r.draft, draftRev: r.draft_rev, draftDirty: !!r.draft_dirty,
    publishedVersionId: r.published_version_id, liveVersionId: r.live_version_id, stagingVersionId: r.staging_version_id,
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at)
  };
}

export async function getSite(id) {
  await initDb();
  const rows = await sql`SELECT * FROM sites WHERE id = ${id}`;
  return rowToSite(rows[0]);
}
export async function getSiteByProject(projectId) {
  await initDb();
  const rows = await sql`SELECT * FROM sites WHERE project_id = ${projectId}`;
  return rowToSite(rows[0]);
}
export async function getSiteBySlug(slug) {
  await initDb();
  const rows = await sql`SELECT * FROM sites WHERE slug = ${slug}`;
  return rowToSite(rows[0]);
}

/** Lightweight site record (no draft blob) for lists and dashboards. */
export async function getSiteMeta(id) {
  await initDb();
  const rows = await sql`SELECT id, project_id, slug, status, draft_rev, draft_dirty, published_version_id, live_version_id, staging_version_id, created_at, updated_at FROM sites WHERE id = ${id}`;
  return rowToSite(rows[0]);
}

export async function logEvent(siteId, type, actorId, detail = {}) {
  await sql`INSERT INTO site_events (id, site_id, type, actor_id, detail, created_at)
            VALUES (${newId('ev')}, ${siteId}, ${type}, ${actorId || null}, ${JSON.stringify(detail)}::jsonb, ${Date.now()})`;
}

async function uniqueSlug(base, projectId) {
  let slug = base || 'business', n = 2;
  for (;;) {
    const rows = await sql`SELECT project_id FROM sites WHERE slug = ${slug}`;
    if (!rows.length || rows[0].project_id === projectId) return slug;
    slug = `${base}-${n++}`;
  }
}

async function insertVersion(siteId, kind, doc, { label = '', createdBy = null, meta = {} } = {}) {
  const id = newId('v');
  await sql`INSERT INTO site_versions (id, site_id, kind, label, doc, meta, created_by, created_at)
            VALUES (${id}, ${siteId}, ${kind}, ${String(label).slice(0, 200)}, ${JSON.stringify(doc)}::jsonb, ${JSON.stringify(meta)}::jsonb, ${createdBy}, ${Date.now()})`;
  return id;
}

async function writeFiles(versionId, files) {
  // Batched in one transaction so a version never has a partial file set.
  await tx(q => files.map(f => q`INSERT INTO site_files (version_id, path, content, content_type)
                                 VALUES (${versionId}, ${f.path}, ${f.content}, ${f.contentType})
                                 ON CONFLICT (version_id, path) DO UPDATE SET content = EXCLUDED.content, content_type = EXCLUDED.content_type`));
}

function previewCtx(site, opts = {}) {
  return {
    base: `/preview/${site.slug}/`,
    stripTrailingSlash: true,
    origin: opts.origin || '',
    siteId: site.id,
    track: true,
    noindex: !!opts.noindex,
    integrations: opts.integrations,
    renderIntegration: opts.renderIntegration
  };
}

/**
 * Make sure a project has a site record. For a project that already has a
 * classic single-page site, that HTML becomes the site's first ('legacy')
 * version — and its published version, if the preview was live — so nothing
 * changes for visitors and there is always something to roll back to.
 */
export async function ensureSite(project, { createdBy = null } = {}) {
  await initDb();
  const existing = await getSiteByProject(project.id);
  if (existing) return existing;
  const base = project.publish?.slug || projectSlug(project.business?.name || '');
  const slug = await uniqueSlug(base, project.id);
  const id = newId('site');
  const now = Date.now();
  const hasLegacy = !!project.generatedHtml;
  const draft = hasLegacy ? legacyDoc(project.generatedHtml, { businessName: project.business?.name || '' }) : normalizeDoc({ meta: { businessName: project.business?.name || '' } });
  await sql`INSERT INTO sites (id, project_id, slug, status, draft, draft_rev, draft_dirty, created_at, updated_at)
            VALUES (${id}, ${project.id}, ${slug}, ${hasLegacy ? 'legacy' : 'empty'}, ${JSON.stringify(draft)}::jsonb, 1, FALSE, ${now}, ${now})
            ON CONFLICT (project_id) DO NOTHING`;
  const site = await getSiteByProject(project.id);
  if (site.id !== id) return site; // lost a race: another request created it
  if (hasLegacy) {
    const vid = await insertVersion(id, 'legacy', draft, { label: 'Original single-page site', createdBy, meta: { source: 'pre-2.0' } });
    await writeFiles(vid, renderSite(draft).files);
    if (project.publish) await sql`UPDATE sites SET published_version_id = ${vid} WHERE id = ${id}`;
    await logEvent(id, 'site.created', createdBy, { from: 'legacy', published: !!project.publish });
  } else {
    await logEvent(id, 'site.created', createdBy, { from: 'new' });
  }
  return getSite(id);
}

/**
 * Save the working draft. `expectedRev` gives optimistic concurrency so two
 * editors cannot silently overwrite each other.
 */
export async function saveDraft(siteId, doc, { expectedRev = null, actorId = null, status = null, validate = true } = {}) {
  const clean = sanitizeDoc(doc);
  if (validate) {
    const v = validateDoc(clean);
    if (!v.ok) throw new ValidationError(v.errors[0] || 'The site is not valid.', v.errors);
  }
  const now = Date.now();
  const json = JSON.stringify(clean);
  const rows = expectedRev == null
    ? await sql`UPDATE sites SET draft = ${json}::jsonb, draft_rev = draft_rev + 1, draft_dirty = TRUE, status = COALESCE(${status}, CASE WHEN status IN ('empty','legacy') THEN 'draft' ELSE status END), updated_at = ${now}
                WHERE id = ${siteId} RETURNING draft_rev`
    : await sql`UPDATE sites SET draft = ${json}::jsonb, draft_rev = draft_rev + 1, draft_dirty = TRUE, status = COALESCE(${status}, CASE WHEN status IN ('empty','legacy') THEN 'draft' ELSE status END), updated_at = ${now}
                WHERE id = ${siteId} AND draft_rev = ${expectedRev} RETURNING draft_rev`;
  if (!rows.length) {
    const s = await getSiteMeta(siteId);
    if (!s) throw new ValidationError('Site not found');
    throw new ConflictError('This site was changed somewhere else. Reload to get the latest version before saving again.');
  }
  return { rev: rows[0].draft_rev, doc: clean };
}

export async function createVersion(siteId, kind, doc, opts = {}) {
  return insertVersion(siteId, kind, isLegacyDoc(doc) ? doc : sanitizeDoc(doc), opts);
}

export async function getVersion(id) {
  const rows = await sql`SELECT id, site_id, kind, label, doc, meta, created_by, created_at FROM site_versions WHERE id = ${id}`;
  const r = rows[0];
  return r ? { id: r.id, siteId: r.site_id, kind: r.kind, label: r.label, doc: r.doc, meta: r.meta, createdBy: r.created_by, createdAt: Number(r.created_at) } : null;
}

export async function listVersions(siteId, { limit = 60 } = {}) {
  const rows = await sql`SELECT v.id, v.kind, v.label, v.meta, v.created_by, v.created_at, u.full_name, u.username
                         FROM site_versions v LEFT JOIN users u ON u.id = v.created_by
                         WHERE v.site_id = ${siteId} ORDER BY v.created_at DESC LIMIT ${limit}`;
  return rows.map(r => ({ id: r.id, kind: r.kind, label: r.label, meta: r.meta, createdBy: r.created_by, createdByName: r.full_name || r.username || '', createdAt: Number(r.created_at) }));
}

export async function listEvents(siteId, { limit = 80 } = {}) {
  const rows = await sql`SELECT e.id, e.type, e.detail, e.actor_id, e.created_at, u.full_name, u.username
                         FROM site_events e LEFT JOIN users u ON u.id = e.actor_id
                         WHERE e.site_id = ${siteId} ORDER BY e.created_at DESC LIMIT ${limit}`;
  return rows.map(r => ({ id: r.id, type: r.type, detail: r.detail, actorId: r.actor_id, actor: r.full_name || r.username || '', at: Number(r.created_at) }));
}

/** Keep history bounded: rendered files only for the most recent versions. */
async function prune(siteId, keepIds = []) {
  const rows = await sql`SELECT id, kind FROM site_versions WHERE site_id = ${siteId} ORDER BY created_at DESC`;
  const keep = new Set(keepIds.filter(Boolean));
  const withFiles = rows.filter(r => r.kind === 'publish' || r.kind === 'legacy').slice(0, 8).map(r => r.id);
  for (const id of withFiles) keep.add(id);
  for (const r of rows) {
    if (keep.has(r.id)) continue;
    await sql`DELETE FROM site_files WHERE version_id = ${r.id}`;
  }
  // Autosave-style snapshots beyond the newest 40 are dropped entirely.
  const old = rows.filter(r => r.kind === 'snapshot').slice(40);
  for (const r of old) if (!keep.has(r.id)) await sql`DELETE FROM site_versions WHERE id = ${r.id}`;
}

/**
 * Publish the current draft (or a given doc) to the preview channel.
 * Returns { versionId, pages }. Throws without touching the live site if the
 * document is invalid or rendering fails.
 */
export async function publishSite(siteId, { actorId = null, label = '', origin = '', doc = null, integrations, renderIntegration, noindex = false, kind = 'publish' } = {}) {
  const site = await getSite(siteId);
  if (!site) throw new ValidationError('Site not found');
  const source = doc || site.draft;
  const clean = isLegacyDoc(source) ? source : sanitizeDoc(source);
  const v = validateDoc(clean);
  if (!v.ok) throw new ValidationError('This site cannot be published yet: ' + v.errors[0], v.errors);
  // Render first. Any failure here leaves everything untouched.
  const out = renderSite(clean, previewCtx(site, { origin, integrations, renderIntegration, noindex }));
  if (!out.files.some(f => f.path === 'index.html')) throw new ValidationError('Rendering produced no home page.');
  const versionId = await insertVersion(siteId, kind, clean, { label: label || 'Published', createdBy: actorId, meta: { pages: out.pages.length, fromRev: site.draftRev } });
  await writeFiles(versionId, out.files);
  const previous = site.publishedVersionId;
  // The single atomic switch.
  const sameDraft = !doc;
  await sql`UPDATE sites SET published_version_id = ${versionId}, status = 'published',
                             draft_dirty = CASE WHEN ${sameDraft} AND draft_rev = ${site.draftRev} THEN FALSE ELSE draft_dirty END,
                             updated_at = ${Date.now()}
            WHERE id = ${siteId}`;
  await logEvent(siteId, 'site.published', actorId, { versionId, previous, pages: out.pages.length, label });
  await prune(siteId, [versionId, previous, site.liveVersionId, site.stagingVersionId]);
  return { versionId, previous, pages: out.pages, legacy: out.legacy };
}

/** Make sure a version has rendered files (re-render if they were pruned). */
async function ensureFiles(site, version, opts = {}) {
  const rows = await sql`SELECT 1 FROM site_files WHERE version_id = ${version.id} LIMIT 1`;
  if (rows.length) return;
  const out = renderSite(version.doc, previewCtx(site, opts));
  await writeFiles(version.id, out.files);
}

/**
 * Roll the published site back (or forward) to any earlier version.
 * `restoreDraft` also loads that version into the editor.
 */
export async function rollbackTo(siteId, versionId, { actorId = null, origin = '', restoreDraft = true, integrations, renderIntegration } = {}) {
  const site = await getSite(siteId);
  const version = await getVersion(versionId);
  if (!site || !version || version.siteId !== siteId) throw new ValidationError('Version not found');
  const v = validateDoc(version.doc);
  if (!v.ok) throw new ValidationError('That version cannot be published: ' + v.errors[0], v.errors);
  await ensureFiles(site, version, { origin, integrations, renderIntegration });
  const previous = site.publishedVersionId;
  if (restoreDraft) {
    // Keep what was in the editor, so a rollback can itself be undone.
    await insertVersion(siteId, 'snapshot', site.draft, { label: 'Before rollback', createdBy: actorId, meta: { auto: true } });
    await sql`UPDATE sites SET draft = ${JSON.stringify(version.doc)}::jsonb, draft_rev = draft_rev + 1, draft_dirty = FALSE,
                               published_version_id = ${versionId}, status = ${isLegacyDoc(version.doc) ? 'legacy' : 'published'}, updated_at = ${Date.now()}
              WHERE id = ${siteId}`;
  } else {
    await sql`UPDATE sites SET published_version_id = ${versionId}, updated_at = ${Date.now()} WHERE id = ${siteId}`;
  }
  await logEvent(siteId, 'site.rolled_back', actorId, { versionId, previous, label: version.label });
  return { versionId, previous };
}

/** Load an earlier version into the draft only (nothing public changes). */
export async function restoreDraftFrom(siteId, versionId, { actorId = null } = {}) {
  const site = await getSite(siteId);
  const version = await getVersion(versionId);
  if (!site || !version || version.siteId !== siteId) throw new ValidationError('Version not found');
  await insertVersion(siteId, 'snapshot', site.draft, { label: 'Before restore', createdBy: actorId, meta: { auto: true } });
  const rows = await sql`UPDATE sites SET draft = ${JSON.stringify(version.doc)}::jsonb, draft_rev = draft_rev + 1, draft_dirty = TRUE, updated_at = ${Date.now()}
                         WHERE id = ${siteId} RETURNING draft_rev`;
  await logEvent(siteId, 'draft.restored', actorId, { versionId, label: version.label });
  return { rev: rows[0].draft_rev };
}

/** Snapshot the current draft (used before any automated change). */
export async function snapshotDraft(siteId, label, { actorId = null, meta = {} } = {}) {
  const site = await getSite(siteId);
  if (!site) throw new ValidationError('Site not found');
  return insertVersion(siteId, 'snapshot', site.draft, { label, createdBy: actorId, meta });
}

/** Store an upgrade result for review without touching draft or published. */
export async function stageVersion(siteId, doc, { label = 'Upgrade (staging)', actorId = null, meta = {} } = {}) {
  const clean = sanitizeDoc(doc);
  const v = validateDoc(clean);
  if (!v.ok) throw new ValidationError('The upgraded site is not valid: ' + v.errors[0], v.errors);
  const id = await insertVersion(siteId, 'staging', clean, { label, createdBy: actorId, meta });
  await sql`UPDATE sites SET staging_version_id = ${id}, updated_at = ${Date.now()} WHERE id = ${siteId}`;
  await logEvent(siteId, 'upgrade.staged', actorId, { versionId: id, label, ...meta });
  return id;
}

/** Approve a staged upgrade: snapshot what exists, then make it the draft. */
export async function approveStaging(siteId, { actorId = null } = {}) {
  const site = await getSite(siteId);
  if (!site?.stagingVersionId) throw new ValidationError('There is no staged upgrade to approve.');
  const staged = await getVersion(site.stagingVersionId);
  if (!staged) throw new ValidationError('The staged upgrade could not be found.');
  const snapshotId = await insertVersion(siteId, 'snapshot', site.draft, { label: 'Before upgrade', createdBy: actorId, meta: { beforeUpgrade: true, upgrade: staged.meta?.upgradeType || null } });
  await sql`UPDATE sites SET draft = ${JSON.stringify(staged.doc)}::jsonb, draft_rev = draft_rev + 1, draft_dirty = TRUE, staging_version_id = NULL,
                             status = CASE WHEN published_version_id IS NULL THEN 'draft' ELSE status END, updated_at = ${Date.now()}
            WHERE id = ${siteId}`;
  await logEvent(siteId, 'upgrade.approved', actorId, { versionId: staged.id, snapshotId });
  return { snapshotId, versionId: staged.id };
}

export async function discardStaging(siteId, { actorId = null } = {}) {
  const site = await getSiteMeta(siteId);
  if (!site?.stagingVersionId) return;
  await sql`UPDATE sites SET staging_version_id = NULL, updated_at = ${Date.now()} WHERE id = ${siteId}`;
  await logEvent(siteId, 'upgrade.discarded', actorId, { versionId: site.stagingVersionId });
}

export async function markLive(siteId, versionId, { actorId = null, domain = '', liveUrl = '' } = {}) {
  await sql`UPDATE sites SET live_version_id = ${versionId}, status = 'live', updated_at = ${Date.now()} WHERE id = ${siteId}`;
  await logEvent(siteId, 'site.deployed', actorId, { versionId, domain, liveUrl });
}

/**
 * Resolve a public request for /preview/<slug>/<path>.
 * Returns { status, content, contentType } | { redirect } | null (no structured site published).
 */
export async function servePublished(slug, pathParts = []) {
  await initDb();
  const rows = await sql`SELECT id, published_version_id FROM sites WHERE slug = ${slug}`;
  const site = rows[0];
  if (!site?.published_version_id) return null;
  const vid = site.published_version_id;
  const rel = pathParts.filter(Boolean).map(p => String(p)).join('/');
  if (rel.includes('..')) return { status: 404, content: 'Not found', contentType: 'text/plain' };
  const candidates = rel === '' ? ['index.html'] : /\.[a-z0-9]{2,5}$/i.test(rel) ? [rel] : [`${rel}/index.html`];
  for (const path of candidates) {
    const f = await sql`SELECT content, content_type FROM site_files WHERE version_id = ${vid} AND path = ${path}`;
    if (f.length) return { status: 200, content: f[0].content, contentType: f[0].content_type, siteId: site.id, versionId: vid, path };
  }
  const meta = await sql`SELECT content FROM site_files WHERE version_id = ${vid} AND path = '_site.json'`;
  if (meta.length) {
    try {
      const want = '/' + rel.replace(/\/$/, '') + '/';
      const hit = (JSON.parse(meta[0].content).redirects || []).find(r => r.from === want || r.from === want.replace(/\/$/, ''));
      if (hit) return { redirect: `/preview/${slug}${hit.to.replace(/\/$/, '') || ''}` };
    } catch {}
  }
  const nf = await sql`SELECT content, content_type FROM site_files WHERE version_id = ${vid} AND path = '404.html'`;
  if (nf.length) return { status: 404, content: nf[0].content, contentType: nf[0].content_type, siteId: site.id };
  return { status: 404, content: 'Not found', contentType: 'text/plain' };
}

/** Everything the admin "Sites" list needs, without loading draft blobs. */
export async function listSites() {
  await initDb();
  const rows = await sql`SELECT s.id, s.project_id, s.slug, s.status, s.draft_dirty, s.published_version_id, s.live_version_id, s.staging_version_id, s.updated_at,
                                s.draft->>'format' AS format, jsonb_array_length(COALESCE(s.draft->'pages', '[]'::jsonb)) AS pages,
                                p.data->'business'->>'name' AS business_name, p.data->>'status' AS project_status, p.data->'launch'->>'domain' AS domain
                         FROM sites s JOIN projects p ON p.id = s.project_id ORDER BY s.updated_at DESC`;
  return rows.map(r => ({
    id: r.id, projectId: r.project_id, slug: r.slug, status: r.status, draftDirty: !!r.draft_dirty, published: !!r.published_version_id, live: !!r.live_version_id,
    staged: !!r.staging_version_id, updatedAt: Number(r.updated_at), legacy: r.format === 'legacy-html', pages: Number(r.pages) || (r.format === 'legacy-html' ? 1 : 0),
    businessName: r.business_name || 'Untitled', projectStatus: r.project_status || '', domain: r.domain || ''
  }));
}

export { outline };
