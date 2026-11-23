'use client';
// Design Direction Engine controls: industry, personality, visual preferences,
// the free-text design prompt, structured variation with locks, and presets.
import { useState, useEffect, useMemo } from 'react';
import { api } from './api';
import { normalizeDirection, rerollDirection, directionOptionsForUi, applyPreset, newSeed, PERSONALITIES } from '@/lib/design/direction';

const OPTS = directionOptionsForUi();

export default function DirectionPanel({ direction, onChange, ctx = {}, toast = () => {}, compact = false }) {
  const d = useMemo(() => normalizeDirection(direction || {}, ctx), [direction, ctx.businessType, ctx.hasPhotos]); // eslint-disable-line
  const [presets, setPresets] = useState(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');

  const loadPresets = () => api('/api/design/presets').then(r => setPresets(r.presets)).catch(() => setPresets([]));
  useEffect(() => { loadPresets(); }, []);
  // Persist a fully-resolved direction the first time, so the site is reproducible.
  useEffect(() => { if (!direction || !direction.choices || !Object.keys(direction.choices).length) onChange(d); }, []); // eslint-disable-line

  const update = patch => onChange(normalizeDirection({ ...d, ...patch }, ctx));
  const setPref = (k, v) => update({ prefs: { ...d.prefs, [k]: v } });
  // Changing what the brief asks for re-draws the unlocked dimensions so they fit it.
  const rebrief = patch => onChange(rerollDirection(normalizeDirection({ ...d, ...patch }, ctx), ctx, { seed: d.seed }));
  const togglePersonality = p => {
    const has = d.personalities.includes(p);
    const next = has ? d.personalities.filter(x => x !== p) : [...d.personalities, p].slice(-5);
    rebrief({ personalities: next });
  };
  const reroll = only => onChange(rerollDirection(d, ctx, { only, seed: newSeed() }));
  const setChoice = (dim, id) => update({ choices: { ...d.choices, [dim]: id }, locks: { ...d.locks, [dim]: true } });
  const toggleLock = dim => update({ locks: { ...d.locks, [dim]: !d.locks[dim] } });

  async function savePreset() {
    if (!name.trim()) return toast('Name the preset first', 'error');
    setSaving(true);
    try { await api('/api/design/presets', { method: 'POST', body: { name, direction: d } }); setName(''); toast('Preset saved'); loadPresets(); }
    catch (e) { toast(e.message, 'error'); } finally { setSaving(false); }
  }
  function usePreset(id) {
    const p = presets.find(x => x.id === id);
    if (!p) return;
    onChange(applyPreset(p.config, ctx, { presetId: p.id, presetName: p.name }));
    toast(`Applied “${p.name}”`);
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="card-title" style={{ margin: 0 }}>🎨 Design direction</div>
        {presets && presets.length > 0 && (
          <select style={{ width: 'auto', maxWidth: 260 }} value="" onChange={e => usePreset(e.target.value)}>
            <option value="">Apply a saved preset…</option>
            {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>
      {d.presetName && <div className="hint" style={{ marginBottom: 10 }}>Based on preset “{d.presetName}”.</div>}

      <div className="row">
        <div className="field"><label>Industry category</label>
          <select value={d.industry} onChange={e => rebrief({ industry: e.target.value })}>{OPTS.industries.map(i => <option key={i}>{i}</option>)}</select></div>
        <div className="field"><label>Light or dark</label>
          <select value={d.prefs.mode} onChange={e => rebrief({ prefs: { ...d.prefs, mode: e.target.value } })}>{OPTS.prefs.mode.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      </div>

      <div className="field">
        <label>Design personality (choose up to five)</label>
        <div className="chips">{PERSONALITIES.map(p => <div key={p} className={'chip' + (d.personalities.includes(p) ? ' on' : '')} onClick={() => togglePersonality(p)}>{p}</div>)}</div>
        {!d.personalities.length && <div className="hint">None chosen: sensible defaults for {d.industry} are used.</div>}
      </div>

      <div className="row3">
        <div className="field"><label>Typography personality</label>
          <select value={d.prefs.typePersonality} onChange={e => rebrief({ prefs: { ...d.prefs, typePersonality: e.target.value } })}>{OPTS.prefs.typePersonality.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field"><label>Imagery vs typography</label>
          <select value={d.prefs.imagery} onChange={e => rebrief({ prefs: { ...d.prefs, imagery: e.target.value } })}>{OPTS.prefs.imagery.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field"><label>Animation intensity</label>
          <select value={d.prefs.animation} onChange={e => rebrief({ prefs: { ...d.prefs, animation: e.target.value } })}>{OPTS.prefs.animation.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      </div>
      <div className="row3">
        <div className="field"><label>Layout density</label>
          <select value={d.prefs.density} onChange={e => rebrief({ prefs: { ...d.prefs, density: e.target.value } })}>{OPTS.prefs.density.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field"><label>Palette / colour direction</label>
          <input value={d.prefs.palette} onChange={e => setPref('palette', e.target.value)} placeholder="e.g. warm neutrals with a deep green" /></div>
        <div className="field"><label>Brand tone</label>
          <input value={d.prefs.tone} onChange={e => setPref('tone', e.target.value)} placeholder="e.g. calm, expert, never salesy" /></div>
      </div>

      <div className="field">
        <label>Custom design prompt</label>
        <textarea rows={compact ? 4 : 6} value={d.customPrompt} onChange={e => update({ customPrompt: e.target.value })}
          placeholder={'Describe exactly what you want. e.g. “Create a sophisticated but approachable website with editorial typography, generous whitespace, natural photography, warm neutral colors, subtle motion, and a distinctive service presentation. Avoid generic SaaS styling.”'} />
        <div className="hint">Followed at the highest priority, wherever it does not harm usability or accessibility.</div>
      </div>
      <div className="field">
        <label>Inspiration websites (one per line, optional)</label>
        <textarea rows={2} style={{ minHeight: 0 }} value={d.inspiration.join('\n')} onChange={e => update({ inspiration: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) })} placeholder="https://example.com" />
        <div className="hint">Passed to the designer as references to take the spirit from. The links are not fetched or copied.</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, margin: '6px 0 8px', flexWrap: 'wrap' }}>
        <label style={{ margin: 0 }}>Structured variation — what makes this site different from the last</label>
        <button type="button" className="btn" onClick={() => reroll(null)}>🎲 Re-roll unlocked</button>
      </div>
      <div>
        {OPTS.dimensions.map(dim => {
          const cur = dim.options.find(o => o.id === d.choices[dim.key]) || dim.options[0];
          return (
            <div className="dim" key={dim.key}>
              <div className="small" style={{ fontWeight: 600 }}>{dim.label}</div>
              <div>
                <select value={cur.id} onChange={e => setChoice(dim.key, e.target.value)} title={cur.prompt}>
                  {dim.options.map(o => <option key={o.id} value={o.id}>{o.label}{o.mode ? ` (${o.mode})` : ''}</option>)}
                </select>
                {cur.swatch && <span className="swatches" style={{ marginLeft: 8 }}>{cur.swatch.map((c, i) => <i key={i} style={{ background: c }} />)}</span>}
              </div>
              <button type="button" className={'lock' + (d.locks[dim.key] ? ' on' : '')} title={d.locks[dim.key] ? 'Locked: kept when you re-roll' : 'Unlocked: changes when you re-roll'} onClick={() => toggleLock(dim.key)}>{d.locks[dim.key] ? '🔒' : '🔓'}</button>
            </div>
          );
        })}
      </div>
      <div className="hint" style={{ marginTop: 8 }}>Choosing an option locks it. Locked properties survive a re-roll and are kept exactly when this direction is saved as a preset.</div>

      <div className="btn-row" style={{ marginTop: 14 }}>
        <input style={{ maxWidth: 260 }} value={name} onChange={e => setName(e.target.value)} placeholder="Name this style to reuse it…" />
        <button type="button" className="btn" onClick={savePreset} disabled={saving}>{saving ? <span className="spinner" /> : '💾 Save as preset'}</button>
      </div>
    </div>
  );
}
