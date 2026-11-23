// Staff: every structured site, without loading draft documents.
import { requireUser } from '@/lib/auth';
import { listSites, ensureSite } from '@/lib/site/store';
import { getProject, patchProject } from '@/lib/db';
import { handle, json, readJson } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = handle(async () => {
  await requireUser();
  return json({ sites: await listSites() });
});

// Make sure a project has a site record (a classic site becomes its first,
// rollback-able "legacy" version). Nothing public changes.
export const POST = handle(async req => {
  const user = await requireUser();
  const body = await readJson(req);
  const project = await getProject(body.projectId);
  if (!project) throw { status: 404, message: 'Project not found' };
  const site = await ensureSite(project, { createdBy: user.id });
  // Remember the link on the project so the workspace shows the site tools (and any staged upgrade) straight away.
  if (project.siteId !== site.id) await patchProject(project.id, { siteId: site.id });
  return json({ siteId: site.id, slug: site.slug, status: site.status });
});
