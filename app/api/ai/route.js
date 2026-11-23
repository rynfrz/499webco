// AI configuration: the merged model registry, presets and task assignments.
// GET  — any staff member (no secrets).
// POST — admin: refresh the live model catalog from Anthropic's Models API.
import { getSettings, saveSettings } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/auth';
import { publicAiConfig, discoverModels } from '@/lib/ai/models';
import { handle, json } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const GET = handle(async () => {
  await requireUser();
  const s = await getSettings();
  return json({ ai: publicAiConfig(s), hasKey: !!s.anthropicKey });
});

export const POST = handle(async () => {
  await requireAdmin();
  const s = await getSettings();
  if (!s.anthropicKey) throw { status: 400, message: 'Add an Anthropic API key first.' };
  let models;
  try { models = await discoverModels(s.anthropicKey, { fetchImpl: globalThis.__wflFetch || fetch, baseUrl: process.env.WFL_ANTHROPIC_BASE_URL || 'https://api.anthropic.com' }); }
  catch (e) { throw { status: 502, message: e.message }; }
  const merged = await saveSettings({ aiModelCatalog: { fetchedAt: Date.now(), models } });
  return json({ ai: publicAiConfig(merged), discovered: models.length });
});
