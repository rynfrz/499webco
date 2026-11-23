// Start a multi-stage site build (new site, regeneration, or upgrade).
// Returns the job; the client then drives it with POST /api/jobs/<id>/run.
import { getProject } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { startSiteBuild, jobView } from '@/lib/gen/pipeline';
import { handle, json, readJson } from '@/lib/http';

export const runtime = 'nodejs';

export const POST = handle(async req => {
  const user = await requireUser();
  const body = await readJson(req);
  const project = await getProject(body.projectId);
  if (!project) throw { status: 404, message: 'Project not found' };
  if (!project.business?.name) throw { status: 400, message: 'Add the business name first.' };
  const job = await startSiteBuild(project, {
    mode: body.mode, upgradeType: body.upgradeType, override: body.override, direction: body.direction,
    sitemap: body.sitemap, autoApprove: body.autoApprove, note: body.note
  }, user);
  return json({ job: await jobView(job) });
});
