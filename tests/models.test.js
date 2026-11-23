import { describe, it, expect, beforeEach } from 'vitest';
import { modelRegistry, resolveTaskModel, buildRequestParams, estimateCost, outputCeiling, normalizeDiscovered, publicAiConfig, PRESETS, TASK_KEYS, BUILTIN_MODELS, discoverModels } from '@/lib/ai/models';
import { callModel, AnthropicError } from '@/lib/anthropic';
import { sql } from '@/lib/db';
import { freshDb, mockAnthropic } from './helpers';

describe('model registry', () => {
  it('ships exactly the three requested model identifiers', () => {
    expect(BUILTIN_MODELS.map(m => m.id)).toEqual(['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']);
  });

  it('defaults the output ceiling to 64,000 and treats it as a ceiling', () => {
    expect(outputCeiling({})).toBe(64000);
    expect(outputCeiling({ aiMaxOutputTokens: 'abc' })).toBe(64000);
    expect(outputCeiling({ aiMaxOutputTokens: 20000 })).toBe(20000);
    const opus = modelRegistry({})[0];
    expect(buildRequestParams(opus, { ceiling: 64000 }).params.max_tokens).toBe(64000);
    expect(buildRequestParams(opus, { ceiling: 64000, maxTokens: 2000 }).params.max_tokens).toBe(2000);
  });

  it('clamps max_tokens to the model limit and never sends sampling params', () => {
    const haiku = modelRegistry({}).find(m => m.tier === 'haiku');
    const { params } = buildRequestParams(haiku, { ceiling: 128000, thinking: 'adaptive', effort: 'high' });
    expect(params.max_tokens).toBe(64000);
    expect(params).not.toHaveProperty('temperature');
    // Haiku 4.5: budget thinking, no effort parameter
    expect(params.thinking.type).toBe('enabled');
    expect(params.thinking.budget_tokens).toBeLessThan(params.max_tokens);
    expect(params.output_config).toBeUndefined();
  });

  it('uses adaptive thinking and steps effort down to a supported level', () => {
    const sonnet = modelRegistry({}).find(m => m.id === 'claude-sonnet-4-6');
    const { params, applied } = buildRequestParams(sonnet, { thinking: 'adaptive', effort: 'xhigh' });
    expect(params.thinking).toEqual({ type: 'adaptive' });
    expect(applied.effort).toBe('high'); // xhigh is not offered on Sonnet 4.6
  });

  it('every preset assigns a known model to every task', () => {
    for (const key of ['premium', 'balanced', 'economy']) {
      for (const task of TASK_KEYS) {
        const r = resolveTaskModel({ aiPreset: key }, task);
        expect(r.model.id).toBe(PRESETS[key].tasks[task].model);
      }
    }
    expect(resolveTaskModel({ aiPreset: 'balanced' }, 'design').model.id).toBe('claude-opus-4-8');
    expect(resolveTaskModel({ aiPreset: 'balanced' }, 'seo').model.id).toBe('claude-haiku-4-5-20251001');
  });

  it('supports custom per-task assignment and a per-job override', () => {
    const s = { aiPreset: 'custom', aiTaskModels: { page: { model: 'claude-haiku-4-5-20251001' } }, model: 'claude-opus-4-8' };
    expect(resolveTaskModel(s, 'page').model.id).toBe('claude-haiku-4-5-20251001');
    expect(resolveTaskModel(s, 'design').model.id).toBe('claude-opus-4-8'); // falls back to the default model
    expect(resolveTaskModel(s, 'page', { model: 'claude-sonnet-4-6' }).model.id).toBe('claude-sonnet-4-6');
    expect(resolveTaskModel({ aiPreset: 'economy' }, 'design', { preset: 'premium' }).model.id).toBe('claude-opus-4-8');
  });

  it('merges live Models API data and flags models missing from it', () => {
    const live = [
      normalizeDiscovered({ id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8', max_tokens: 100000, max_input_tokens: 500000, capabilities: { thinking: { supported: true, types: { adaptive: { supported: true }, enabled: { supported: false } } }, effort: { supported: true, low: { supported: true }, high: { supported: true } } } }),
      normalizeDiscovered({ id: 'claude-new-9', display_name: 'Claude New 9', max_tokens: 32000, capabilities: {} })
    ];
    const reg = modelRegistry({ aiModelCatalog: { models: live } });
    const opus = reg.find(m => m.id === 'claude-opus-4-8');
    expect(opus.maxOutputTokens).toBe(100000);
    expect(opus.effortLevels).toEqual(['low', 'high']);
    expect(opus.pricing.input).toBe(5);           // price kept from the builtin record
    expect(reg.find(m => m.id === 'claude-new-9').available).toBe(true);
    expect(reg.find(m => m.id === 'claude-sonnet-4-6').available).toBe(false);
    // An unavailable model is swapped out, with a note
    const r = resolveTaskModel({ aiPreset: 'custom', aiTaskModels: { page: { model: 'claude-sonnet-4-6' } }, aiModelCatalog: { models: live } }, 'page');
    expect(r.model.id).toBe('claude-opus-4-8');
    expect(r.notes[0]).toMatch(/not available/);
  });

  it('estimates cost from usage and honours admin price overrides', () => {
    const opus = modelRegistry({})[0];
    expect(estimateCost(opus, { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(30);
    const custom = modelRegistry({ aiPricing: { 'claude-opus-4-8': { input: 1, output: 2 } } })[0];
    expect(estimateCost(custom, { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(3);
    expect(estimateCost({ pricing: null }, { input_tokens: 5 })).toBeNull();
  });

  it('publicAiConfig exposes no secrets', () => {
    const cfg = publicAiConfig({ anthropicKey: 'sk-ant-secret' });
    expect(JSON.stringify(cfg)).not.toContain('sk-ant-secret');
    expect(cfg.maxOutputTokens).toBe(64000);
  });

  it('discovers models through the Models API', async () => {
    const { fn } = mockAnthropic(() => ({ data: [{ id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8', max_tokens: 128000 }], has_more: false }));
    const list = await discoverModels('sk-ant-test', { fetchImpl: fn });
    expect(list[0].id).toBe('claude-opus-4-8');
  });
});

describe('callModel', () => {
  beforeEach(freshDb);

  it('streams text, records usage and cost', async () => {
    const { calls } = mockAnthropic(() => ({ text: 'hello world', usage: { input_tokens: 1000, output_tokens: 500 } }));
    const r = await callModel({ settings: { anthropicKey: 'k', aiPreset: 'balanced' }, task: 'page', prompt: 'hi', projectId: 'p1', jobId: 'j1' });
    expect(r.text).toBe('hello world');
    expect(r.model).toBe('claude-sonnet-4-6');
    expect(r.usage.output_tokens).toBe(500);
    expect(r.cost).toBeCloseTo((1000 * 3 + 500 * 15) / 1e6, 6);
    expect(calls[0].max_tokens).toBe(64000);
    expect(calls[0].thinking).toEqual({ type: 'adaptive' });
    expect(calls[0]).not.toHaveProperty('temperature');
    const rows = await sql`SELECT * FROM ai_calls`;
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('ok');
    expect(rows[0].job_id).toBe('j1');
    expect(Number(rows[0].cost_usd)).toBeGreaterThan(0);
  });

  it('retries rate limits and overloads, then succeeds', async () => {
    const { calls } = mockAnthropic((body, n) => n === 1 ? { status: 429, type: 'rate_limit_error', error: 'slow down', headers: { 'retry-after': '0' } } : n === 2 ? { status: 529, type: 'overloaded_error', headers: { 'retry-after': '0' } } : 'ok');
    const r = await callModel({ settings: { anthropicKey: 'k' }, task: 'seo', prompt: 'x' });
    expect(r.text).toBe('ok');
    expect(r.attempts).toBe(3);
    expect(calls).toHaveLength(3);
  });

  it('does not retry a bad request and logs the failure', async () => {
    const { calls } = mockAnthropic(() => ({ status: 400, type: 'invalid_request_error', error: 'bad' }));
    await expect(callModel({ settings: { anthropicKey: 'k' }, task: 'seo', prompt: 'x' })).rejects.toBeInstanceOf(AnthropicError);
    expect(calls).toHaveLength(1);
    const rows = await sql`SELECT status, error FROM ai_calls`;
    expect(rows[0].status).toBe('error');
  });

  it('falls back when a model is retired', async () => {
    const { calls } = mockAnthropic(body => body.model === 'claude-opus-4-8' ? { status: 404, type: 'not_found_error', error: 'model: claude-opus-4-8' } : 'from fallback');
    const r = await callModel({ settings: { anthropicKey: 'k', aiPreset: 'premium' }, task: 'design', prompt: 'x' });
    expect(r.text).toBe('from fallback');
    expect(r.model).toBe('claude-sonnet-4-6');
    expect(r.notes.join(' ')).toMatch(/unavailable/);
    expect(calls.map(c => c.model)).toEqual(['claude-opus-4-8', 'claude-sonnet-4-6']);
  });

  it('reports truncation at the token ceiling', async () => {
    mockAnthropic(() => ({ text: 'partial', stop: 'max_tokens' }));
    const r = await callModel({ settings: { anthropicKey: 'k' }, task: 'page', prompt: 'x' });
    expect(r.truncated).toBe(true);
  });

  it('redacts API keys from error messages', async () => {
    mockAnthropic(() => ({ status: 401, type: 'authentication_error', error: 'invalid x-api-key sk-ant-abc123DEF' }));
    const err = await callModel({ settings: { anthropicKey: 'k' }, task: 'seo', prompt: 'x' }).catch(e => e);
    expect(err.message).not.toContain('abc123DEF');
  });
});
