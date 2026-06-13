// Public site root. Resolution order:
//   1. Settings → "Homepage preview slug" set → serve that studio-built preview.
//   2. brand.homepageMode === 'custom' → serve the hand-built lib/homepage.js.
//   3. otherwise → serve the clean, brand-driven default homepage.
import { getSettings, sql, initDb } from '@/lib/db';
import { brand } from '@/lib/brand';
import { HOMEPAGE_HTML } from '@/lib/homepage';
import { defaultHomepageHtml } from '@/lib/defaultHomepage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const s = await getSettings();
    if (s.homepageSlug) {
      await initDb();
      const rows = await sql`SELECT html FROM previews WHERE slug = ${s.homepageSlug}`;
      if (rows[0]?.html) {
        return new Response(rows[0].html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=120' } });
      }
    }
  } catch {}
  const html = brand.homepageMode === 'custom' ? HOMEPAGE_HTML : defaultHomepageHtml();
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
