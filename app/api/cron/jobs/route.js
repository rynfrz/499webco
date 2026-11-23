// Optional: resume generation jobs that nobody is currently driving (for
// example the browser tab was closed mid-build). Call it from any scheduler
// (Vercel Cron, an uptime pinger) with `Authorization: Bearer <CRON_SECRET>`.
// Without CRON_SECRET set, the endpoint is disabled.
import { sql, initDb } from '@/lib/db';
import { runJob } from '@/lib/gen/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 800;   // the Pro + Fluid compute maximum
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Not found', { status: 404 });
  await initDb();
  const now = Date.now();
  // Running jobs with no live lease that have been idle for over two minutes.
  const rows = await sql`SELECT id FROM jobs WHERE status = 'running' AND state IS NOT NULL AND (lease_until IS NULL OR lease_until < ${now}) AND updated_at < ${now - 120000} ORDER BY updated_at LIMIT 1`;
  if (!rows.length) return Response.json({ resumed: 0 });
  const view = await runJob(rows[0].id);
  return Response.json({ resumed: 1, job: { id: view.id, status: view.status, stage: view.stage, progress: view.progress } });
}
