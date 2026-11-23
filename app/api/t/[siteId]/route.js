// Public page-view beacon for generated websites. Cookie-less and anonymous:
// it only increments a per-day, per-page counter.
import { sql, initDb } from '@/lib/db';
import { rateLimit, clientIp } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };

export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

export async function POST(req, { params }) {
  try {
    const ua = req.headers.get('user-agent') || '';
    if (/bot|crawl|spider|slurp|headless|preview|monitor|lighthouse/i.test(ua)) return new Response(null, { status: 204, headers: CORS });
    const text = (await req.text()).slice(0, 600);
    let path = '/';
    try { path = String(JSON.parse(text).p || '/'); } catch {}
    path = path.split('?')[0].split('#')[0].replace(/[^\w\-/.]/g, '').slice(0, 120) || '/';
    const siteId = String(params.siteId).slice(0, 40);
    await initDb();
    await rateLimit(`pv:${clientIp(req)}`, 300, 3600);   // throws when exceeded; the catch below makes that a silent no-op
    const day = new Date().toISOString().slice(0, 10);
    // Only count pages of sites that exist (the join makes an unknown id a no-op).
    await sql`INSERT INTO site_pageviews (site_id, day, path, views)
              SELECT id, ${day}, ${path}, 1 FROM sites WHERE id = ${siteId}
              ON CONFLICT (site_id, day, path) DO UPDATE SET views = site_pageviews.views + 1`;
  } catch {}
  return new Response(null, { status: 204, headers: CORS });
}
