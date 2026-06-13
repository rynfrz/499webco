// Public: serve a published preview's raw HTML at /preview/<slug>/.
import { sql, initDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  await initDb();
  const rows = await sql`SELECT html FROM previews WHERE slug = ${params.slug}`;
  if (!rows[0]) {
    return new Response('<!doctype html><meta charset="utf-8"><title>Not found</title><body style="font-family:sans-serif;padding:40px">Preview not found.</body>', {
      status: 404, headers: { 'content-type': 'text/html; charset=utf-8' }
    });
  }
  return new Response(rows[0].html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' }
  });
}
