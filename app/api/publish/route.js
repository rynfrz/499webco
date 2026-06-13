// Publish = store the preview in Postgres. Previews are served live by THIS app
// at /preview/<slug>/ (see app/preview/[slug]/route.js), so there's no separate
// deploy step and no second domain to collide with /admin.
import { NextResponse } from 'next/server';
import { sql, initDb, getSettings } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { slugify, categoryLabel } from '@/lib/projectModel';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    await requireUser();
    await initDb();
    const { projectId } = await req.json();
    const rows = await sql`SELECT data FROM projects WHERE id = ${projectId}`;
    const project = rows[0]?.data;
    if (!project?.generatedHtml) return NextResponse.json({ error: 'Generate the site first' }, { status: 400 });

    const slug = slugify(project.business.name);
    const category = categoryLabel(project.business.type);
    const ts = Date.now();
    await sql`INSERT INTO previews (slug, business_name, html, published_at, category)
              VALUES (${slug}, ${project.business.name}, ${project.generatedHtml}, ${ts}, ${category})
              ON CONFLICT (slug) DO UPDATE SET business_name = EXCLUDED.business_name, html = EXCLUDED.html, published_at = EXCLUDED.published_at, category = EXCLUDED.category`;

    const settings = await getSettings();
    const base = settings.previewDomain ? `https://${settings.previewDomain}` : '';
    project.publish = {
      slug,
      previewUrl: `${base}/preview/${slug}/`,
      directUrl: `/preview/${slug}/`,
      portfolioUrl: `${base}/portfolio`,
      publishedAt: ts
    };
    project.status = 'published';
    await sql`UPDATE projects SET data = ${JSON.stringify(project)}::jsonb, updated_at = ${Date.now()} WHERE id = ${projectId}`;
    return NextResponse.json({ publish: project.publish });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
