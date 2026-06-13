import { NextResponse } from 'next/server';
import { sql, initDb, getSettings } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { message, extractHtml } from '@/lib/anthropic';

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

    const raw = await message({
      apiKey: s.anthropicKey, model: s.model || 'claude-sonnet-4-6',
      system: 'You are an elite front-end engineer. Apply the requested change to the HTML file with the same design quality, keeping everything else intact. Output ONLY the complete updated HTML file, no commentary, no fences.',
      prompt: `CHANGE REQUEST: ${instruction}\n\nCURRENT FILE:\n${project.generatedHtml}`,
      temperature: 0.6, maxTokens: s.maxTokens || 32000
    });
    const html = extractHtml(raw);
    if (!/<html/i.test(html)) return NextResponse.json({ error: 'Model did not return valid HTML' }, { status: 502 });
    project.generatedHtml = html;
    await sql`UPDATE projects SET data = ${JSON.stringify(project)}::jsonb, updated_at = ${Date.now()} WHERE id = ${projectId}`;
    return NextResponse.json({ html });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
