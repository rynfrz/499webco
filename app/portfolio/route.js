import { sql, initDb } from '@/lib/db';
import { portfolioHtml } from '@/lib/portfolio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  await initDb();
  const rows = await sql`SELECT slug, business_name, category FROM previews ORDER BY published_at DESC`;
  return new Response(portfolioHtml(rows), { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
