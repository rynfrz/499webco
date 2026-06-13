// Generate the audit as printable HTML (browser "Save as PDF"). Screenshots are
// captured client-side from the live preview + the rendered new site, so no
// headless browser is needed on the server.
import { NextResponse } from 'next/server';
import { sql, initDb, getSettings } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { message } from '@/lib/anthropic';
import { buildAuditPrompt } from '@/lib/promptBuilder';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req) {
  try {
    await requireUser();
    await initDb();
    const { projectId } = await req.json();
    const s = await getSettings();
    if (!s.anthropicKey) return NextResponse.json({ error: 'Audit generation needs an Anthropic API key (Settings).' }, { status: 400 });
    const rows = await sql`SELECT data FROM projects WHERE id = ${projectId}`;
    const project = rows[0]?.data;
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    let html = await message({ apiKey: s.anthropicKey, model: s.model || 'claude-sonnet-4-6', system: 'You design clean one-page print documents as HTML. Output only HTML.', prompt: buildAuditPrompt(project), maxTokens: 6000, temperature: 0.5 });
    html = html.trim();
    const fence = html.match(/```(?:html)?\s*([\s\S]*?)```/);
    if (fence) html = fence[1].trim();

    project.auditHtml = html;
    await sql`UPDATE projects SET data = ${JSON.stringify(project)}::jsonb, updated_at = ${Date.now()} WHERE id = ${projectId}`;
    return NextResponse.json({ auditHtml: html });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
