// Job controls: approve the plan (optionally with an edited sitemap), cancel, retry.
import { requireUser } from '@/lib/auth';
import { cancelJob, getJob } from '@/lib/gen/jobs';
import { approvePlan, retryJob, jobView } from '@/lib/gen/pipeline';
import { handle, json, readJson } from '@/lib/http';

export const runtime = 'nodejs';

export const POST = handle(async (req, { params }) => {
  await requireUser();
  const body = await readJson(req);
  let job;
  if (body.action === 'approve_plan') job = await approvePlan(params.id, { sitemap: body.sitemap || null, direction: body.direction || null });
  else if (body.action === 'cancel') job = await cancelJob(params.id);
  else if (body.action === 'retry') job = await retryJob(params.id);
  else throw { status: 400, message: 'Unknown action' };
  if (!job) job = await getJob(params.id);
  if (!job) throw { status: 404, message: 'Job not found' };
  return json({ job: await jobView(job) });
});
