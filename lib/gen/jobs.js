// Durable, resumable generation jobs.
//
// A serverless request can run for at most a few minutes, and a multipage
// build takes longer than that. So a job is a list of small idempotent steps
// kept in the database; each call to runJob() advances as many steps as fit in
// its time budget and saves after every step. If a request dies, the next call
// simply carries on from the last finished step.
//
//   status: running → (awaiting_review →) running → done | error | canceled
//
// A lease prevents two requests from running the same job at once.
import { sql, initDb } from '../db.js';
import { newId } from '../auth.js';

export const JOB_KINDS = ['site_build', 'page_regen', 'section_regen', 'page_add'];

function rowToJob(r) {
  if (!r) return null;
  return {
    id: r.id, projectId: r.project_id, siteId: r.site_id, kind: r.kind, status: r.status, stage: r.stage || '', progress: r.progress,
    error: r.error || '', state: r.state || null, createdBy: r.created_by || null, leaseUntil: r.lease_until ? Number(r.lease_until) : 0,
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at)
  };
}

export async function createJob({ kind, projectId, siteId = null, createdBy = null, state, stage = 'Queued' }) {
  await initDb();
  const id = newId('job');
  const now = Date.now();
  await sql`INSERT INTO jobs (id, project_id, site_id, kind, status, progress, stage, state, created_by, created_at, updated_at)
            VALUES (${id}, ${projectId}, ${siteId}, ${kind}, 'running', 0, ${stage}, ${JSON.stringify(state)}::jsonb, ${createdBy}, ${now}, ${now})`;
  return getJob(id);
}

export async function getJob(id) {
  await initDb();
  const rows = await sql`SELECT id, project_id, site_id, kind, status, progress, stage, error, state, created_by, lease_until, created_at, updated_at FROM jobs WHERE id = ${id}`;
  return rowToJob(rows[0]);
}

export async function saveJob(job) {
  await sql`UPDATE jobs SET status = ${job.status}, progress = ${Math.max(0, Math.min(100, Math.round(job.progress || 0)))}, stage = ${String(job.stage || '').slice(0, 200)},
                            error = ${job.error || null}, state = ${JSON.stringify(job.state)}::jsonb, site_id = ${job.siteId || null}, updated_at = ${Date.now()}
            WHERE id = ${job.id} AND status <> 'canceled'`;
}

/** Take the job for `ms` milliseconds. Returns false if another request holds it. */
export async function acquireLease(jobId, ms) {
  const now = Date.now();
  const rows = await sql`UPDATE jobs SET lease_until = ${now + ms} WHERE id = ${jobId} AND (lease_until IS NULL OR lease_until < ${now}) RETURNING id`;
  return rows.length > 0;
}
export async function releaseLease(jobId) {
  await sql`UPDATE jobs SET lease_until = NULL WHERE id = ${jobId}`;
}

export async function jobStatus(jobId) {
  const rows = await sql`SELECT status FROM jobs WHERE id = ${jobId}`;
  return rows[0]?.status || null;
}

export async function cancelJob(jobId) {
  await sql`UPDATE jobs SET status = 'canceled', stage = 'Canceled', lease_until = NULL, updated_at = ${Date.now()} WHERE id = ${jobId} AND status IN ('running', 'awaiting_review', 'error')`;
  return getJob(jobId);
}

export function log(job, level, msg) {
  const entry = { t: Date.now(), level, msg: String(msg).slice(0, 600) };
  job.state.log = [...(job.state.log || []), entry].slice(-200);
}

/** Token + cost totals for a job, from the per-call ledger. */
export async function jobUsage(jobId) {
  const rows = await sql`SELECT task, model, status, input_tokens, output_tokens, cache_read, cache_write, cost_usd, duration_ms, attempts, stop_reason, error, created_at
                         FROM ai_calls WHERE job_id = ${jobId} ORDER BY created_at`;
  const calls = rows.map(r => ({
    task: r.task, model: r.model, status: r.status, inputTokens: r.input_tokens, outputTokens: r.output_tokens, cacheRead: r.cache_read, cacheWrite: r.cache_write,
    cost: r.cost_usd == null ? null : Number(r.cost_usd), durationMs: r.duration_ms, attempts: r.attempts, stopReason: r.stop_reason, error: r.error, at: Number(r.created_at)
  }));
  const totals = calls.reduce((a, c) => {
    a.inputTokens += c.inputTokens + c.cacheRead + c.cacheWrite; a.outputTokens += c.outputTokens; a.calls++;
    if (c.cost == null) a.unpriced++; else a.cost += c.cost;
    return a;
  }, { inputTokens: 0, outputTokens: 0, cost: 0, calls: 0, unpriced: 0 });
  totals.cost = Math.round(totals.cost * 10000) / 10000;
  return { calls, totals };
}

const SECRET_RE = /(sk-ant-[A-Za-z0-9_\-]+|sk_(live|test)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|re_[A-Za-z0-9]{16,}|Bearer\s+[A-Za-z0-9._\-]+)/g;
export function redactText(s) { return String(s ?? '').replace(SECRET_RE, '[redacted]'); }

/** What the admin UI is allowed to see: no prompts, no secrets, no page bodies. */
export function publicJob(job, usage = null) {
  if (!job) return null;
  const st = job.state || {};
  const art = st.art || {};
  return {
    id: job.id, projectId: job.projectId, siteId: job.siteId, kind: job.kind, status: job.status, stage: job.stage, progress: job.progress,
    error: redactText(job.error), createdAt: job.createdAt, updatedAt: job.updatedAt, createdBy: job.createdBy,
    running: job.leaseUntil > Date.now(),
    input: st.input ? { mode: st.input.mode, upgradeType: st.input.upgradeType || null, override: st.input.override || null, engine: st.input.engine || null, pageId: st.input.pageId || null, title: st.input.title || null } : null,
    models: st.models || null,
    steps: (st.steps || []).map(s => ({ id: s.id, kind: s.kind, label: s.label, status: s.status, attempts: s.attempts || 0, error: redactText(s.error || ''), ms: s.ms || 0, model: s.model || null, usage: s.usage || null, cost: s.cost ?? null, pageId: s.pageId || null })),
    brief: art.brief || null,
    missing: art.missing || [],
    sitemap: art.sitemap || null,
    sitemapRationale: art.sitemapRationale || '',
    design: art.design ? { concept: art.design.concept, system: art.design.system, tokens: art.design.tokens } : null,
    qa: art.qa || null,
    fixes: art.fixes || [],
    notes: (art.notes || []).map(redactText),
    result: st.result || null,
    log: (st.log || []).map(l => ({ ...l, msg: redactText(l.msg) })),
    estimate: st.estimate || null,
    usage: usage ? usage.totals : null,
    calls: usage ? usage.calls.map(c => ({ ...c, error: redactText(c.error || '') })) : null
  };
}

export async function listJobs({ projectId = null, limit = 50 } = {}) {
  await initDb();
  const rows = projectId
    ? await sql`SELECT j.id, j.project_id, j.site_id, j.kind, j.status, j.progress, j.stage, j.error, j.created_by, j.lease_until, j.created_at, j.updated_at,
                       j.state->'input' AS input, j.state->'result' AS result, p.data->'business'->>'name' AS business_name
                FROM jobs j LEFT JOIN projects p ON p.id = j.project_id WHERE j.project_id = ${projectId} ORDER BY j.created_at DESC LIMIT ${limit}`
    : await sql`SELECT j.id, j.project_id, j.site_id, j.kind, j.status, j.progress, j.stage, j.error, j.created_by, j.lease_until, j.created_at, j.updated_at,
                       j.state->'input' AS input, j.state->'result' AS result, p.data->'business'->>'name' AS business_name
                FROM jobs j LEFT JOIN projects p ON p.id = j.project_id ORDER BY j.created_at DESC LIMIT ${limit}`;
  if (!rows.length) return [];
  const usage = await sql`SELECT job_id, COALESCE(SUM(input_tokens + cache_read + cache_write), 0)::int AS input, COALESCE(SUM(output_tokens), 0)::int AS output,
                                 COALESCE(SUM(cost_usd), 0) AS cost, COUNT(*)::int AS calls
                          FROM ai_calls WHERE job_id IS NOT NULL GROUP BY job_id`;
  const byJob = new Map(usage.map(u => [u.job_id, u]));
  return rows.map(r => {
    const u = byJob.get(r.id);
    return {
      id: r.id, projectId: r.project_id, siteId: r.site_id, kind: r.kind, status: r.status, progress: r.progress, stage: r.stage || '', error: redactText(r.error || ''),
      businessName: r.business_name || '', createdAt: Number(r.created_at), updatedAt: Number(r.updated_at), running: r.lease_until && Number(r.lease_until) > Date.now(),
      mode: r.input?.mode || null, upgradeType: r.input?.upgradeType || null, engine: r.input?.engine || null, result: r.result || null,
      usage: u ? { inputTokens: u.input, outputTokens: u.output, cost: Math.round(Number(u.cost) * 10000) / 10000, calls: u.calls } : null
    };
  });
}
