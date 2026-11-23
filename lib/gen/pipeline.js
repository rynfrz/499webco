// The multi-stage generation pipeline, as a resumable step machine.
//
//   plan phase    analyze? → brief → sitemap        (then waits for the administrator)
//   build phase   design → page × N → seo → qa → finalize
//
// Each step is small, validated and idempotent. Model output is parsed into
// structured artifacts and sanitised before it is stored. Without an Anthropic
// key the same machine runs in demo mode using the platform templates.
import { getSettings, getProject, patchProject } from '../db.js';
import { callModel, AnthropicError } from '../anthropic.js';
import { resolveTaskModel, estimateTokens } from '../ai/models.js';
import { normalizeDirection, directionFromLegacySeed } from '../design/direction.js';
import { factsFromProject, missingFacts, basicBrief } from './brief.js';
import { proposeSitemap, buildTemplatePage } from '../site/templates.js';
import { designFromDirection, buildDemoSite } from './demo.js';
import { ingestSection, ingestChrome, sanitizeDoc } from '../site/clean.js';
import { sanitizeCss, textOf } from '../site/html.js';
import { normalizeTokens, defaultHeader, defaultFooter } from '../site/foundation.js';
import { normalizeDoc, normalizePage, cleanSlug, sid, isLegacyDoc, livePages, pagePath, validateDoc } from '../site/schema.js';
import { runQa, autoFix } from '../site/qa.js';
import { ensureSite, getSite, saveDraft, snapshotDraft, stageVersion, logEvent } from '../site/store.js';
import { existingContentOf, existingContentNote, convertLegacy } from '../site/legacy.js';
import * as P from './prompts.js';
import { createJob, getJob, saveJob, acquireLease, releaseLease, jobStatus, log, jobUsage, publicJob } from './jobs.js';

const MAX_PAGES = 14;
const STEP_MAX_ATTEMPTS = 3;
const MAX_CONTINUATIONS = 6;      // a long page may span several request windows
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

export const UPGRADE_TYPES = {
  refresh: { label: 'Visual Refresh', description: 'A new design for the same content and page structure.', ai: true },
  multipage: { label: 'Multipage Conversion', description: 'Expands a one-page site into a proper multipage site, reusing its content.', ai: true },
  redesign: { label: 'Full Redesign', description: 'A substantially improved site from the current business information and design direction.', ai: true },
  convert: { label: 'Platform Conversion', description: 'Moves the existing site into the editable format while keeping its appearance. No AI.', ai: false }
};

// ---------------------------------------------------------------------------
// Job creation
// ---------------------------------------------------------------------------

function step(kind, label, extra = {}) {
  return { id: extra.id || kind, kind, label, status: 'pending', attempts: 0, ...extra };
}

function planSteps(input) {
  const s = [];
  if (input.mode === 'upgrade') s.push(step('analyze', 'Analysing the existing website'));
  if (input.upgradeType === 'convert') return s;
  s.push(step('brief', 'Understanding the business'));
  s.push(step('sitemap', 'Planning the site architecture'));
  return s;
}

function buildSteps(sitemap) {
  const s = [step('design', 'Creating the design system')];
  sitemap.forEach((p, i) => s.push(step('page', `Building "${p.title}"`, { id: 'page:' + p.id, pageId: p.id, first: i === 0 })));
  s.push(step('seo', 'Writing search metadata'));
  s.push(step('qa', 'Quality checks'));
  s.push(step('finalize', 'Saving the website'));
  return s;
}

/** Decide the design direction for a project (stored on the project, or derived). */
export function directionForProject(project, override = null) {
  const ctx = { businessType: project.business?.type, hasPhotos: (project.business?.photos || []).length > 0 };
  if (override) return normalizeDirection(override, ctx);
  if (project.direction) return normalizeDirection(project.direction, ctx);
  return directionFromLegacySeed(project.designSeed, project.business?.type, ctx);
}

/**
 * Start a site build (new site, regeneration, or upgrade).
 * input: { mode: 'new'|'upgrade', upgradeType?, override?, direction?, sitemap?, autoApprove?, note? }
 */
export async function startSiteBuild(project, input = {}, user = null) {
  const settings = await getSettings();
  const site = await ensureSite(project, { createdBy: user?.id || null });
  const mode = input.mode === 'upgrade' ? 'upgrade' : 'new';
  if (mode === 'upgrade' && !UPGRADE_TYPES[input.upgradeType]) throw Object.assign(new Error('Choose an upgrade type.'), { status: 400 });
  const engine = settings.anthropicKey ? 'ai' : 'demo';
  const direction = directionForProject(project, input.direction || null);
  const clean = {
    mode, upgradeType: mode === 'upgrade' ? input.upgradeType : null, engine,
    override: sanitizeOverride(input.override),
    direction,
    autoApprove: !!input.autoApprove,
    note: String(input.note || '').slice(0, 4000),
    presetSitemap: Array.isArray(input.sitemap) && input.sitemap.length ? input.sitemap : null,
    allowStock: !!settings.allowStockImagery
  };
  const state = { v: 1, input: clean, phase: 'plan', steps: planSteps(clean), art: { notes: [], removed: [] }, log: [], models: null };
  state.models = modelPlan(settings, clean);
  const job = await createJob({ kind: 'site_build', projectId: project.id, siteId: site.id, createdBy: user?.id || null, state, stage: 'Starting' });
  log(job, 'info', `${mode === 'upgrade' ? UPGRADE_TYPES[clean.upgradeType].label : 'New site build'} started (${engine === 'ai' ? 'AI' : 'demo mode — no API key'}).`);
  await saveJob(job);
  return job;
}

function sanitizeOverride(o) {
  if (!o || typeof o !== 'object') return null;
  const out = {};
  if (typeof o.preset === 'string') out.preset = o.preset.slice(0, 20);
  if (typeof o.model === 'string' && o.model) out.model = o.model.slice(0, 80);
  if (o.tasks && typeof o.tasks === 'object') {
    out.tasks = {};
    for (const [k, v] of Object.entries(o.tasks)) if (v && typeof v === 'object') out.tasks[k.slice(0, 20)] = { model: String(v.model || '').slice(0, 80) || undefined, effort: v.effort || undefined, thinking: v.thinking || undefined };
  }
  return Object.keys(out).length ? out : null;
}

function modelPlan(settings, input) {
  if (input.engine !== 'ai') return null;
  const tasks = input.mode === 'upgrade' ? ['architecture', 'redesign', 'page', 'seo'] : ['architecture', 'design', 'page', 'seo'];
  return Object.fromEntries(tasks.map(t => {
    const r = resolveTaskModel(settings, t, input.override);
    return [t, { model: r.model.id, name: r.model.name, effort: r.effort, thinking: r.thinking, preset: r.preset }];
  }));
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function nextBatch(state, concurrency) {
  const pending = state.steps.filter(s => s.status === 'pending');
  if (!pending.length) return [];
  const first = pending[0];
  if (first.kind !== 'page' || first.first) return [first];
  // Pages after the home page can run side by side.
  const batch = [];
  for (const s of pending) { if (s.kind !== 'page') break; batch.push(s); if (batch.length >= concurrency) break; }
  return batch;
}

function progressOf(state) {
  const total = state.steps.length + (state.phase === 'plan' && state.input.upgradeType !== 'convert' ? 6 : 0);
  const done = state.steps.filter(s => s.status === 'done' || s.status === 'skipped').length;
  return total ? Math.round((done / total) * 100) : 0;
}

/**
 * Advance a job as far as the time budget allows.
 * Safe to call repeatedly and concurrently (a lease serialises runners).
 */
// One request may run for up to 800 s (Vercel Pro with Fluid compute; see maxDuration on the run routes).
// A slow model at high thinking effort can need most of that for a single page.
export const RUN_BUDGET_MS = 770000;

export async function runJob(jobId, { budgetMs = RUN_BUDGET_MS } = {}) {
  const started = Date.now();
  let job = await getJob(jobId);
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });
  if (job.status !== 'running') return view(job);
  if (!(await acquireLease(jobId, budgetMs + 30000))) return view(job);
  try {
    const settings = await getSettings();
    const project = await getProject(job.projectId);
    if (!project) { job.status = 'error'; job.error = 'The project no longer exists.'; await saveJob(job); return view(job); }
    const ctx = { settings, project, facts: factsFromProject(project), demo: job.state.input.engine !== 'ai' };
    const concurrency = Math.max(1, Math.min(4, parseInt(settings.aiPageConcurrency, 10) || 3));

    for (;;) {
      const batch = nextBatch(job.state, concurrency);
      if (!batch.length) {
        if (job.state.phase === 'plan' && job.state.input.upgradeType !== 'convert') {
          enterBuildOrWait(job);
          await saveJob(job);
          if (job.status !== 'running') break;
          continue;
        }
        job.status = 'done'; job.progress = 100; job.stage = 'Complete';
        await saveJob(job);
        break;
      }
      const remaining = budgetMs - (Date.now() - started);
      // Long model calls (design, pages) only start with close to a full request window ahead of them;
      // otherwise the next request picks them up with a fresh one.
      const long = ['design', 'page', 'regen_page', 'add_page'].includes(batch[0].kind);
      const need = ctx.demo ? 2000 : long ? 400000 : ['brief', 'sitemap', 'seo', 'regen_section'].includes(batch[0].kind) ? 60000 : 5000;
      if (remaining < need) { job.stage = batch[0].label + ' (continuing…)'; await saveJob(job); break; }

      for (const s of batch) { s.status = 'running'; s.attempts = (s.attempts || 0) + 1; }
      job.stage = batch.length > 1 ? `Building ${batch.length} pages` : batch[0].label;
      job.progress = progressOf(job.state);
      await saveJob(job);

      const results = await Promise.all(batch.map(async s => {
        const t0 = Date.now();
        try { return { s, out: await execStep(job, s, { ...ctx, step: s, deadlineAt: t0 + Math.max(20000, remaining - 14000) }), ms: Date.now() - t0 }; }
        catch (e) { return { s, err: e, ms: Date.now() - t0 }; }
      }));

      let fatal = null;
      for (const r of results) {
        r.s.ms = (r.s.ms || 0) + r.ms;
        if (r.err) {
          const msg = r.err.message || String(r.err);
          r.s.error = msg;
          const retryable = r.err instanceof AnthropicError ? (r.err.retryable || r.err.type === 'timeout' || r.err.type === 'network') : !!r.err.retryStep;
          const timedOut = r.err instanceof AnthropicError && r.err.type === 'timeout';
          if (timedOut && r.err.progress && (r.s.continuations || 0) < MAX_CONTINUATIONS) {
            // The request window closed mid-page, but finished sections were kept: carry on from there.
            r.s.continuations = (r.s.continuations || 0) + 1;
            r.s.attempts = Math.max(0, r.s.attempts - 1);
            r.s.status = 'pending'; r.s.error = '';
            log(job, 'info', `${r.s.label}: ${r.s.partial?.sections?.length || r.err.progress} section(s) written so far; continuing in the next request.`);
          } else if (timedOut && r.s.attempts < STEP_MAX_ATTEMPTS) {
            // Nothing usable arrived in time: the next attempt thinks less and is asked to be tighter.
            r.s.effortDown = (r.s.effortDown || 0) + 1;
            r.s.status = 'pending';
            log(job, 'warn', `${r.s.label}: ran out of time for one request; retrying with lighter thinking (${r.s.attempts}/${STEP_MAX_ATTEMPTS}).`);
          } else if (retryable && r.s.attempts < STEP_MAX_ATTEMPTS) { r.s.status = 'pending'; log(job, 'warn', `${r.s.label}: ${msg} — will retry (${r.s.attempts}/${STEP_MAX_ATTEMPTS}).`); }
          else { r.s.status = 'error'; fatal = fatal || `${r.s.label}: ${msg}`; log(job, 'error', `${r.s.label} failed: ${msg}`); }
        } else {
          r.s.status = 'done'; r.s.error = '';
          if (r.out?.usage) { r.s.usage = { input: r.out.usage.input_tokens + (r.out.usage.cache_read_input_tokens || 0) + (r.out.usage.cache_creation_input_tokens || 0), output: r.out.usage.output_tokens }; r.s.cost = r.out.cost; r.s.model = r.out.model; }
          for (const n of r.out?.notes || []) { job.state.art.notes.push(n); log(job, 'warn', n); }
          log(job, 'info', `${r.s.label} — done${r.out?.model ? ` (${r.out.model}, ${r.s.usage.output.toLocaleString()} output tokens)` : ''}.`);
        }
      }
      job.progress = progressOf(job.state);
      if (fatal) { job.status = 'error'; job.error = fatal; job.stage = 'Stopped: needs attention'; await saveJob(job); break; }
      await saveJob(job);
      // Honour a cancel issued while this batch was running.
      if ((await jobStatus(jobId)) === 'canceled') { job = await getJob(jobId); break; }
    }
  } finally {
    await releaseLease(jobId);
  }
  return view(await getJob(jobId));
}

async function view(job) { return publicJob(job, await jobUsage(job.id)); }
export { view as jobView };

function enterBuildOrWait(job) {
  const st = job.state;
  if (!st.art.sitemap?.length) { job.status = 'error'; job.error = 'No sitemap was produced.'; return; }
  if (st.input.autoApprove || st.planApproved) {
    st.phase = 'build';
    st.steps = [...st.steps, ...buildSteps(st.art.sitemap)];
    st.estimate = estimateBuild(st);
    job.stage = 'Building';
  } else {
    job.status = 'awaiting_review';
    job.stage = 'Sitemap ready for review';
    st.estimate = estimateBuild(st);
    log(job, 'info', 'Plan ready. Waiting for the administrator to review the sitemap.');
  }
}

/** A rough token estimate so the administrator sees the scale before building. */
function estimateBuild(st) {
  if (st.input.engine !== 'ai') return null;
  const pages = st.art.sitemap?.length || 0;
  const input = 14000 + pages * 16000;      // shared context is cached after the first page
  const output = 13000 + pages * 9000;
  return { pages, inputTokens: input, outputTokens: output };
}

/** Administrator approves (and may have edited) the sitemap; the build continues. */
export async function approvePlan(jobId, { sitemap = null, direction = null } = {}) {
  const job = await getJob(jobId);
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });
  if (job.status !== 'awaiting_review') throw Object.assign(new Error('This job is not waiting for review.'), { status: 409 });
  if (sitemap) job.state.art.sitemap = normalizeSitemap(sitemap, job.state.art.sitemap);
  if (direction) {
    const project = await getProject(job.projectId);
    job.state.input.direction = normalizeDirection(direction, { businessType: project?.business?.type, hasPhotos: (project?.business?.photos || []).length > 0 });
  }
  job.state.planApproved = true;
  job.status = 'running';
  enterBuildOrWait(job);
  log(job, 'info', `Sitemap approved: ${job.state.art.sitemap.map(p => p.title).join(', ')}.`);
  await saveJob(job);
  return job;
}

export async function retryJob(jobId) {
  const job = await getJob(jobId);
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });
  if (job.status !== 'error') throw Object.assign(new Error('Only a stopped job can be retried.'), { status: 409 });
  for (const s of job.state.steps) if (s.status === 'error' || s.status === 'running') { s.status = 'pending'; s.attempts = 0; s.error = ''; delete s.effortDown; s.continuations = 0; }   // a manual retry starts at the configured effort (saved sections are kept)
  job.status = 'running'; job.error = ''; job.stage = 'Retrying';
  log(job, 'info', 'Retry requested.');
  await saveJob(job);
  return job;
}

// ---------------------------------------------------------------------------
// Sitemap normalisation (model output and administrator edits)
// ---------------------------------------------------------------------------

const PAGE_TYPE_SET = new Set(['home', 'about', 'services', 'service', 'products', 'product', 'gallery', 'testimonials', 'faq', 'blog', 'contact', 'booking', 'locations', 'landing', 'standard', 'custom']);

export function normalizeSitemap(pages, previous = []) {
  const prevById = new Map((previous || []).map(p => [p.id, p]));
  const out = [];
  const slugs = new Set();
  for (const raw of (Array.isArray(pages) ? pages : []).slice(0, MAX_PAGES)) {
    if (!raw || typeof raw !== 'object') continue;
    const prev = prevById.get(raw.id) || {};
    const title = String(raw.title || prev.title || '').trim().slice(0, 80);
    if (!title) continue;
    const type = PAGE_TYPE_SET.has(raw.type) ? raw.type : (prev.type || 'standard');
    let slug = '';
    const isHome = type === 'home' || raw.slug === '' && out.length === 0;
    if (!isHome) {
      try { slug = cleanSlug(raw.slug || title); } catch { try { slug = cleanSlug(title); } catch { slug = 'page-' + (out.length + 1); } }
      let n = 2; const base = slug;
      while (slugs.has(slug)) slug = `${base}-${n++}`;
    }
    if (slugs.has(slug)) continue; // a second home page
    slugs.add(slug);
    out.push({
      id: /^[a-z0-9]{4,24}$/i.test(raw.id || '') ? raw.id : sid('p'),
      type: isHome ? 'home' : type, title, navLabel: String(raw.navLabel || title).trim().slice(0, 40), slug,
      purpose: String(raw.purpose ?? prev.purpose ?? '').slice(0, 600), inNav: raw.inNav !== false, order: out.length,
      sections: (Array.isArray(raw.sections) ? raw.sections : prev.sections || []).slice(0, 10).map(s => typeof s === 'string' ? { type: s.slice(0, 40), intent: '' } : { type: String(s?.type || 'content').slice(0, 40), intent: String(s?.intent || '').slice(0, 300) }),
      note: String(raw.note ?? prev.note ?? '').slice(0, 1500)
    });
  }
  // Home first, exactly once.
  const home = out.findIndex(p => p.slug === '');
  if (home === -1 && out.length) { out[0].slug = ''; out[0].type = 'home'; }
  else if (home > 0) out.unshift(...out.splice(home, 1));
  out.forEach((p, i) => { p.order = i; });
  return out;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function model(job, ctx, task, o) {
  // The deadline is a point in time for the whole step, so a correction call cannot outlive the request.
  const deadlineMs = ctx.deadlineAt ? ctx.deadlineAt - Date.now() : ctx.deadlineMs;
  if (ctx.deadlineAt && deadlineMs < 15000) throw new AnthropicError('The model call ran out of time for this request.', { type: 'timeout' });
  return callModel({ settings: ctx.settings, task, override: lighterOverride(ctx, task, job.state.input.override), jobId: job.id, projectId: job.projectId, deadlineMs, ...o });
}

/** After a step timed out with nothing to show, lower its thinking effort one level per failed attempt. */
function lighterOverride(ctx, task, base) {
  const down = ctx.step?.effortDown || 0;
  if (!down) return base || null;
  const cur = resolveTaskModel(ctx.settings, task, base || null);
  const patch = {};
  const at = EFFORTS.indexOf(cur.effort);
  if (at > 0) patch.effort = EFFORTS[Math.max(0, at - down)];
  if (at <= 0 || at - down < 0) patch.thinking = 'off';
  return { ...(base || {}), tasks: { ...(base?.tasks || {}), [task]: { ...(base?.tasks?.[task] || {}), ...patch } } };
}

/** Call a model, parse + validate, and on a bad response try once more with the problem spelled out. */
async function modelWithRepair(job, ctx, task, o, parse) {
  let prompt = o.prompt, last = null;
  const agg = { usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, cost: 0, notes: [] };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await model(job, ctx, task, { ...o, prompt });
    for (const k of Object.keys(agg.usage)) agg.usage[k] += r.usage[k] || 0;
    agg.cost = r.cost == null ? agg.cost : agg.cost + r.cost;
    agg.model = r.model;
    agg.notes.push(...(r.notes || []));
    try {
      const value = parse(r.text, r);
      return { value, ...agg };
    } catch (e) {
      last = e;
      if (attempt === 2) break;
      agg.notes.push(`${task}: response rejected (${e.message}); asked the model to correct it.`);
      prompt = `${o.prompt}\n\nIMPORTANT — a previous attempt was rejected for this reason: ${e.message}\nSend the complete, corrected output${r.truncated ? ', and be more concise so it fits' : ''}.`;
    }
  }
  const err = new Error(last?.message || 'The model response could not be used.');
  err.retryStep = true;
  throw err;
}

const str = (v, n = 600) => String(v ?? '').slice(0, n);
const strList = (v, n = 8, len = 300) => (Array.isArray(v) ? v : []).filter(x => typeof x === 'string' && x.trim()).slice(0, n).map(x => x.slice(0, len));

async function execStep(job, s, ctx) {
  const st = job.state, art = st.art, input = st.input;
  switch (s.kind) {
    case 'analyze': return stepAnalyze(job, ctx);
    case 'brief': return stepBrief(job, ctx);
    case 'sitemap': return stepSitemap(job, ctx);
    case 'design': return stepDesign(job, ctx);
    case 'page': return stepPage(job, s, ctx);
    case 'seo': return stepSeo(job, ctx);
    case 'qa': return stepQa(job, ctx);
    case 'finalize': return stepFinalize(job, ctx);
    case 'regen_page': return stepRegenPage(job, ctx);
    case 'regen_section': return stepRegenSection(job, ctx);
    case 'add_page': return stepAddPage(job, ctx);
    default: throw new Error('Unknown step: ' + s.kind + (art && input ? '' : ''));
  }
}

async function stepAnalyze(job, ctx) {
  const st = job.state, input = st.input;
  const site = await getSite(job.siteId);
  if (!site) throw new Error('Site not found.');
  const source = site.draft;
  st.art.existing = existingContentOf(source);
  if (input.upgradeType === 'convert') {
    if (!isLegacyDoc(source)) {
      st.art.notes.push('This site is already in the editable platform format; nothing to convert.');
      st.result = { converted: false, alreadyStructured: true };
      return {};
    }
    const { doc, report } = convertLegacy(source.html, { businessName: ctx.facts.name, logo: ctx.project.business?.logo || '', facts: ctx.facts });
    const fixed = autoFix(doc, {});
    const qa = await runQa(fixed.doc, {});
    st.art.qa = qa; st.art.fixes = fixed.fixes;
    const versionId = await stageVersion(job.siteId, fixed.doc, { label: 'Platform Conversion (staging)', actorId: job.createdBy, meta: { upgradeType: 'convert', jobId: job.id, report } });
    st.result = { staged: true, versionId, converted: true, report };
    for (const l of report.limitations) st.art.notes.push(l);
    return {};
  }
  return {};
}

async function stepBrief(job, ctx) {
  const art = job.state.art;
  const missing = missingFacts(ctx.facts);
  art.missing = missing;
  const base = basicBrief(ctx.facts);
  if (ctx.demo) { art.brief = base; return {}; }
  const note = art.existing ? `\n\n## THE EXISTING WEBSITE (content already written for this business — treat as supplied facts)\n${existingContentNote(art.existing, 9000)}` : '';
  const r = await modelWithRepair(job, ctx, 'architecture', { system: P.BRIEF_SYSTEM, prompt: P.briefPrompt(ctx.facts, missing) + note, maxTokens: 6000 }, text => {
    const j = P.parseJsonBlock(text);
    if (!j.summary) throw new Error('The brief has no summary.');
    return j;
  });
  const j = r.value;
  art.brief = {
    ...base,
    summary: str(j.summary, 700), positioning: str(j.positioning, 400), audience: str(j.audience, 500),
    goals: strList(j.goals), primaryAction: { ...base.primaryAction, label: str(j.primaryAction?.label, 60) || base.primaryAction.label, kind: str(j.primaryAction?.kind, 20) || base.primaryAction.kind },
    secondaryActions: strList(j.secondaryActions, 5), keyMessages: strList(j.keyMessages, 8), differentiators: strList(j.differentiators, 8),
    tone: str(j.tone, 200), voiceGuidelines: strList(j.voiceGuidelines, 6), seoKeywords: strList(j.seoKeywords, 12, 80),
    contentInventory: j.contentInventory && typeof j.contentInventory === 'object' ? j.contentInventory : {},
    cautions: strList(j.cautions, 10), questionsForClient: strList(j.questionsForClient, 8),
    missing
  };
  return r;
}

async function stepSitemap(job, ctx) {
  const st = job.state, art = st.art, input = st.input;
  const suggestion = proposeSitemap(ctx.facts);
  if (input.presetSitemap) { art.sitemap = normalizeSitemap(input.presetSitemap); art.sitemapRationale = 'Sitemap supplied by the administrator.'; return {}; }
  if (input.mode === 'upgrade' && input.upgradeType === 'refresh' && art.existing?.pages?.length) {
    // A visual refresh keeps the existing structure exactly.
    art.sitemap = normalizeSitemap(art.existing.pages.map(p => ({ id: p.id, type: p.type, title: p.title, navLabel: p.navLabel, slug: p.slug, inNav: p.inNav, purpose: p.purpose || `Same content as the current "${p.title}" page.`, sections: p.sections.map(x => ({ type: x.type, intent: x.name })) })));
    art.sitemapRationale = 'Visual Refresh keeps the existing pages and section order.';
    return {};
  }
  if (ctx.demo) { art.sitemap = normalizeSitemap(suggestion); art.sitemapRationale = 'Proposed from the material supplied (demo mode).'; return {}; }
  const upgradeNote = input.mode === 'upgrade'
    ? `${input.upgradeType === 'multipage' ? 'This is a MULTIPAGE CONVERSION of an existing one-page website: split its content across appropriate pages; every existing topic must keep a home.' : 'This is a FULL REDESIGN of an existing website.'}\nExisting pages/sections: ${art.existing?.pages?.map(p => `${p.title} [${p.sections.map(x => x.name).join(', ')}]`).join('; ') || 'one page'}\nPreserve existing page addresses where a matching page remains.`
    : '';
  const r = await modelWithRepair(job, ctx, 'architecture', { system: P.SITEMAP_SYSTEM, prompt: P.sitemapPrompt({ facts: ctx.facts, brief: art.brief, suggestion, upgradeNote }) + (input.note ? `\n\nAdministrator note: ${input.note}` : ''), maxTokens: 8000 }, text => {
    const j = P.parseJsonBlock(text);
    const pages = normalizeSitemap(j.pages);
    if (!pages.length) throw new Error('The sitemap has no pages.');
    if (!pages.some(p => p.type === 'contact') && pages.length > 1) throw new Error('The sitemap has no contact page.');
    return { pages, rationale: str(j.rationale, 800) };
  });
  art.sitemap = r.value.pages;
  art.sitemapRationale = r.value.rationale;
  return r;
}

function upgradeDesignNote(input, existing) {
  if (input.mode !== 'upgrade' || !existing) return '';
  const id = existing.identity || {};
  const idLine = [id.colors?.length && `colours ${id.colors.slice(0, 6).join(', ')}`, id.fonts?.length && `fonts ${id.fonts.slice(0, 3).join(', ')}`].filter(Boolean).join('; ');
  if (input.upgradeType === 'refresh') return `VISUAL REFRESH: improve the presentation of the existing site without changing its content or page structure. Keep the brand recognisable${idLine ? ` (current identity: ${idLine})` : ''}, but raise the craft substantially.`;
  if (input.upgradeType === 'multipage') return `MULTIPAGE CONVERSION: the business already has a one-page site${idLine ? ` (current identity: ${idLine})` : ''}. Keep it recognisably the same brand while designing a proper multipage system.`;
  return `FULL REDESIGN: replace the existing design entirely${idLine ? ` (for reference only, the old identity was: ${idLine})` : ''}.`;
}

async function stepDesign(job, ctx) {
  const st = job.state, art = st.art, input = st.input;
  const logo = ctx.project.business?.logo || '';
  if (ctx.demo) {
    const d = designFromDirection(input.direction);
    const demo = buildDemoSite({ facts: ctx.facts, direction: input.direction, sitemap: art.sitemap, logo, jobId: job.id });
    art.design = { concept: demo.design.concept, system: demo.design.system, tokens: d.tokens, css: d.css, header: demo.design.header, footer: demo.design.footer, patterns: '' };
    return {};
  }
  const task = input.mode === 'upgrade' ? 'redesign' : 'design';
  const r = await modelWithRepair(job, ctx, task, {
    system: P.DESIGN_SYSTEM_PROMPT,
    prompt: P.designPrompt({ facts: ctx.facts, brief: art.brief, direction: input.direction, sitemap: art.sitemap, upgradeNote: upgradeDesignNote(input, art.existing) }) + (input.note ? `\n\nAdministrator note: ${input.note}` : '')
  }, (text, res) => {
    const d = P.parseDesignOutput(text);
    if (res.truncated) throw new Error('The design response hit the output limit before finishing.');
    const css = sanitizeCss(d.css);
    if (css.length < 800) throw new Error('The design stylesheet is too short to be a complete design system.');
    if ((css.match(/{/g) || []).length !== (css.match(/}/g) || []).length) throw new Error('The design stylesheet has unbalanced braces.');
    if (!/data-nav[\s>=]/.test(d.header.html)) throw new Error('The header has no data-nav slot for the page links.');
    if (!/data-nav-toggle/.test(d.header.html)) throw new Error('The header has no data-nav-toggle button for mobile.');
    return { ...d, css };
  });
  const d = r.value;
  const header = ingestChrome(d.header.html, d.header.className);
  const footer = ingestChrome(d.footer.html, d.footer.className);
  if (header.removed.length) art.removed.push({ where: 'the header', tags: header.removed });
  if (footer.removed.length) art.removed.push({ where: 'the footer', tags: footer.removed });
  art.design = { concept: d.concept, system: d.system, tokens: normalizeTokens(d.tokens), css: d.css, header: header.chrome, footer: footer.chrome, patterns: d.patterns };
  return r;
}

function pageUpgradeNote(input, existing, spec) {
  if (input.mode !== 'upgrade' || !existing) return '';
  if (input.upgradeType === 'refresh') {
    const p = existing.pages.find(x => x.id === spec.id) || existing.pages.find(x => x.slug === spec.slug);
    if (!p) return '';
    return `VISUAL REFRESH — keep this page's existing content and section order. Use the existing copy verbatim (fix only obvious typos); do not add new claims or remove information.\n\nEXISTING CONTENT OF THIS PAGE:\n${p.sections.map((s, i) => `--- Section ${i + 1}: ${s.name} ---\n${s.text}`).join('\n').slice(0, 14000)}`;
  }
  const all = existingContentNote(existing, 12000);
  if (input.upgradeType === 'multipage') return `MULTIPAGE CONVERSION — this content already exists on the business's one-page site. Reuse the relevant parts of it on this page (verbatim where it reads well), and do not drop facts.\n\nEXISTING SITE CONTENT:\n${all}`;
  return `FULL REDESIGN — the existing site's content is below for reference. Rewrite freely for quality, but keep every true fact.\n\nEXISTING SITE CONTENT:\n${all}`;
}

function ingestPage(parsed, spec, art, { status = 'published', createdBy = 'admin' } = {}) {
  const sections = [];
  for (const raw of parsed.sections) {
    const { section, removed } = ingestSection(raw);
    if (removed.length) art.removed.push({ where: `"${spec.title}"`, tags: removed });
    if (textOf(section.html).length < 2 && !/<(img|svg|iframe|form)/i.test(section.html)) continue;
    sections.push(section);
  }
  let css = sanitizeCss(parsed.css || '');
  if ((css.match(/{/g) || []).length !== (css.match(/}/g) || []).length) { css = ''; art.notes.push(`"${spec.title}": page CSS was malformed and was dropped.`); }
  return normalizePage({
    id: spec.id, slug: spec.slug, title: spec.title, navLabel: spec.navLabel, type: spec.type, status, inNav: spec.inNav !== false, order: spec.order,
    purpose: spec.purpose, seo: parsed.seo, css, sections, createdBy
  }, spec.order);
}

function pageSystem(ctx, art) {
  return [
    { type: 'text', text: P.PAGE_SYSTEM },
    // Identical for every page of this site → billed once, then read from cache.
    { type: 'text', text: P.siteContextBlock({ facts: ctx.facts, brief: art.brief, design: art.design, sitemap: art.sitemap }), cache_control: { type: 'ephemeral' } }
  ];
}

function bespokeClasses(pages) {
  const set = new Set();
  for (const p of Object.values(pages || {})) for (const s of p.sections) for (const c of (s.className || '').split(/\s+/)) if (c) set.add(c);
  return [...set].slice(0, 40).join(', ');
}

async function stepPage(job, s, ctx) {
  const st = job.state, art = st.art, input = st.input;
  const spec = art.sitemap.find(p => p.id === s.pageId);
  if (!spec) throw new Error('Page is no longer in the sitemap.');
  art.pages = art.pages || {};
  if (ctx.demo) {
    const has = Object.fromEntries(art.sitemap.map(p => [p.type, true]));
    art.pages[spec.id] = normalizePage(buildTemplatePage(spec.type, ctx.facts, { id: spec.id, slug: spec.slug, title: spec.type === 'home' ? 'Home' : spec.title, navLabel: spec.navLabel, order: spec.order, inNav: spec.inNav, purpose: spec.purpose, has }), spec.order);
    return {};
  }
  const isHome = spec.slug === '';
  const note = [spec.note, pageUpgradeNote(input, art.existing, spec)].filter(Boolean).join('\n\n');
  // Sections saved from an earlier request that ran out of time (see runJob).
  const prior = s.partial?.sections?.length ? s.partial : null;
  const join = (a, b) => [a, b].filter(Boolean).join('\n');
  const fresh = list => prior ? list.filter(x => !prior.sections.some(y => y.html === x.html || (x.name && y.name === x.name && y.type === x.type))) : list;
  let r;
  try {
    r = await modelWithRepair(job, ctx, 'page', {
      system: pageSystem(ctx, art),
      prompt: P.pagePrompt({ page: spec, sitemap: art.sitemap, isHome, note, existingClasses: bespokeClasses(art.pages) })
        + (prior ? P.pageContinuationNote(prior.sections) : s.effortDown ? P.PAGE_TIGHTER_NOTE : '')
    }, (text, res) => {
      const got = P.parsePageOutput(text);
      const parsed = { ...got, sections: prior ? [...prior.sections, ...fresh(got.sections)] : got.sections, css: join(prior?.css, got.css) };
      const min = isHome ? 3 : 2;
      if (parsed.sections.length < min) throw new Error(res.truncated ? 'The page hit the output limit before enough sections were complete.' : `The page has only ${parsed.sections.length} section(s); at least ${min} are needed.`);
      if (!/<h1[\s>]/i.test(parsed.sections.map(x => x.html).join(''))) throw new Error('The page has no <h1>.');
      return parsed;
    });
  } catch (e) {
    const text = e?.partial?.text;
    if (text && e instanceof AnthropicError && (e.type === 'timeout' || e.type === 'network')) {
      const got = P.parsePageOutput(text);
      const added = fresh(got.sections);
      if (added.length) {
        s.partial = { sections: [...(prior?.sections || []), ...added], css: join(prior?.css, got.css) };
        e.progress = added.length;
      }
    }
    throw e;
  }
  delete s.partial;
  const parsed = r.value;
  if (parsed.incomplete) r.notes.push(`"${spec.title}": the response was cut off; the last unfinished section was left out.`);
  art.pages[spec.id] = ingestPage(parsed, spec, art);
  return r;
}

async function stepSeo(job, ctx) {
  const art = job.state.art;
  const pages = art.sitemap.map(p => art.pages?.[p.id]).filter(Boolean);
  const needs = pages.filter(p => !p.seo.title || !p.seo.description);
  const titles = pages.map(p => p.seo.title).filter(Boolean);
  const dup = new Set(titles).size !== titles.length;
  if (ctx.demo || (!needs.length && !dup)) return {};
  const r = await modelWithRepair(job, ctx, 'seo', {
    system: P.SEO_SYSTEM, maxTokens: 4000,
    prompt: P.seoPrompt({ facts: ctx.facts, pages: pages.map(p => ({ id: p.id, title: p.title, text: p.sections.map(x => Object.values(x.fields).filter(f => f.type === 'text').map(f => textOf(f.html)).join(' ')).join(' ') })) })
  }, text => {
    const j = P.parseJsonBlock(text);
    if (!Array.isArray(j.pages)) throw new Error('No pages in the metadata response.');
    return j.pages;
  });
  for (const m of r.value) {
    const p = pages.find(x => x.id === m.id);
    if (!p) continue;
    if (m.title) p.seo.title = str(m.title, 70);
    if (m.description) p.seo.description = str(m.description, 170);
  }
  return r;
}

function assembleDoc(job, ctx) {
  const st = job.state, art = st.art;
  const logo = ctx.project.business?.logo || '';
  return normalizeDoc({
    meta: { businessName: ctx.facts.name, lang: 'en', generator: { engine: st.input.engine, jobId: job.id, at: Date.now(), models: st.models }, upgradedFrom: st.input.mode === 'upgrade' ? st.input.upgradeType : null },
    brief: art.brief,
    direction: st.input.direction,
    design: { concept: art.design.concept, system: { ...art.design.system, patterns: art.design.patterns || '' }, tokens: art.design.tokens, css: art.design.css, header: art.design.header, footer: art.design.footer },
    pages: art.sitemap.map((spec, i) => ({ ...art.pages[spec.id], order: i })).filter(p => p.id),
    settings: { logo, favicon: logo, formRecipient: ctx.facts.email }
  });
}

async function checkRemoteImage(url) {
  if (globalThis.__wflNoRemote) return true;
  try {
    const res = await fetch(url, { method: 'GET', headers: { range: 'bytes=0-0' }, signal: AbortSignal.timeout(5000) });
    return res.ok || res.status === 206;
  } catch { return false; }
}

async function stepQa(job, ctx) {
  const st = job.state, art = st.art;
  let doc = assembleDoc(job, ctx);
  const v = validateDoc(doc);
  if (!v.ok) throw new Error('The generated site is incomplete: ' + v.errors.join(' '));
  const opts = { facts: ctx.facts, allowStock: st.input.allowStock, removed: art.removed, checkRemote: ctx.facts.photos.length ? checkRemoteImage : null };
  const fixed = autoFix(doc, opts);
  doc = sanitizeDoc(fixed.doc);
  art.fixes = fixed.fixes;
  art.qa = await runQa(doc, opts);
  art.doc = doc;
  log(job, art.qa.summary.errors ? 'warn' : 'info', `Quality checks: ${art.qa.summary.errors} error(s), ${art.qa.summary.warnings} warning(s); ${fixed.fixes.length} issue(s) fixed automatically.`);
  return {};
}

async function stepFinalize(job, ctx) {
  const st = job.state, art = st.art;
  const doc = art.doc;
  if (!doc) throw new Error('Nothing to save.');
  const site = await getSite(job.siteId);
  if (st.input.mode === 'upgrade') {
    const label = `${UPGRADE_TYPES[st.input.upgradeType].label} (staging)`;
    const versionId = await stageVersion(job.siteId, doc, { label, actorId: job.createdBy, meta: { upgradeType: st.input.upgradeType, jobId: job.id, qa: art.qa?.summary || null } });
    st.result = { staged: true, versionId, pages: doc.pages.length, qa: art.qa?.summary || null };
  } else {
    // Regenerating over an existing draft: keep what was there.
    const hadContent = site && (isLegacyDoc(site.draft) || (site.draft?.pages || []).length > 0);
    if (hadContent) await snapshotDraft(job.siteId, 'Before regeneration', { actorId: job.createdBy, meta: { auto: true, jobId: job.id } });
    const saved = await saveDraft(job.siteId, doc, { actorId: job.createdBy });
    await logEvent(job.siteId, 'site.generated', job.createdBy, { jobId: job.id, pages: doc.pages.length, engine: st.input.engine });
    st.result = { saved: true, rev: saved.rev, pages: doc.pages.length, qa: art.qa?.summary || null };
    const p = await getProject(job.projectId);
    const patch = { siteId: job.siteId, siteEngine: 'v2', direction: st.input.direction };
    if (['draft', 'lead', 'generated', undefined, null].includes(p?.status)) patch.status = 'generated';
    await patchProject(job.projectId, patch);
  }
  // The working copy of the pages is now stored on the site; keep the job row light.
  delete art.doc; art.pages = Object.fromEntries(Object.entries(art.pages || {}).map(([k, p]) => [k, { id: p.id, title: p.title, slug: p.slug, sections: p.sections.length }]));
  if (art.design) art.design = { concept: art.design.concept, system: art.design.system, tokens: art.design.tokens };
  delete art.existing;
  return {};
}

// ---------------------------------------------------------------------------
// Partial regeneration (one page, one section, or a new page) on an existing site
// ---------------------------------------------------------------------------

function siteArtifacts(doc, facts) {
  const sitemap = livePages(doc).map(p => ({ id: p.id, type: p.type, title: p.title, navLabel: p.navLabel, slug: p.slug, purpose: p.purpose, inNav: p.inNav, order: p.order, sections: p.sections.map(s => ({ type: s.type, intent: s.name })) }));
  const brief = doc.brief && Object.keys(doc.brief).length ? doc.brief : basicBrief(facts);
  const design = { concept: doc.design.concept, system: { ...doc.design.system, patterns: undefined }, tokens: doc.design.tokens, css: doc.design.css, patterns: doc.design.system?.patterns || '' };
  return { sitemap, brief, design };
}

/** Start a partial job. kind: 'page_regen' | 'section_regen' | 'page_add'. */
export async function startPartialJob(kind, project, site, input, user = null) {
  const settings = await getSettings();
  if (isLegacyDoc(site.draft)) throw Object.assign(new Error('This is a classic single-page site. Upgrade or convert it first.'), { status: 400 });
  const engine = settings.anthropicKey ? 'ai' : 'demo';
  const stepKind = kind === 'page_regen' ? 'regen_page' : kind === 'section_regen' ? 'regen_section' : 'add_page';
  const label = kind === 'page_regen' ? 'Revising the page' : kind === 'section_regen' ? 'Reworking the section' : 'Building the new page';
  const state = {
    v: 1, phase: 'build', log: [], art: { notes: [], removed: [] },
    input: { mode: 'partial', engine, override: sanitizeOverride(input.override), pageId: input.pageId || null, sectionId: input.sectionId || null,
      instruction: String(input.instruction || '').slice(0, 4000), title: String(input.title || '').slice(0, 80), type: input.type || 'standard',
      slug: input.slug || '', inNav: input.inNav !== false, byCustomer: user?.role === 'customer', baseRev: site.draftRev },
    steps: [step(stepKind, label)]
  };
  const job = await createJob({ kind, projectId: project.id, siteId: site.id, createdBy: user?.id || null, state, stage: label });
  log(job, 'info', `${label} started (${engine === 'ai' ? 'AI' : 'demo mode'}).`);
  await saveJob(job);
  return job;
}

async function loadForPartial(job, ctx) {
  const site = await getSite(job.siteId);
  if (!site) throw new Error('Site not found.');
  const doc = normalizeDoc(site.draft);
  return { site, doc, ...siteArtifacts(doc, ctx.facts) };
}

async function savePartial(job, site, doc, label, eventType, detail) {
  await snapshotDraft(job.siteId, label, { actorId: job.createdBy, meta: { auto: true, jobId: job.id } });
  // The draft may have been edited while the model was working: re-apply onto the latest.
  const saved = await saveDraft(job.siteId, doc, { actorId: job.createdBy });
  await logEvent(job.siteId, eventType, job.createdBy, { jobId: job.id, ...detail });
  return saved;
}

async function stepRegenPage(job, ctx) {
  const st = job.state, input = st.input;
  const { site, doc, sitemap, brief, design } = await loadForPartial(job, ctx);
  const page = doc.pages.find(p => p.id === input.pageId);
  if (!page) throw new Error('Page not found.');
  const spec = sitemap.find(p => p.id === page.id);
  let r = {};
  let next;
  if (ctx.demo) {
    next = normalizePage({ ...buildTemplatePage(page.type, ctx.facts, { id: page.id, slug: page.slug, title: page.title, navLabel: page.navLabel, order: page.order, inNav: page.inNav, has: Object.fromEntries(sitemap.map(p => [p.type, true])) }), seo: page.seo }, page.order);
    st.art.notes.push('Demo mode: the page was rebuilt from its template (add an API key for AI revisions).');
  } else {
    const art = { brief, design, sitemap };
    const prompt = input.instruction
      ? P.revisePagePrompt({ page, currentSections: page.sections.filter(s => !s.integration), instruction: input.instruction })
      : P.pagePrompt({ page: spec, sitemap, isHome: page.slug === '', note: 'Regenerate this page from scratch with a fresh composition.' });
    r = await modelWithRepair(job, ctx, input.instruction ? 'content' : 'page', { system: pageSystem(ctx, art), prompt }, (text, res) => {
      const parsed = P.parsePageOutput(text);
      if (parsed.sections.length < 1) throw new Error(res.truncated ? 'The response hit the output limit.' : 'No sections were returned.');
      return parsed;
    });
    next = ingestPage(r.value, { ...spec, order: page.order }, st.art, { status: page.status, createdBy: page.createdBy });
    // Integration sections are platform-managed: keep them where they were.
    page.sections.forEach((s, i) => { if (s.integration) next.sections.splice(Math.min(i, next.sections.length), 0, s); });
    if (!next.seo.title) next.seo = page.seo;
  }
  const latest = normalizeDoc((await getSite(job.siteId)).draft);
  const idx = latest.pages.findIndex(p => p.id === page.id);
  if (idx === -1) throw new Error('The page was removed while it was being revised.');
  latest.pages[idx] = { ...next, status: latest.pages[idx].status, inNav: latest.pages[idx].inNav, order: latest.pages[idx].order, slug: latest.pages[idx].slug, title: latest.pages[idx].title, navLabel: latest.pages[idx].navLabel };
  const saved = await savePartial(job, site, latest, `Before revising "${page.title}"`, 'page.regenerated', { pageId: page.id, instruction: input.instruction.slice(0, 200) });
  st.result = { saved: true, rev: saved.rev, pageId: page.id };
  return r;
}

async function stepRegenSection(job, ctx) {
  const st = job.state, input = st.input;
  const { site, doc, sitemap, brief, design } = await loadForPartial(job, ctx);
  const page = doc.pages.find(p => p.id === input.pageId);
  const section = page?.sections.find(s => s.id === input.sectionId);
  if (!page || !section) throw new Error('Section not found.');
  if (section.integration) throw new Error('Integration sections are managed in Integrations.');
  if (ctx.demo) throw new Error('Reworking a section with AI needs an Anthropic API key (Settings).');
  const current = { ...section, html: (await import('../site/html.js')).applyFields(section.html, section.fields) };
  const r = await modelWithRepair(job, ctx, 'content', { system: pageSystem(ctx, { brief, design, sitemap }), prompt: P.reviseSectionPrompt({ page, section: current, instruction: input.instruction }), maxTokens: 16000 }, text => {
    const parsed = P.parsePageOutput(text);
    if (parsed.sections.length !== 1) throw new Error(`Expected one section, got ${parsed.sections.length}.`);
    return parsed;
  });
  const { section: fresh, removed } = ingestSection({ ...r.value.sections[0], id: section.id, options: section.options });
  if (removed.length) st.art.removed.push({ where: `"${page.title}"`, tags: removed });
  const latest = normalizeDoc((await getSite(job.siteId)).draft);
  const lp = latest.pages.find(p => p.id === page.id);
  const li = lp?.sections.findIndex(s => s.id === section.id);
  if (!lp || li == null || li < 0) throw new Error('The section was removed while it was being reworked.');
  lp.sections[li] = { ...fresh, hidden: lp.sections[li].hidden };
  const extra = sanitizeCss(r.value.css || '');
  if (extra && (extra.match(/{/g) || []).length === (extra.match(/}/g) || []).length) lp.css = (lp.css + '\n' + extra).trim();
  const saved = await savePartial(job, site, latest, `Before reworking "${section.name}"`, 'section.regenerated', { pageId: page.id, sectionId: section.id });
  st.result = { saved: true, rev: saved.rev, pageId: page.id, sectionId: section.id };
  return r;
}

async function stepAddPage(job, ctx) {
  const st = job.state, input = st.input;
  const { site, doc, sitemap, brief, design } = await loadForPartial(job, ctx);
  const title = input.title || 'New page';
  let slug;
  try { slug = cleanSlug(input.slug || title); } catch (e) { throw new Error(e.message); }
  const taken = new Set(livePages(doc).map(p => p.slug));
  let n = 2; const base = slug;
  while (taken.has(slug)) slug = `${base}-${n++}`;
  const spec = { id: sid('p'), type: PAGE_TYPE_SET.has(input.type) ? input.type : 'standard', title, navLabel: title, slug, inNav: input.inNav, order: doc.pages.length,
    purpose: input.instruction || `A ${input.type || 'content'} page titled "${title}".`, sections: [] };
  let r = {};
  let page;
  if (ctx.demo || !input.instruction) {
    page = normalizePage(buildTemplatePage(spec.type, ctx.facts, { id: spec.id, slug, title, navLabel: title, order: spec.order, inNav: spec.inNav, has: Object.fromEntries(sitemap.map(p => [p.type, true])) }), spec.order);
  } else {
    const fullMap = [...sitemap, spec];
    r = await modelWithRepair(job, ctx, 'page', {
      system: pageSystem(ctx, { brief, design, sitemap: fullMap }),
      prompt: P.pagePrompt({ page: spec, sitemap: fullMap, isHome: false, note: `This is a NEW page being added to the existing site at the owner's request: "${input.instruction}". It must match the existing pages exactly in style.`, existingClasses: bespokeClasses(Object.fromEntries(doc.pages.map(p => [p.id, p]))) })
    }, (text, res) => {
      const parsed = P.parsePageOutput(text);
      if (parsed.sections.length < 2) throw new Error(res.truncated ? 'The page hit the output limit.' : 'The page needs at least two sections.');
      return parsed;
    });
    page = ingestPage(r.value, spec, st.art);
  }
  // New pages start as drafts: the owner reviews and publishes them.
  page.status = 'draft';
  page.createdBy = input.byCustomer ? 'customer' : 'admin';
  const fixed = autoFix(normalizeDoc({ ...doc, pages: [...doc.pages, page] }), { facts: ctx.facts, allowStock: false });
  const latest = normalizeDoc((await getSite(job.siteId)).draft);
  const built = fixed.doc.pages.find(p => p.id === page.id);
  latest.pages.push({ ...built, order: latest.pages.length });
  const saved = await savePartial(job, site, latest, `Before adding "${title}"`, 'page.added', { pageId: page.id, title, by: page.createdBy });
  st.result = { saved: true, rev: saved.rev, pageId: page.id, path: pagePath(built) };
  return r;
}

export { estimateTokens };
