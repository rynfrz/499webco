// Publish = store the preview in Postgres. Previews are served live by THIS app
// at /preview/<slug>/ (see app/preview/[slug]/route.js), so there's no separate
// deploy step and no second domain to collide with /admin.
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { sql, initDb, getSettings } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { slugify, categoryLabel } from '@/lib/projectModel';
import { previewReady } from '@/lib/email';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    await requireUser();
    await initDb();
    const body = await req.json();
    const { projectId } = body;
    const rows = await sql`SELECT data FROM projects WHERE id = ${projectId}`;
    const project = rows[0]?.data;
    if (!project?.generatedHtml) return NextResponse.json({ error: 'Generate the site first' }, { status: 400 });

    if (!project.reviewToken) project.reviewToken = crypto.randomBytes(16).toString('hex');
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
    if (project.status !== 'paid' && project.status !== 'launched') project.status = 'published';

    // Auto-email the prospect their private review link — once, on first publish
    // (or when explicitly re-sent with notify:true). Re-publishing won't re-spam.
    const origin = new URL(req.url).origin;
    let emailed = false;
    if (project.business.email && (body.notify || !project.previewEmailedAt)) {
      previewReady(project.business.email, project.business.name, `${origin}/review/${project.reviewToken}`).catch(() => {});
      project.previewEmailedAt = Date.now();
      emailed = true;
    }

    await sql`UPDATE projects SET data = ${JSON.stringify(project)}::jsonb, updated_at = ${Date.now()} WHERE id = ${projectId}`;
    return NextResponse.json({ publish: project.publish, reviewUrl: `${origin}/review/${project.reviewToken}`, emailed });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
