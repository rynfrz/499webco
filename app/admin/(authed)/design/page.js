'use client';
// Design management: saved presets, the option library, and default direction.
import { useState, useEffect } from 'react';
import { api, timeAgo } from '@/components/api';
import DirectionPanel from '@/components/DirectionPanel';
import { directionOptionsForUi, describeDirection, normalizeDirection } from '@/lib/design/direction';

const OPTS = directionOptionsForUi();

export default function DesignAdmin() {
  const [presets, setPresets] = useState(null);
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState(null);
  const toast = (text, type = 'success') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 4000); };
  const load = () => api('/api/design/presets').then(d => setPresets(d.presets)).catch(() => setPresets([]));
  useEffect(() => { load(); }, []);

  async function saveEdit() {
    try { await api('/api/design/presets/' + editing.id, { method: 'PATCH', body: { name: editing.name, note: editing.note, direction: draft } }); toast('Preset updated'); setEditing(null); setDraft(null); load(); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function remove(p) {
    if (!confirm(`Delete the preset “${p.name}”? Sites already built with it are not affected.`)) return;
    await api('/api/design/presets/' + p.id, { method: 'DELETE' }); load();
  }

  return (
    <div className="inner wide">
      <h1>Design</h1>
      <p className="subtitle">Named presets, the design option library and a playground for trying directions.</p>

      <div className="card">
        <div className="card-title">Saved presets</div>
        {!presets ? <span className="spinner" /> : presets.length === 0
          ? <div className="small muted">No presets yet. Set up a direction below (or in any project’s Brief) and choose “Save as preset”.</div>
          : (
            <table>
              <thead><tr><th>Name</th><th>Direction</th><th>Locked</th><th>Updated</th><th></th></tr></thead>
              <tbody>{presets.map(p => {
                const d = normalizeDirection(p.config, {});
                const desc = describeDirection(d);
                return (
                  <tr key={p.id}>
                    <td><b>{p.name}</b>{p.note && <div className="small muted">{p.note}</div>}<div className="small muted">{d.industry} · {d.personalities.join(', ') || 'default personality'}</div></td>
                    <td className="small">{desc.filter(x => ['typePairing', 'palette', 'layout'].includes(x.key)).map(x => x.choice).join(' · ')}</td>
                    <td className="small">{desc.filter(x => x.locked).map(x => x.label).join(', ') || '—'}</td>
                    <td className="small muted">{timeAgo(p.updatedAt)}{p.createdBy ? ' · ' + p.createdBy : ''}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn ghost small" style={{ padding: '4px 9px' }} onClick={() => { setEditing({ id: p.id, name: p.name, note: p.note || '' }); setDraft(d); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }}>Edit</button>{' '}
                      <button className="btn ghost small danger" style={{ padding: '4px 9px' }} onClick={() => remove(p)}>Delete</button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
      </div>

      <div className="card">
        <div className="card-title">Option library</div>
        <div className="hint" style={{ marginBottom: 10 }}>The pools the engine draws from. Each site gets one option per dimension, weighted by the industry, personality and preferences you set.</div>
        <div className="small" style={{ marginBottom: 8 }}><b>Industry categories:</b> {OPTS.industries.join(' · ')}</div>
        <div className="small" style={{ marginBottom: 12 }}><b>Design personalities:</b> {OPTS.personalities.join(' · ')}</div>
        {OPTS.dimensions.map(dim => (
          <details key={dim.key} style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
            <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>{dim.label} ({dim.options.length})</summary>
            <ul className="small" style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>
              {dim.options.map(o => <li key={o.id}><b>{o.label}</b>{o.swatch && <span className="swatches" style={{ marginLeft: 8 }}>{o.swatch.map((c, i) => <i key={i} style={{ background: c }} />)}</span>}{o.prompt && <span className="muted"> — {o.prompt}</span>}</li>)}
            </ul>
          </details>
        ))}
      </div>

      <h2>{editing ? `Editing preset “${editing.name}”` : 'Direction playground'}</h2>
      {editing && (
        <div className="card">
          <div className="row">
            <div className="field"><label>Preset name</label><input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
            <div className="field"><label>Note</label><input value={editing.note} onChange={e => setEditing({ ...editing, note: e.target.value })} placeholder="When to use this style" /></div>
          </div>
          <div className="btn-row" style={{ marginTop: 0 }}><button className="btn primary" onClick={saveEdit}>Save preset</button><button className="btn" onClick={() => { setEditing(null); setDraft(null); }}>Cancel</button></div>
        </div>
      )}
      <DirectionPanel direction={draft} onChange={setDraft} ctx={{}} toast={(t, type) => { toast(t, type); load(); }} />
      <div className="hint">Default generation settings (models, output ceiling, stock imagery) live in Settings → AI engine.</div>

      {msg && <div className={'toast ' + msg.type}>{msg.text}</div>}
    </div>
  );
}
