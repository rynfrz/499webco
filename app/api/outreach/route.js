import { NextResponse } from 'next/server';
import { sql, initDb, getSettings } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { message, extractJsonLoose } from '@/lib/anthropic';
import { buildOutreachPrompt } from '@/lib/promptBuilder';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req) {
  try {
    await requireUser();
    await initDb();
    const { projectId } = await req.json();
    const s = await getSettings();
    const rows = await sql`SELECT data FROM projects WHERE id = ${projectId}`;
    const project = rows[0]?.data;
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const sender = s.senderName || 'Jax';

    let outreach;
    if (s.anthropicKey) {
      const raw = await message({ apiKey: s.anthropicKey, model: s.model || 'claude-sonnet-4-6', system: 'You write short, human cold emails. Output only valid JSON.', prompt: buildOutreachPrompt(project, sender), maxTokens: 800, temperature: 0.8 });
      outreach = extractJsonLoose(raw);
    } else {
      outreach = {
        subject: `I rebuilt ${project.business.name}'s website (free preview inside)`,
        body: `Hi,\n\nI noticed your website could benefit from a refresh.\n\nRather than sending a proposal, I built one.\n\nPreview:\n${project.publish?.previewUrl || '[publish the preview first]'}\n\nI've also attached a one-page audit of the current site.\n\nI'd love your feedback.\n\n${sender}`
      };
    }
    project.outreach = outreach;
    await sql`UPDATE projects SET data = ${JSON.stringify(project)}::jsonb, updated_at = ${Date.now()} WHERE id = ${projectId}`;
    return NextResponse.json({ outreach });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
