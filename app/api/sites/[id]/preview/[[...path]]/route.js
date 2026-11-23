// Authenticated multi-page preview rendered on the fly:
//   /api/sites/<id>/preview/draft/...      the working draft
//   /api/sites/<id>/preview/staging/...    a staged upgrade awaiting approval
//   /api/sites/<id>/preview/<versionId>/…  any stored version
// Nothing here is public; it is what administrators (and the owner) review
// before publishing.
import { siteAccess } from '@/lib/access';
import { getVersion } from '@/lib/site/store';
import { renderSite, contentSecurityPolicy } from '@/lib/site/render';
import { normalizeDoc, isLegacyDoc } from '@/lib/site/schema';
import { integrationsFor } from '@/lib/site/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function text(body, status = 200, type = 'text/html; charset=utf-8', extra = {}) {
  return new Response(body, { status, headers: { 'content-type': type, 'cache-control': 'no-store', 'x-robots-tag': 'noindex', ...extra } });
}

export async function GET(req, { params }) {
  let access;
  try { access = await siteAccess(params.id); }
  catch (e) { return text(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px">${e.status === 401 ? 'Please sign in to view this preview.' : 'Preview not found.'}</body>`, e.status || 404); }
  const { site, role } = access;
  const parts = params.path || [];
  const variant = parts[0] || 'draft';
  const rest = parts.slice(1).join('/');
  let doc;
  if (variant === 'draft') doc = site.draft;
  else {
    const vid = variant === 'staging' ? site.stagingVersionId : variant === 'published' ? site.publishedVersionId : variant;
    const v = vid ? await getVersion(vid) : null;
    if (!v || v.siteId !== site.id) return text('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px">That version is not available.</body>', 404);
    // Customers can look at what is published and at their own history; staged upgrades are for the studio to review.
    if (role !== 'staff' && (variant === 'staging' || !['publish', 'snapshot', 'legacy'].includes(v.kind))) return text('Not found', 404, 'text/plain');
    doc = v.doc;
  }
  const origin = new URL(req.url).origin;
  const base = `/api/sites/${site.id}/preview/${variant}/`;
  if (isLegacyDoc(doc)) return text(doc.html);
  const integ = await integrationsFor(site);
  const out = renderSite(normalizeDoc(doc), { base, stripTrailingSlash: true, origin, siteId: site.id, includeDrafts: variant === 'draft', noindex: true, integrations: integ.integrations, renderIntegration: integ.renderIntegration });
  const want = rest === '' ? 'index.html' : /\.[a-z0-9]{2,5}$/i.test(rest) ? rest : `${rest.replace(/\/$/, '')}/index.html`;
  const file = out.files.find(f => f.path === want);
  const csp = contentSecurityPolicy({ ...integ.csp, legacyScript: !!doc.settings?.legacyScript });
  const headers = csp ? { 'content-security-policy': csp } : {};
  if (!file) {
    const nf = out.files.find(f => f.path === '404.html');
    return text(nf ? nf.content : 'Not found', 404, 'text/html; charset=utf-8', headers);
  }
  return text(file.content, 200, file.contentType, file.contentType.startsWith('text/html') ? headers : {});
}
