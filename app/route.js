// Public site root (499web.co) — serves the premium marketing homepage.
// Brand images live in /public/brand/. The tool is at /admin; work at /portfolio.
import { HOMEPAGE_HTML } from '@/lib/homepage';

export const dynamic = 'force-static';

export async function GET() {
  return new Response(HOMEPAGE_HTML, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' }
  });
}
