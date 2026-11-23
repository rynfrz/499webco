// Read a job. Staff see everything; a customer can read a job only for a site
// they belong to (their own "add page" / "revise" requests).
import { NextResponse } from 'next/server';
import { requireSession, isStaff } from '@/lib/auth';
import { getJob, jobUsage, publicJob } from '@/lib/gen/jobs';
import { membershipFor } from '@/lib/access';

export const runtime = 'nodejs';

export async function GET(req, { params }) {
  try {
    const user = await requireSession();
    const job = await getJob(params.id);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    if (!isStaff(user)) {
      if (!(await membershipFor(user.id, job.projectId))) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      // Customers get progress only: no logs, models or costs.
      return NextResponse.json({ job: { id: job.id, kind: job.kind, status: job.status, stage: job.stage, progress: job.progress, error: job.status === 'error' ? 'This could not be completed. Please try again or contact us.' : '', result: job.state?.result || null } });
    }
    const view = publicJob(job, await jobUsage(job.id));
    // `project_id` kept for the original polling client.
    return NextResponse.json({ job: { ...view, project_id: job.projectId } });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
