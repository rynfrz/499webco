import { NextResponse } from 'next/server';
import { sql, initDb, getSettings } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { launchSite } from '@/lib/deploy';
import { slugify } from '@/lib/projectModel';
import { siteLive } from '@/lib/email';
import { getSiteByProject } from '@/lib/site/store';
import { deployLive } from '@/lib/site/publish';
import { isLegacyDoc } from '@/lib/site/schema';
import { platformOrigin } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req) {
  try {
    const user = await requireUser();
    await initDb();
    const { projectId, domain } = await req.json();
    const rows = await sql`SELECT data FROM projects WHERE id = ${projectId}`;
    const project = rows[0]?.data;
    // Platform 2.0 site: deploy every page of the published version.
    const site = project ? await getSiteByProject(project.id) : null;
    if (site && !isLegacyDoc(site.draft) && (site.draft?.pages || []).length) {
      if (!site.publishedVersionId) return NextResponse.json({ error: 'Publish the preview first, then launch.' }, { status: 400 });
      const launch = await deployLive(site.id, { domain: domain || '', actorId: user.id, origin: await platformOrigin(req) });
      if (project.business.email) siteLive(project.business.email, project.business.name, launch.liveUrl, domain || launch.domain || '', launch.records || null).catch(() => {});
      return NextResponse.json({ launch });
    }
    if (!project?.generatedHtml) return NextResponse.json({ error: 'Generate the site first' }, { status: 400 });

    const settings = await getSettings();
    const projectName = 'wfl-' + slugify(project.business.name);
    const res = await launchSite(settings, { projectName, html: project.generatedHtml, domain: domain || null });

    project.launch = { ...res, projectName, launchedAt: Date.now() };
    project.status = 'launched';
    await sql`UPDATE projects SET data = ${JSON.stringify(project)}::jsonb, updated_at = ${Date.now()} WHERE id = ${projectId}`;

    // Auto-email the client that they're live.
    if (project.business.email) {
      siteLive(project.business.email, project.business.name, res.liveUrl, domain || res.domain || '', res.records || null).catch(() => {});
    }
    return NextResponse.json({ launch: project.launch });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
