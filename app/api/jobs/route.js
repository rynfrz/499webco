// Generation dashboard: recent jobs with status, token use and cost.
import { requireUser } from '@/lib/auth';
import { listJobs } from '@/lib/gen/jobs';
import { handle, json } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = handle(async req => {
  await requireUser();
  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId');
  return json({ jobs: await listJobs({ projectId: projectId || null, limit: Math.min(200, parseInt(url.searchParams.get('limit') || '60', 10) || 60) }) });
});
