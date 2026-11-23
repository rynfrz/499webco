// Advance a job. Each call runs as many steps as fit in the request's time
// budget, saves, and returns the current state; the client calls again while
// the job is still "running". Safe to call from several tabs (a lease makes
// sure only one request works on a job at a time).
import { requireSession, isStaff } from '@/lib/auth';
import { getJob } from '@/lib/gen/jobs';
import { runJob } from '@/lib/gen/pipeline';
import { membershipFor } from '@/lib/access';
import { handle, json } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 300;

export const POST = handle(async (req, { params }) => {
  const user = await requireSession();
  const job = await getJob(params.id);
  if (!job) throw { status: 404, message: 'Job not found' };
  const staff = isStaff(user);
  if (!staff && !(await membershipFor(user.id, job.projectId))) throw { status: 404, message: 'Job not found' };
  if (!staff && job.kind === 'site_build') throw { status: 403, message: 'Not allowed' };
  const view = await runJob(params.id, { budgetMs: 282000 });
  if (staff) return json({ job: view });
  return json({ job: { id: view.id, kind: view.kind, status: view.status, stage: view.stage, progress: view.progress, error: view.status === 'error' ? 'This could not be completed. Please try again or contact us.' : '', result: view.result } });
});
