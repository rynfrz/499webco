// Model configuration system.
//
// Three layers, later ones win:
//   1. BUILTIN_MODELS  — the models this platform is tuned for (safe offline defaults)
//   2. discovered      — live data from Anthropic's Models API (GET /v1/models),
//                        cached in settings.aiModelCatalog by "Refresh models"
//   3. admin overrides — pricing per model (settings.aiPricing)
//
// Nothing else in the app hardcodes what a model can do: request parameters are
// built from the merged capability record (see buildRequestParams).

export const DEFAULT_MAX_OUTPUT_TOKENS = 64000;
export const DEFAULT_MODEL = 'claude-sonnet-4-6';

const EFFORT_ORDER = ['low', 'medium', 'high', 'xhigh', 'max'];

// Prices are USD per million tokens (Anthropic first-party list prices).
// Cache reads bill at ~0.1x input and 5-minute cache writes at ~1.25x input.
export const BUILTIN_MODELS = [
  {
    id: 'claude-opus-4-8',
    name: 'Claude Opus 4.8',
    tier: 'opus',
    maxOutputTokens: 128000,
    contextWindow: 1000000,
    thinking: { adaptive: true, budget: false },
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    structuredOutputs: true,
    pricing: { input: 5, output: 25 },
    builtin: true
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    tier: 'sonnet',
    maxOutputTokens: 128000,
    contextWindow: 1000000,
    thinking: { adaptive: true, budget: false },
    effortLevels: ['low', 'medium', 'high', 'max'],
    structuredOutputs: false,
    pricing: { input: 3, output: 15 },
    builtin: true
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    tier: 'haiku',
    maxOutputTokens: 64000,
    contextWindow: 200000,
    thinking: { adaptive: false, budget: true },
    effortLevels: [],
    structuredOutputs: true,
    pricing: { input: 1, output: 5 },
    builtin: true
  }
];

// ---------------------------------------------------------------------------
// Tasks and presets
// ---------------------------------------------------------------------------

export const TASKS = [
  { key: 'architecture', label: 'Business brief & site architecture', hint: 'Understands the business and proposes the sitemap.' },
  { key: 'design', label: 'Design direction & visual system', hint: 'Creates the sitewide design system every page inherits.' },
  { key: 'page', label: 'Page implementation', hint: 'Builds each page from the design system.' },
  { key: 'content', label: 'Content refinement & revisions', hint: 'Rewrites or revises sections and pages.' },
  { key: 'seo', label: 'SEO metadata', hint: 'Titles and descriptions.' },
  { key: 'edit', label: 'Simple content edits', hint: 'Small copy changes.' },
  { key: 'redesign', label: 'Full-site redesign & upgrades', hint: 'Design work when upgrading an existing site.' },
  { key: 'utility', label: 'Audits, analysis & outreach', hint: 'Website analysis, audit one-pagers, outreach emails, classic single-page builds.' }
];
export const TASK_KEYS = TASKS.map(t => t.key);

const OPUS = 'claude-opus-4-8', SONNET = 'claude-sonnet-4-6', HAIKU = 'claude-haiku-4-5-20251001';

export const PRESETS = {
  premium: {
    label: 'Premium Quality',
    description: 'Prioritises quality over generation cost. Opus plans, designs and builds every page.',
    tasks: {
      architecture: { model: OPUS, effort: 'high', thinking: 'adaptive' },
      design: { model: OPUS, effort: 'xhigh', thinking: 'adaptive' },
      page: { model: OPUS, effort: 'high', thinking: 'adaptive' },
      content: { model: SONNET, effort: 'high', thinking: 'adaptive' },
      seo: { model: SONNET, effort: 'low', thinking: 'off' },
      edit: { model: SONNET, effort: 'low', thinking: 'off' },
      redesign: { model: OPUS, effort: 'xhigh', thinking: 'adaptive' },
      utility: { model: SONNET, effort: 'medium', thinking: 'off' }
    }
  },
  balanced: {
    label: 'Balanced',
    description: 'Opus for architecture and design, Sonnet for pages and copy, Haiku for small jobs.',
    tasks: {
      architecture: { model: OPUS, effort: 'medium', thinking: 'adaptive' },
      design: { model: OPUS, effort: 'high', thinking: 'adaptive' },
      page: { model: SONNET, effort: 'high', thinking: 'adaptive' },
      content: { model: SONNET, effort: 'medium', thinking: 'adaptive' },
      seo: { model: HAIKU, thinking: 'off' },
      edit: { model: HAIKU, thinking: 'off' },
      redesign: { model: OPUS, effort: 'high', thinking: 'adaptive' },
      utility: { model: SONNET, effort: 'medium', thinking: 'off' }
    }
  },
  economy: {
    label: 'Economy',
    description: 'Minimises token spend. Sonnet at low effort for design and pages, Haiku for everything else.',
    tasks: {
      architecture: { model: SONNET, effort: 'low', thinking: 'off' },
      design: { model: SONNET, effort: 'medium', thinking: 'adaptive' },
      page: { model: SONNET, effort: 'low', thinking: 'off' },
      content: { model: HAIKU, thinking: 'off' },
      seo: { model: HAIKU, thinking: 'off' },
      edit: { model: HAIKU, thinking: 'off' },
      redesign: { model: SONNET, effort: 'medium', thinking: 'adaptive' },
      utility: { model: HAIKU, thinking: 'off' }
    }
  },
  custom: {
    label: 'Custom',
    description: 'Choose the model, thinking mode and effort for every task yourself.',
    tasks: null
  }
};
export const PRESET_KEYS = Object.keys(PRESETS);
export const DEFAULT_PRESET = 'balanced';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Normalise one object from GET /v1/models into our capability record. */
export function normalizeDiscovered(m) {
  const caps = m.capabilities || {};
  const supported = node => !!(node && node.supported);
  const effortLevels = EFFORT_ORDER.filter(l => supported(caps.effort?.[l]));
  return {
    id: m.id,
    name: m.display_name || m.id,
    maxOutputTokens: Number.isFinite(m.max_tokens) ? m.max_tokens : undefined,
    contextWindow: Number.isFinite(m.max_input_tokens) ? m.max_input_tokens : undefined,
    thinking: caps.thinking
      ? { adaptive: supported(caps.thinking.types?.adaptive), budget: supported(caps.thinking.types?.enabled) }
      : undefined,
    effortLevels: caps.effort ? effortLevels : undefined,
    structuredOutputs: caps.structured_outputs ? supported(caps.structured_outputs) : undefined,
    createdAt: m.created_at || null,
    discovered: true
  };
}

/** Fetch every model the API key can use. Returns normalised records. */
export async function discoverModels(apiKey, { fetchImpl = fetch, baseUrl = 'https://api.anthropic.com' } = {}) {
  if (!apiKey) throw new Error('No Anthropic API key set.');
  const out = [];
  let after = null;
  for (let page = 0; page < 10; page++) {
    const url = new URL(baseUrl + '/v1/models');
    url.searchParams.set('limit', '100');
    if (after) url.searchParams.set('after_id', after);
    const res = await fetchImpl(url, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error?.message || ''; } catch {}
      throw new Error(`Anthropic Models API error ${res.status}${detail ? ': ' + detail : ''}`);
    }
    const body = await res.json();
    for (const m of body.data || []) out.push(normalizeDiscovered(m));
    if (!body.has_more || !body.last_id) break;
    after = body.last_id;
  }
  return out;
}

function defined(obj) {
  const o = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null) o[k] = v;
  return o;
}

/**
 * The merged model list the admin UI and the request builder both use.
 * A model is `available: false` only when a live catalog exists and the model
 * is missing from it (retired, or not enabled for this API key).
 */
export function modelRegistry(settings = {}) {
  const catalog = settings.aiModelCatalog?.models || [];
  const hasCatalog = catalog.length > 0;
  const pricing = settings.aiPricing || {};
  const byId = new Map();
  for (const m of BUILTIN_MODELS) byId.set(m.id, { ...m, available: !hasCatalog });
  for (const d of catalog) {
    const base = byId.get(d.id) || aliasBase(d.id, byId);
    byId.set(d.id, { ...(base || { tier: tierOf(d.id), pricing: null, builtin: false }), ...defined(d), id: d.id, available: true });
  }
  // The dated Haiku id and its alias are the same model: if either is live, both are.
  for (const [a, b] of [['claude-haiku-4-5-20251001', 'claude-haiku-4-5']]) {
    if (byId.get(b)?.available && byId.has(a)) byId.get(a).available = true;
  }
  for (const m of byId.values()) {
    const p = pricing[m.id];
    if (p && Number.isFinite(+p.input) && Number.isFinite(+p.output)) m.pricing = { input: +p.input, output: +p.output, custom: true };
    if (!m.maxOutputTokens) m.maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS;
    if (!m.thinking) m.thinking = { adaptive: false, budget: false };
    if (!m.effortLevels) m.effortLevels = [];
  }
  const order = { opus: 0, sonnet: 1, haiku: 2 };
  return [...byId.values()].sort((a, b) =>
    (b.builtin ? 1 : 0) - (a.builtin ? 1 : 0) || (order[a.tier] ?? 9) - (order[b.tier] ?? 9) || a.id.localeCompare(b.id));
}

function aliasBase(id, byId) {
  for (const m of byId.values()) if (m.builtin && (m.id.startsWith(id) || id.startsWith(m.id))) return { ...m, builtin: false };
  return null;
}
function tierOf(id) {
  return /opus/.test(id) ? 'opus' : /sonnet/.test(id) ? 'sonnet' : /haiku/.test(id) ? 'haiku' : 'other';
}

export function getModel(settings, id) {
  return modelRegistry(settings).find(m => m.id === id) || null;
}

/** The configured output ceiling (a ceiling, never a target). */
export function outputCeiling(settings = {}) {
  const n = parseInt(settings.aiMaxOutputTokens, 10);
  if (!Number.isFinite(n) || n < 1024) return DEFAULT_MAX_OUTPUT_TOKENS;
  return Math.min(n, 128000);
}

/**
 * Which model + options to use for a task.
 * Priority: per-job override → preset (or custom table) → default model.
 * Unknown / unavailable models fall back to the default model, then to the
 * first available model, and the substitution is reported in `notes`.
 */
export function resolveTaskModel(settings = {}, task = 'utility', override = null) {
  const registry = modelRegistry(settings);
  const notes = [];
  const presetKey = PRESETS[override?.preset] ? override.preset : (PRESETS[settings.aiPreset] ? settings.aiPreset : DEFAULT_PRESET);
  const table = presetKey === 'custom' ? (settings.aiTaskModels || {}) : PRESETS[presetKey].tasks;
  const wanted = { ...(table[task] || {}) };
  if (!wanted.model) wanted.model = settings.model || DEFAULT_MODEL;
  // A job-level override can pin one model for every task, or per task.
  if (override?.model) wanted.model = override.model;
  if (override?.tasks?.[task]) Object.assign(wanted, override.tasks[task]);

  const usable = id => registry.find(m => m.id === id && m.available !== false);
  let model = usable(wanted.model);
  if (!model) {
    const fallbacks = [settings.model, DEFAULT_MODEL, ...registry.filter(m => m.builtin).map(m => m.id)].filter(Boolean);
    for (const id of fallbacks) { model = usable(id); if (model) break; }
    if (!model) model = registry.find(m => m.available !== false) || registry.find(m => m.id === wanted.model) || registry[0];
    notes.push(`Model "${wanted.model}" is not available; using "${model.id}" instead.`);
  }
  return { task, preset: presetKey, model, effort: wanted.effort || null, thinking: wanted.thinking || 'off', notes };
}

/**
 * Build the Messages API parameters a model actually accepts.
 * Sampling parameters (temperature/top_p/top_k) are never sent: current models reject them.
 */
export function buildRequestParams(model, { ceiling = DEFAULT_MAX_OUTPUT_TOKENS, maxTokens, thinking = 'off', effort = null } = {}) {
  const cap = Math.min(ceiling, model.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS);
  const max_tokens = Math.max(256, Math.min(maxTokens || cap, cap));
  const params = { max_tokens };
  const applied = { maxTokens: max_tokens, thinking: 'off', effort: null };

  if (thinking && thinking !== 'off') {
    if (model.thinking?.adaptive) {
      params.thinking = { type: 'adaptive' };
      applied.thinking = 'adaptive';
    } else if (model.thinking?.budget && max_tokens >= 4096) {
      // Older models: a fixed budget that must stay below max_tokens.
      const budget = Math.max(1024, Math.min(8000, Math.floor(max_tokens / 4)));
      params.thinking = { type: 'enabled', budget_tokens: budget };
      applied.thinking = 'budget';
    }
  }
  if (effort && model.effortLevels?.length) {
    let level = effort;
    if (!model.effortLevels.includes(level)) {
      // Step down to the nearest supported level.
      const idx = EFFORT_ORDER.indexOf(level);
      level = [...EFFORT_ORDER.slice(0, idx + 1)].reverse().find(l => model.effortLevels.includes(l)) || model.effortLevels[0];
    }
    params.output_config = { effort: level };
    applied.effort = level;
  }
  return { params, applied };
}

/** USD cost of one call, or null when the model has no known price. */
export function estimateCost(model, usage = {}) {
  const p = model?.pricing;
  if (!p) return null;
  const input = usage.input_tokens || 0, output = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0, cacheWrite = usage.cache_creation_input_tokens || 0;
  const usd = (input * p.input + output * p.output + cacheRead * p.input * 0.1 + cacheWrite * p.input * 1.25) / 1e6;
  return Math.round(usd * 1e6) / 1e6;
}

/** Rough pre-flight estimate so the admin sees a number before starting. */
export function estimateTokens(text = '') {
  return Math.ceil(String(text).length / 3.6);
}

/** Settings payload safe to send to any staff member (no secrets). */
export function publicAiConfig(settings = {}) {
  return {
    models: modelRegistry(settings).map(m => ({
      id: m.id, name: m.name, tier: m.tier, builtin: !!m.builtin, available: m.available !== false,
      maxOutputTokens: m.maxOutputTokens, contextWindow: m.contextWindow || null,
      thinking: m.thinking, effortLevels: m.effortLevels, pricing: m.pricing || null
    })),
    catalogFetchedAt: settings.aiModelCatalog?.fetchedAt || null,
    presets: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, { label: v.label, description: v.description, tasks: v.tasks }])),
    tasks: TASKS,
    preset: PRESETS[settings.aiPreset] ? settings.aiPreset : DEFAULT_PRESET,
    taskModels: settings.aiTaskModels || {},
    defaultModel: settings.model || DEFAULT_MODEL,
    maxOutputTokens: outputCeiling(settings)
  };
}
