// Timeout-safe generation. Runs on Pro with maxDuration up to 300s.
// Streams progress to the client AND persists the finished site to both the
// project row and a job row — so even if the user closes the tab, the result is
// saved and appears when they reopen the project. /api/jobs/[id] allows polling.
import { sql, initDb, getSettings } from '@/lib/db';
import { requireUser, newId } from '@/lib/auth';
import { streamMessage, extractHtml } from '@/lib/anthropic';
import { WEBSITE_SYSTEM_PROMPT, buildWebsitePrompt } from '@/lib/promptBuilder';
import { makeDemoSite } from '@/lib/demoSite';
import { injectLogo } from '@/lib/projectModel';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req) {
  let user;
  try { user = await requireUser(); }
  catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: e.status || 401 }); }

  await initDb();
  const { projectId } = await req.json();
  const rows = await sql`SELECT data FROM projects WHERE id = ${projectId}`;
  const project = rows[0]?.data;
  if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404 });

  const settings = await getSettings();
  const jobId = newId('job');
  const now = Date.now();
  await sql`INSERT INTO jobs (id, project_id, kind, status, progress, created_at, updated_at)
            VALUES (${jobId}, ${projectId}, 'generate', 'running', 0, ${now}, ${now})`;

  const encoder = new TextEncoder();
  const send = (controller, obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

  const stream = new ReadableStream({
    async start(controller) {
      send(controller, { type: 'job', jobId });
      try {
        let html;
        if (!settings.anthropicKey) {
          send(controller, { type: 'status', text: 'Demo mode (no API key) — building a seed-driven demo site…' });
          html = makeDemoSite(project);
        } else {
          let chars = 0;
          html = await streamMessage(
            { apiKey: settings.anthropicKey, model: settings.model || 'claude-sonnet-4-6', system: WEBSITE_SYSTEM_PROMPT, prompt: buildWebsitePrompt(project), maxTokens: settings.maxTokens || 32000, temperature: 1 },
            chunk => { chars += chunk.length; send(controller, { type: 'progress', kb: +(chars / 1024).toFixed(1) }); }
          );
          html = extractHtml(html);
          if (!/<html/i.test(html)) throw new Error('Model did not return a complete HTML document — try again.');
        }

        // Swap the {{LOGO_SRC}} token for the real logo data URL (or strip it).
        html = injectLogo(html, project.business.logo);
        project.generatedHtml = html;
        project.status = 'generated';
        await sql`UPDATE projects SET data = ${JSON.stringify(project)}::jsonb, updated_at = ${Date.now()} WHERE id = ${projectId}`;
        await sql`UPDATE jobs SET status = 'done', progress = 100, result = ${html}, updated_at = ${Date.now()} WHERE id = ${jobId}`;
        send(controller, { type: 'done', kb: +(html.length / 1024).toFixed(0) });
      } catch (err) {
        await sql`UPDATE jobs SET status = 'error', error = ${err.message}, updated_at = ${Date.now()} WHERE id = ${jobId}`;
        send(controller, { type: 'error', error: err.message });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
}
