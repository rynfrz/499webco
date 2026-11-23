// GET: any staff member (designers need non-secret bits like previewDomain).
// Secrets are redacted for non-admins. PATCH: admin only.
import { NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/auth';
import { PRESET_KEYS, TASK_KEYS } from '@/lib/ai/models';

export const runtime = 'nodejs';

const SECRET_KEYS = ['anthropicKey', 'vercelToken', 'netlifyToken', 'stripeSecretKey', 'stripeWebhookSecret', 'resendApiKey'];

/** Validate the AI configuration keys; everything else passes through as before. */
function cleanAiPatch(patch) {
  if ('aiPreset' in patch && !PRESET_KEYS.includes(patch.aiPreset)) delete patch.aiPreset;
  if ('aiMaxOutputTokens' in patch) {
    const n = parseInt(patch.aiMaxOutputTokens, 10);
    patch.aiMaxOutputTokens = Number.isFinite(n) && n >= 1024 ? Math.min(n, 128000) : 64000;
  }
  if ('aiPageConcurrency' in patch) {
    const n = parseInt(patch.aiPageConcurrency, 10);
    patch.aiPageConcurrency = Number.isFinite(n) ? Math.max(1, Math.min(4, n)) : 3;
  }
  if ('aiTaskModels' in patch) {
    const out = {};
    for (const t of TASK_KEYS) {
      const v = patch.aiTaskModels?.[t];
      if (!v || typeof v !== 'object' || !v.model) continue;
      out[t] = { model: String(v.model).slice(0, 80) };
      if (['low', 'medium', 'high', 'xhigh', 'max'].includes(v.effort)) out[t].effort = v.effort;
      out[t].thinking = v.thinking === 'adaptive' ? 'adaptive' : 'off';
    }
    patch.aiTaskModels = out;
  }
  if ('aiPricing' in patch) {
    const out = {};
    for (const [id, p] of Object.entries(patch.aiPricing || {})) {
      const i = parseFloat(p?.input), o = parseFloat(p?.output);
      if (Number.isFinite(i) && Number.isFinite(o) && i >= 0 && o >= 0) out[String(id).slice(0, 80)] = { input: i, output: o };
    }
    patch.aiPricing = out;
  }
  if ('allowStockImagery' in patch) patch.allowStockImagery = !!patch.allowStockImagery;
  delete patch.aiModelCatalog; // only written by the model refresh
  return patch;
}

export async function GET() {
  try {
    const u = await requireUser();
    const s = await getSettings();
    if (u.role !== 'admin') {
      // Redact secrets; expose only presence so the UI can warn if missing.
      const safe = { ...s };
      for (const k of SECRET_KEYS) safe[k] = s[k] ? '••••set' : '';
      delete safe.integrationPlatform;
      return NextResponse.json({ settings: safe, redacted: true });
    }
    return NextResponse.json({ settings: s, redacted: false });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}

export async function PATCH(req) {
  try {
    await requireAdmin();
    const patch = cleanAiPatch(await req.json());
    // Ignore redaction placeholders so a re-save doesn't overwrite real secrets.
    for (const k of SECRET_KEYS) if (patch[k] === '••••set') delete patch[k];
    const merged = await saveSettings(patch);
    return NextResponse.json({ settings: merged });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
