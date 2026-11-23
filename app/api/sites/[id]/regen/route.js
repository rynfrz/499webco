// Partial AI work on an existing site, without rebuilding it:
//   kind 'page'     revise or regenerate one page
//   kind 'section'  rework one section               (staff)
//   kind 'add'      build a new page from a request  (staff or the site's owner)
// Returns a job; drive it with POST /api/jobs/<id>/run.
import { getProject } from '@/lib/db';
import { siteAccess } from '@/lib/access';
import { startPartialJob, jobView } from '@/lib/gen/pipeline';
import { rateLimit } from '@/lib/ratelimit';
import { handle, json, readJson } from '@/lib/http';

export const runtime = 'nodejs';

export const POST = handle(async (req, { params }) => {
  const { site, user, role } = await siteAccess(params.id);
  const body = await readJson(req);
  const kind = body.kind === 'page' ? 'page_regen' : body.kind === 'section' ? 'section_regen' : body.kind === 'add' ? 'page_add' : null;
  if (!kind) throw { status: 400, message: 'Unknown request' };
  if (role !== 'staff') {
    if (kind !== 'page_add') throw { status: 403, message: 'Not allowed' };
    // Customers get a small daily allowance of AI-built pages.
    await rateLimit(`aipage:${site.id}`, 6, 86400);
  }
  const project = await getProject(site.projectId);
  if (!project) throw { status: 404, message: 'Project not found' };
  const job = await startPartialJob(kind, project, site, {
    pageId: body.pageId, sectionId: body.sectionId, instruction: body.instruction, title: body.title, type: body.type, slug: body.slug, inNav: body.inNav,
    override: role === 'staff' ? body.override : null
  }, user);
  if (role === 'staff') return json({ job: await jobView(job) });
  return json({ job: { id: job.id, kind: job.kind, status: job.status, stage: job.stage, progress: job.progress } });
});
