// Publishing a structured site end to end:
//   1. publish to the platform preview channel (atomic pointer move)
//   2. keep the existing project/funnel record in sync (preview URL, status,
//      portfolio listing, first-publish email)
//   3. if the site is already live on its own domain, redeploy it there
//
// Step 3 failing never affects step 1 or the currently live deployment: Vercel
// keeps serving the previous deployment until a new one is ready.
import { sql, getProject, getSettings, patchProject } from '../db.js';
import { categoryLabel } from '../projectModel.js';
import { launchSite } from '../deploy.js';
import { previewReady } from '../email.js';
import { getSite, publishSite, markLive, logEvent, getVersion, rollbackTo } from './store.js';
import { renderSite, vercelConfig } from './render.js';
import { isLegacyDoc, normalizeDoc } from './schema.js';
import { integrationRenderContext } from '../integrations/render.js';

function publishInfo(settings, slug, ts) {
  const base = settings.previewDomain ? `https://${String(settings.previewDomain).replace(/^https?:\/\//, '')}` : '';
  return { slug, previewUrl: `${base}/preview/${slug}/`, directUrl: `/preview/${slug}/`, portfolioUrl: `${base}/portfolio`, publishedAt: ts };
}

/** Files for a site's own domain (root-relative, canonical URLs, sitemap, redirects). */
export async function liveFiles(site, doc, { origin, domain, liveUrl }) {
  if (isLegacyDoc(doc)) return [{ file: 'index.html', data: doc.html }];
  const integ = await integrationRenderContext(site.id);
  const canonicalOrigin = domain ? `https://${domain}` : (liveUrl || '').replace(/\/$/, '');
  const out = renderSite(normalizeDoc(doc), { base: '/', origin, siteId: site.id, track: true, canonicalOrigin, integrations: integ.integrations, renderIntegration: integ.renderIntegration });
  const files = out.files.filter(f => f.path !== '_site.json').map(f => ({ file: f.path, data: f.content }));
  files.push({ file: 'vercel.json', data: vercelConfig(normalizeDoc(doc)) });
  return files;
}

/** Deploy a version of the site to its own Vercel project / domain. */
export async function deployLive(siteId, { versionId = null, domain = null, actorId = null, origin = '' } = {}) {
  const site = await getSite(siteId);
  if (!site) throw { status: 404, message: 'Site not found' };
  const project = await getProject(site.projectId);
  const settings = await getSettings();
  const vid = versionId || site.publishedVersionId;
  if (!vid) throw { status: 400, message: 'Publish the site before launching it.' };
  const version = await getVersion(vid);
  if (!version || version.siteId !== siteId) throw { status: 404, message: 'Version not found' };
  const projectName = project.launch?.projectName || 'wfl-' + site.slug;
  const useDomain = domain === null ? (project.launch?.domain || null) : (domain || null);
  const files = await liveFiles(site, version.doc, { origin, domain: useDomain, liveUrl: project.launch?.liveUrl });
  const res = await launchSite(settings, { projectName, files, domain: useDomain });
  await markLive(siteId, vid, { actorId, domain: useDomain || '', liveUrl: res.liveUrl });
  const launch = { ...res, projectName, launchedAt: Date.now(), versionId: vid };
  await patchProject(project.id, { launch, status: 'launched' });
  return launch;
}

/**
 * Publish the draft and keep everything that depends on it in step.
 * @returns {{ versionId, pages, publish, reviewUrl?, emailed, live }}
 */
export async function publishAndSync(siteId, { actor = null, role = 'staff', label = '', origin = '', notify = false } = {}) {
  const site = await getSite(siteId);
  if (!site) throw { status: 404, message: 'Site not found' };
  const project = await getProject(site.projectId);
  if (!project) throw { status: 404, message: 'Project not found' };
  const settings = await getSettings();
  const integ = await integrationRenderContext(siteId);
  const isLive = !!project.launch?.projectName && project.status === 'launched';
  const out = await publishSite(siteId, {
    actorId: actor?.id || null, label: label || (role === 'staff' ? 'Published by the studio' : 'Published by the owner'), origin,
    integrations: integ.integrations, renderIntegration: integ.renderIntegration,
    // Once a site has its own domain, the platform preview copy is kept out of search results.
    noindex: isLive && !!project.launch?.domain
  });

  // Keep the classic records in step: preview info, lifecycle status, portfolio row.
  const ts = Date.now();
  const publish = publishInfo(settings, site.slug, ts);
  const patch = { publish, siteId, siteEngine: isLegacyDoc(site.draft) ? project.siteEngine : 'v2' };
  if (!['approved', 'paid', 'launched'].includes(project.status)) patch.status = 'published';
  let emailed = false, reviewUrl = null;
  if (role === 'staff') {
    const token = project.reviewToken || (await import('crypto')).randomBytes(16).toString('hex');
    if (!project.reviewToken) patch.reviewToken = token;
    reviewUrl = `${origin}/review/${token}`;
    if (project.business?.email && !['paid', 'launched'].includes(project.status) && (notify || !project.previewEmailedAt)) {
      previewReady(project.business.email, project.business.name, reviewUrl).catch(() => {});
      patch.previewEmailedAt = ts;
      emailed = true;
    }
  }
  await patchProject(project.id, patch);
  const home = await sql`SELECT content FROM site_files WHERE version_id = ${out.versionId} AND path = 'index.html'`;
  await sql`INSERT INTO previews (slug, business_name, html, published_at, category)
            VALUES (${site.slug}, ${project.business?.name || 'Website'}, ${home[0]?.content || ''}, ${ts}, ${categoryLabel(project.business?.type)})
            ON CONFLICT (slug) DO UPDATE SET business_name = EXCLUDED.business_name, html = EXCLUDED.html, published_at = EXCLUDED.published_at, category = EXCLUDED.category`;

  // Already launched on its own domain → push the new version there too.
  let live = null;
  if (isLive) {
    try {
      const launch = await deployLive(siteId, { versionId: out.versionId, actorId: actor?.id || null, origin });
      live = { ok: true, url: launch.domain ? `https://${launch.domain}` : launch.liveUrl };
    } catch (e) {
      live = { ok: false, error: 'Your changes are saved and published to the preview, but updating the live domain did not finish. The previous live version is still online. Try publishing again in a few minutes.' };
      await logEvent(siteId, 'deploy.failed', actor?.id || null, { error: String(e.message || e).slice(0, 300), versionId: out.versionId });
    }
  }
  return { versionId: out.versionId, previous: out.previous, pages: out.pages, publish, reviewUrl, emailed, live };
}

/** Roll back the published site, and the live domain with it if there is one. */
export async function rollbackAndSync(siteId, versionId, { actor = null, origin = '' } = {}) {
  const integ = await integrationRenderContext(siteId);
  const out = await rollbackTo(siteId, versionId, { actorId: actor?.id || null, origin, integrations: integ.integrations, renderIntegration: integ.renderIntegration });
  const site = await getSite(siteId);
  const project = await getProject(site.projectId);
  let live = null;
  if (project?.launch?.projectName && project.status === 'launched') {
    try { const launch = await deployLive(siteId, { versionId, actorId: actor?.id || null, origin }); live = { ok: true, url: launch.domain ? `https://${launch.domain}` : launch.liveUrl }; }
    catch (e) { live = { ok: false, error: 'The preview was rolled back, but the live domain could not be updated. It is still showing the previous version.' }; await logEvent(siteId, 'deploy.failed', actor?.id || null, { error: String(e.message || e).slice(0, 300), versionId }); }
  }
  const home = await sql`SELECT content FROM site_files WHERE version_id = ${versionId} AND path = 'index.html'`;
  if (home[0]) await sql`UPDATE previews SET html = ${home[0].content}, published_at = ${Date.now()} WHERE slug = ${site.slug}`;
  return { ...out, live };
}
