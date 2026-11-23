import { NextResponse } from 'next/server';
import { sql, initDb, getSettings } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { callModel, extractHtml } from '@/lib/anthropic';
import { injectLogo, stripLogo } from '@/lib/projectModel';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req) {
  try {
    await requireUser();
    await initDb();
    const { projectId, instruction } = await req.json();
    const s = await getSettings();
    if (!s.anthropicKey) return NextResponse.json({ error: 'AI revisions need an Anthropic API key (Settings).' }, { status: 400 });
    const rows = await sql`SELECT data FROM projects WHERE id = ${projectId}`;
    const project = rows[0]?.data;
    if (!project?.generatedHtml) return NextResponse.json({ error: 'No site to revise' }, { status: 400 });

    // Send the compact placeholder form (no giant base64 logo) to the model.
    const logo = project.business.logo;
    const currentHtml = stripLogo(project.generatedHtml, logo);
    const r = await callModel({
      settings: s, task: 'content', override: s.model ? { model: s.model } : null, projectId, deadlineMs: 285000,
      system: 'You are an elite front-end engineer. Apply the requested change to the HTML file with the same design quality, keeping everything else intact. Preserve the literal token {{LOGO_SRC}} wherever it appears. Output ONLY the complete updated HTML file, no commentary, no fences.',
      prompt: `CHANGE REQUEST: ${instruction}\n\nCURRENT FILE:\n${currentHtml}`
    });
    if (r.truncated) return NextResponse.json({ error: 'The revised page was cut off at the output limit. Nothing was changed.' }, { status: 502 });
    const raw = r.text;
    let html = extractHtml(raw);
    if (!/<html/i.test(html)) return NextResponse.json({ error: 'Model did not return valid HTML' }, { status: 502 });
    html = injectLogo(html, logo); // restore the real logo data URL
    project.generatedHtml = html;
    await sql`UPDATE projects SET data = ${JSON.stringify(project)}::jsonb, updated_at = ${Date.now()} WHERE id = ${projectId}`;
    return NextResponse.json({ html });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
