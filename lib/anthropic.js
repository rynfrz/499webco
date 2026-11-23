// Server-side Anthropic Messages client (raw fetch + SSE, no SDK — same
// approach the app has always used).
//
// callModel() is the one entry point for every model call:
//   - picks the model + options for the task (lib/ai/models.js)
//   - streams, capturing text, token usage and the stop reason
//   - retries rate limits / overloads / network failures with backoff
//   - enforces a wall-clock deadline (serverless requests are time-boxed)
//   - falls back gracefully when a model is retired or unavailable
//   - records every call in ai_calls (tokens, cost, duration, errors)
//
// streamMessage()/message() keep their original signatures for older callers.
import { resolveTaskModel, buildRequestParams, estimateCost, outputCeiling, getModel, DEFAULT_MODEL } from './ai/models.js';

const API_VERSION = '2023-06-01';

function baseUrl() {
  // Only an explicit, app-specific override is honoured (used by local tests).
  return process.env.WFL_ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
}

export class AnthropicError extends Error {
  constructor(message, { status = 0, type = '', retryable = false, requestId = '' } = {}) {
    super(message);
    this.name = 'AnthropicError';
    this.status = status; this.type = type; this.retryable = retryable; this.requestId = requestId;
  }
}

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

function redact(s = '') {
  return String(s).replace(/sk-ant-[A-Za-z0-9_\-]+/g, 'sk-ant-…redacted');
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(new AnthropicError('Timed out', { type: 'timeout' })); }, { once: true });
});

/** One streaming request. Resolves { text, usage, stopReason, model, id }. */
async function streamOnce({ apiKey, body, signal, onText, fetchImpl }) {
  let res;
  try {
    res = await fetchImpl(baseUrl() + '/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': API_VERSION },
      body: JSON.stringify({ ...body, stream: true }),
      signal
    });
  } catch (e) {
    if (signal?.aborted) throw new AnthropicError('The model call ran out of time for this request.', { type: 'timeout' });
    throw new AnthropicError('Network error calling Anthropic: ' + (e.message || e), { type: 'network', retryable: true });
  }
  if (!res.ok) {
    let detail = '', type = '';
    try { const j = await res.json(); detail = j.error?.message || ''; type = j.error?.type || ''; } catch {}
    const shouldRetry = res.headers.get('x-should-retry');
    let retryable = RETRYABLE_STATUS.has(res.status);
    if (shouldRetry === 'false') retryable = false;
    if (shouldRetry === 'true') retryable = true;
    const err = new AnthropicError(`Anthropic API error ${res.status}${detail ? ': ' + redact(detail) : ''}`, {
      status: res.status, type, retryable, requestId: res.headers.get('request-id') || ''
    });
    const ra = parseFloat(res.headers.get('retry-after') || '');
    if (Number.isFinite(ra)) err.retryAfterMs = Math.min(ra * 1000, 60000);
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', text = '', stopReason = null, model = body.model, id = '';
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const take = u => {
    if (!u) return;
    for (const k of Object.keys(usage)) if (Number.isFinite(u[k])) usage[k] = u[k];
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let ev; try { ev = JSON.parse(payload); } catch { continue; }
        if (ev.type === 'message_start') { take(ev.message?.usage); model = ev.message?.model || model; id = ev.message?.id || ''; }
        else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
          text += ev.delta.text;
          if (onText) onText(ev.delta.text);
        } else if (ev.type === 'content_block_delta' && ev.delta?.text && !ev.delta.type) {
          text += ev.delta.text; // tolerate minimal/mock streams
          if (onText) onText(ev.delta.text);
        } else if (ev.type === 'message_delta') { take(ev.usage); if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason; }
        else if (ev.type === 'error') {
          const t = ev.error?.type || '';
          throw new AnthropicError(redact(ev.error?.message || 'Streaming error'), { type: t, retryable: t === 'overloaded_error' || t === 'api_error' || t === 'rate_limit_error' });
        }
      }
    }
  } catch (e) {
    if (e instanceof AnthropicError) { e.partial = { text, usage }; throw e; }
    if (signal?.aborted) { const err = new AnthropicError('The model call ran out of time for this request.', { type: 'timeout' }); err.partial = { text, usage }; throw err; }
    const err = new AnthropicError('Connection dropped while streaming: ' + (e.message || e), { type: 'network', retryable: true });
    err.partial = { text, usage };
    throw err;
  }
  return { text, usage, stopReason, model, id };
}

async function recordCall(row) {
  try {
    const { sql, initDb } = await import('./db.js');
    await initDb();
    const id = 'ai' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await sql`INSERT INTO ai_calls (id, job_id, project_id, task, model, status, input_tokens, output_tokens, cache_read, cache_write, cost_usd, duration_ms, attempts, stop_reason, error, params, created_at)
              VALUES (${id}, ${row.jobId || null}, ${row.projectId || null}, ${row.task}, ${row.model}, ${row.status},
                      ${row.usage.input_tokens || 0}, ${row.usage.output_tokens || 0}, ${row.usage.cache_read_input_tokens || 0}, ${row.usage.cache_creation_input_tokens || 0},
                      ${row.cost}, ${row.durationMs}, ${row.attempts}, ${row.stopReason || null}, ${row.error ? redact(row.error).slice(0, 2000) : null},
                      ${JSON.stringify(row.params || {})}::jsonb, ${Date.now()})`;
  } catch { /* logging must never break generation */ }
}

/**
 * Make one model call for a task.
 *
 * @param {object} o
 * @param {object} o.settings        settings row (anthropicKey, presets, …)
 * @param {string} o.task            one of TASK_KEYS
 * @param {string|Array} o.system    system prompt (string, or content blocks for caching)
 * @param {string} [o.prompt]        user prompt (or pass o.messages)
 * @param {Array}  [o.messages]
 * @param {object} [o.override]      { preset?, model?, tasks?: { [task]: {model, effort, thinking} } }
 * @param {number} [o.maxTokens]     lower the ceiling for a small job
 * @param {number} [o.deadlineMs]    wall-clock budget for this call (default 270s)
 * @param {number} [o.maxAttempts]   default 4
 * @param {string} [o.jobId] @param {string} [o.projectId]
 * @param {function} [o.onText]      streaming callback
 * @returns {{text, usage, cost, model, stopReason, truncated, applied, attempts, notes, durationMs}}
 */
export async function callModel(o) {
  const settings = o.settings || {};
  const apiKey = o.apiKey || settings.anthropicKey;
  if (!apiKey) throw new AnthropicError('No Anthropic API key set (Settings).', { type: 'config' });
  const fetchImpl = o.fetchImpl || globalThis.__wflFetch || fetch;
  const started = Date.now();
  const deadline = started + (o.deadlineMs || 270000);
  const maxAttempts = o.maxAttempts || 4;

  let resolved = resolveTaskModel(settings, o.task || 'utility', o.override || null);
  const notes = [...resolved.notes];
  const tried = new Set();
  let attempts = 0, lastErr = null;
  const total = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const add = u => { if (u) for (const k of Object.keys(total)) total[k] += u[k] || 0; };

  while (attempts < maxAttempts) {
    attempts++;
    const model = resolved.model;
    const { params, applied } = buildRequestParams(model, {
      ceiling: outputCeiling(settings), maxTokens: o.maxTokens, thinking: resolved.thinking, effort: resolved.effort
    });
    const body = {
      model: model.id,
      ...params,
      messages: o.messages || [{ role: 'user', content: o.prompt }]
    };
    if (o.system) body.system = o.system;

    const remaining = deadline - Date.now();
    if (remaining < 3000) { lastErr = lastErr || new AnthropicError('The model call ran out of time for this request.', { type: 'timeout' }); break; }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), remaining);
    try {
      const r = await streamOnce({ apiKey, body, signal: ctl.signal, onText: o.onText, fetchImpl });
      clearTimeout(timer);
      add(r.usage);
      if (r.stopReason === 'refusal') throw new AnthropicError('The model declined this request.', { type: 'refusal' });
      const cost = estimateCost(model, total);
      const out = {
        text: r.text, usage: total, cost, model: model.id, stopReason: r.stopReason,
        truncated: r.stopReason === 'max_tokens', applied, attempts, notes, durationMs: Date.now() - started
      };
      await recordCall({ jobId: o.jobId, projectId: o.projectId, task: o.task || 'utility', model: model.id, status: 'ok', usage: total, cost, durationMs: out.durationMs, attempts, stopReason: r.stopReason, params: { ...applied, preset: resolved.preset } });
      return out;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e instanceof AnthropicError ? e : new AnthropicError(e.message || String(e), { type: 'unknown' });
      add(lastErr.partial?.usage);
      // Retired / unavailable model → try the next sensible model once per model.
      const modelGone = lastErr.status === 404 || (lastErr.status === 400 && /model/i.test(lastErr.message) && /not (found|supported|available)|deprecated|retired/i.test(lastErr.message));
      if (modelGone) {
        tried.add(model.id);
        const next = [settings.model, DEFAULT_MODEL, 'claude-opus-4-8', 'claude-haiku-4-5-20251001'].filter(Boolean).find(id => !tried.has(id) && getModel(settings, id));
        if (next) {
          notes.push(`Model "${model.id}" is unavailable (${lastErr.status}); retried with "${next}".`);
          resolved = { ...resolved, model: getModel(settings, next) };
          continue;
        }
        break;
      }
      // A parameter this model rejects (e.g. thinking/effort on an unknown model): drop extras once.
      if (lastErr.status === 400 && /thinking|effort|output_config/i.test(lastErr.message) && (resolved.thinking !== 'off' || resolved.effort)) {
        notes.push(`"${model.id}" rejected thinking/effort settings; retried without them.`);
        resolved = { ...resolved, thinking: 'off', effort: null };
        continue;
      }
      if (!lastErr.retryable || attempts >= maxAttempts) break;
      const wait = lastErr.retryAfterMs ?? Math.min(1500 * 2 ** (attempts - 1), 20000) + Math.floor(Math.random() * 500);
      if (Date.now() + wait > deadline - 3000) break;
      try { await sleep(wait); } catch { break; }
    }
  }

  const model = resolved.model;
  await recordCall({ jobId: o.jobId, projectId: o.projectId, task: o.task || 'utility', model: model.id, status: 'error', usage: total, cost: estimateCost(model, total), durationMs: Date.now() - started, attempts, error: lastErr?.message, params: { preset: resolved.preset } });
  lastErr.attempts = attempts;
  lastErr.notes = notes;
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Original helpers (kept for the classic single-page flow and older routes)
// ---------------------------------------------------------------------------

/** Legacy signature: explicit model + key. Returns the full text. */
export async function streamMessage({ apiKey, model, system, prompt, maxTokens = 64000, settings, task = 'utility', projectId, jobId }, onChunk) {
  if (!apiKey) throw new Error('No Anthropic API key set (Settings).');
  const s = { ...(settings || {}), anthropicKey: apiKey };
  // An explicit model argument pins the model for this call.
  const override = model ? { model } : null;
  let maxTok = parseInt(maxTokens, 10);
  if (!Number.isFinite(maxTok) || maxTok < 1024) maxTok = undefined;
  const r = await callModel({ settings: s, task, system, prompt, override, maxTokens: maxTok, onText: onChunk, projectId, jobId });
  return r.text;
}

export async function message(opts) {
  return streamMessage(opts, null);
}

export function extractHtml(text) {
  let t = (text || '').trim();
  const fence = t.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const idx = t.search(/<!doctype html|<html/i);
  if (idx > 0) t = t.slice(idx);
  return t;
}

export function extractJsonLoose(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a === -1 || b === -1) throw new Error('No JSON in response');
  return JSON.parse(text.slice(a, b + 1));
}
