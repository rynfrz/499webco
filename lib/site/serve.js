// Public serving of published sites at /preview/<slug>/<path>.
// A structured site is served from its published version's files; anything
// else falls back to the classic single-HTML preview, exactly as before.
import { sql, initDb } from '../db.js';
import { servePublished } from './store.js';
import { contentSecurityPolicy } from './render.js';
import { integrationRenderContext } from '../integrations/render.js';

const NOT_FOUND = '<!doctype html><meta charset="utf-8"><title>Not found</title><body style="font-family:sans-serif;padding:40px">Preview not found.</body>';

export async function servePreview(slug, pathParts = []) {
  await initDb();
  const hit = await servePublished(slug, pathParts);
  if (hit) {
    if (hit.redirect) return new Response(null, { status: 308, headers: { location: hit.redirect } });
    const headers = { 'content-type': hit.contentType, 'cache-control': hit.status === 200 ? (hit.path?.startsWith('assets/') ? 'public, max-age=86400' : 'public, max-age=60') : 'no-store' };
    if (hit.contentType.startsWith('text/html') && hit.siteId) {
      // Classic HTML stored as a version keeps running its own inline script, so it gets no CSP.
      const legacy = /<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>/i.test(hit.content);
      if (!legacy) {
        const integ = await integrationRenderContext(hit.siteId).catch(() => null);
        const csp = contentSecurityPolicy(integ?.csp || {});
        if (csp) headers['content-security-policy'] = csp;
      }
    }
    return new Response(hit.content, { status: hit.status, headers });
  }
  if (!pathParts.filter(Boolean).length) {
    const rows = await sql`SELECT html FROM previews WHERE slug = ${slug}`;
    if (rows[0]) return new Response(rows[0].html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' } });
  }
  return new Response(NOT_FOUND, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
