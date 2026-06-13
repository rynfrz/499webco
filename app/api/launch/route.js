import { NextResponse } from 'next/server';
import { sql, initDb, getSettings } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { launchSite } from '@/lib/deploy';
import { slugify } from '@/lib/projectModel';
import { siteLive } from '@/lib/email';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req) {
  try {
    await requireUser();
    await initDb();
    const { projectId, domain } = await req.json();
    const rows = await sql`SELECT data FROM projects WHERE id = ${projectId}`;
    const project = rows[0]?.data;
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
