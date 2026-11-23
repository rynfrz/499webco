'use client';
// Admin → Settings → AI engine: models, presets, per-task assignment, limits.
import { useState, useEffect } from 'react';
import { api, fmtInt, dateTime } from './api';

const EFFORTS = ['', 'low', 'medium', 'high', 'xhigh', 'max'];

export default function AiSettings({ settings, setSettings, toast }) {
  const [ai, setAi] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = () => api('/api/ai').then(d => setAi(d.ai)).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!ai) return <div className="card"><span className="spinner" /></div>;

  const preset = settings.aiPreset || ai.preset;
  const custom = preset === 'custom';
  const taskModels = settings.aiTaskModels || ai.taskModels || {};
  const modelById = Object.fromEntries(ai.models.map(m => [m.id, m]));
  const table = custom ? taskModels : ai.presets[preset].tasks;
  const set = patch => setSettings({ ...settings, ...patch });

  function choosePreset(key) {
    if (key === 'custom' && !Object.keys(taskModels).length) {
      // Start a custom table from whatever was selected, so nothing is left blank.
      set({ aiPreset: 'custom', aiTaskModels: JSON.parse(JSON.stringify(ai.presets[preset === 'custom' ? 'balanced' : preset].tasks)) });
    } else set({ aiPreset: key });
  }
  function setTask(task, patch) {
    const next = { ...taskModels, [task]: { ...(taskModels[task] || { model: settings.model || ai.defaultModel, thinking: 'off' }), ...patch } };
    const m = modelById[next[task].model];
    if (m && next[task].effort && !m.effortLevels.includes(next[task].effort)) delete next[task].effort;
    if (m && next[task].thinking === 'adaptive' && !m.thinking.adaptive && !m.thinking.budget) next[task].thinking = 'off';
    set({ aiTaskModels: next });
  }
  async function refresh() {
    setRefreshing(true);
    try { const d = await api('/api/ai', { method: 'POST' }); setAi(d.ai); toast(`Found ${d.discovered} models on your Anthropic account`); }
    catch (e) { toast(e.message, 'error'); } finally { setRefreshing(false); }
  }
  const price = (id, k) => settings.aiPricing?.[id]?.[k] ?? '';
  const setPrice = (id, k, v) => {
    const cur = { ...(settings.aiPricing || {}) };
    cur[id] = { ...(cur[id] || { input: modelById[id]?.pricing?.input ?? '', output: modelById[id]?.pricing?.output ?? '' }), [k]: v };
    if (cur[id].input === '' && cur[id].output === '') delete cur[id];
    set({ aiPricing: cur });
  };

  return (
    <div className="card">
      <div className="card-title">✦ AI engine (Claude)</div>
      <div className="field">
        <label>Anthropic API key</label>
        <input type="password" value={settings.anthropicKey ?? ''} onChange={e => set({ anthropicKey: e.target.value })} placeholder="sk-ant-…" />
        <div className="hint">console.anthropic.com → API Keys. Leave blank for demo mode (template-built sites, no AI).</div>
      </div>

      <label>Quality preset</label>
      <div className="preset-grid">
        {Object.entries(ai.presets).map(([key, p]) => (
          <button type="button" key={key} className={'preset' + (preset === key ? ' on' : '')} onClick={() => choosePreset(key)}>
            <b>{p.label}</b><span>{p.description}</span>
          </button>
        ))}
      </div>

      <table className="tight" style={{ marginTop: 14 }}>
        <thead><tr><th>Task</th><th>Model</th><th>Thinking</th><th>Effort</th></tr></thead>
        <tbody>
          {ai.tasks.map(t => {
            const cur = table[t.key] || {};
            const modelId = cur.model || settings.model || ai.defaultModel;
            const m = modelById[modelId];
            if (!custom) {
              return (
                <tr key={t.key}><td><b>{t.label}</b><div className="hint" style={{ margin: 0 }}>{t.hint}</div></td>
                  <td>{m?.name || modelId}{m && !m.available && <span className="badge draft" style={{ marginLeft: 6 }}>unavailable</span>}</td>
                  <td className="muted">{cur.thinking === 'adaptive' ? 'On' : 'Off'}</td><td className="muted">{cur.effort || '—'}</td></tr>
              );
            }
            const canThink = m && (m.thinking.adaptive || m.thinking.budget);
            return (
              <tr key={t.key}><td><b>{t.label}</b><div className="hint" style={{ margin: 0 }}>{t.hint}</div></td>
                <td><select value={modelId} onChange={e => setTask(t.key, { model: e.target.value })}>
                  {ai.models.map(x => <option key={x.id} value={x.id} disabled={!x.available}>{x.name}{x.available ? '' : ' (unavailable)'}</option>)}
                </select></td>
                <td><select value={canThink && cur.thinking === 'adaptive' ? 'adaptive' : 'off'} disabled={!canThink} onChange={e => setTask(t.key, { thinking: e.target.value })}>
                  <option value="off">Off</option><option value="adaptive">{m?.thinking.adaptive ? 'Adaptive' : 'On (budget)'}</option>
                </select></td>
                <td><select value={cur.effort || ''} disabled={!m?.effortLevels.length} onChange={e => setTask(t.key, { effort: e.target.value || undefined })}>
                  {EFFORTS.filter(x => x === '' || m?.effortLevels.includes(x)).map(x => <option key={x} value={x}>{x || 'default'}</option>)}
                </select></td></tr>
            );
          })}
        </tbody>
      </table>
      <div className="hint">A preset can be overridden for an individual job when you start it.</div>

      <div className="row" style={{ marginTop: 16 }}>
        <div className="field">
          <label>Default model</label>
          <select value={settings.model || ai.defaultModel} onChange={e => set({ model: e.target.value })}>
            {ai.models.map(m => <option key={m.id} value={m.id} disabled={!m.available}>{m.id}{m.available ? '' : ' (unavailable)'}</option>)}
          </select>
          <div className="hint">Used by the classic single-page generator and whenever a task has no model assigned.</div>
        </div>
        <div className="field">
          <label>Max output tokens (ceiling)</label>
          <input type="number" min="1024" max="128000" step="1000" value={settings.aiMaxOutputTokens ?? ''} placeholder="64000" onChange={e => set({ aiMaxOutputTokens: e.target.value === '' ? '' : Number(e.target.value) })} />
          <div className="hint">A ceiling, not a target: each request asks for up to this many tokens (lower automatically for models with a smaller limit) and uses only what it needs.</div>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Pages built at the same time</label>
          <select value={settings.aiPageConcurrency || 3} onChange={e => set({ aiPageConcurrency: Number(e.target.value) })}>
            {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <div className="hint">Lower this if your Anthropic account hits rate limits.</div>
        </div>
        <div className="field">
          <label>Stock photography</label>
          <select value={settings.allowStockImagery ? 'yes' : 'no'} onChange={e => set({ allowStockImagery: e.target.value === 'yes' })}>
            <option value="no">Off — only photos supplied by the business</option>
            <option value="yes">Allow third-party image URLs (you confirm licensing)</option>
          </select>
          <div className="hint">Off is the safe default: sites never show imagery the business did not provide.</div>
        </div>
      </div>

      <details style={{ marginTop: 8 }}>
        <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Models, limits and pricing ({ai.models.length})</summary>
        <div className="btn-row" style={{ margin: '12px 0' }}>
          <button type="button" className="btn" onClick={refresh} disabled={refreshing}>{refreshing ? <span className="spinner" /> : '⟳ Refresh from Anthropic'}</button>
          <span className="small muted">{ai.catalogFetchedAt ? `Live capabilities fetched ${dateTime(ai.catalogFetchedAt)}` : 'Using built-in defaults. Refresh to read limits and capabilities for your account.'}</span>
        </div>
        <table className="tight">
          <thead><tr><th>Model</th><th>Max output</th><th>Thinking</th><th>Effort levels</th><th>$ / 1M in</th><th>$ / 1M out</th></tr></thead>
          <tbody>{ai.models.map(m => (
            <tr key={m.id}>
              <td><span className="mono">{m.id}</span>{!m.available && <span className="badge draft" style={{ marginLeft: 6 }}>unavailable</span>}</td>
              <td>{fmtInt(m.maxOutputTokens)}</td>
              <td>{m.thinking.adaptive ? 'adaptive' : m.thinking.budget ? 'budget' : '—'}</td>
              <td className="small">{m.effortLevels.join(', ') || '—'}</td>
              <td><input style={{ width: 76 }} type="number" step="0.01" min="0" value={price(m.id, 'input')} placeholder={m.pricing?.input ?? '—'} onChange={e => setPrice(m.id, 'input', e.target.value)} /></td>
              <td><input style={{ width: 76 }} type="number" step="0.01" min="0" value={price(m.id, 'output')} placeholder={m.pricing?.output ?? '—'} onChange={e => setPrice(m.id, 'output', e.target.value)} /></td>
            </tr>))}</tbody>
        </table>
        <div className="hint">Prices are used only to estimate generation cost. Leave blank to use the built-in list price; set them for models that have none.</div>
      </details>
    </div>
  );
}
