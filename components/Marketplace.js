'use client';
// Integrations marketplace for one website (customer dashboard and studio).
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, timeAgo } from './api';

const STATUS = {
  available: ['', 'Available'], connected: ['ok', 'Connected'], configuration_required: ['warn', 'Configuration Required'], error: ['error', 'Error'], unavailable: ['', 'Not available yet']
};

function Field({ f, value, onChange, options }) {
  if (f.type === 'checkbox') return <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500, marginBottom: 14 }}><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} style={{ width: 18, height: 18 }} /> {f.label}</label>;
  if (f.type === 'select') {
    const opts = options?.[f.dynamic] || [];
    if (!opts.length) return null;
    return <div className="cd-field"><label htmlFor={'f-' + f.key}>{f.label}</label><select id={'f-' + f.key} value={value || ''} onChange={e => onChange(e.target.value)}><option value="">Choose…</option>{opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>{f.help && <p className="cd-hint">{f.help}</p>}</div>;
  }
  return (
    <div className="cd-field"><label htmlFor={'f-' + f.key}>{f.label}{f.required ? '' : f.optional === false ? '' : ''}</label>
      <input id={'f-' + f.key} className="cd-input" type={f.type === 'url' ? 'url' : f.type === 'tel' ? 'tel' : 'text'} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={f.placeholder} autoComplete="off" />
      {f.help && <p className="cd-hint">{f.help}</p>}</div>
  );
}

export default function Marketplace({ siteId, editorHref, staff = false }) {
  const [data, setData] = useState(null);
  const [cat, setCat] = useState('all');
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ config: {}, secrets: {} });
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState(null);
  const toast = (text, type = 'ok') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 4500); };

  const load = () => api(`/api/sites/${siteId}/integrations`).then(setData).catch(e => setErr(e.message));
  useEffect(() => {
    load();
    const q = new URLSearchParams(window.location.search);
    if (q.get('connected')) toast('Connected successfully.');
    if (q.get('integration_error')) toast(q.get('integration_error'), 'error');
  }, [siteId]); // eslint-disable-line

  const current = data?.integrations.find(i => i.id === open);
  function show(i) { setOpen(i.id); setErr(''); setForm({ config: { ...i.config }, secrets: {} }); }

  async function act(action, extra = {}) {
    setBusy(action); setErr('');
    try {
      const d = await api(`/api/sites/${siteId}/integrations`, { method: 'POST', body: { provider: open, action, ...extra } });
      setData({ categories: d.categories, integrations: d.integrations });
      const fresh = d.integrations.find(i => i.id === open);
      if (action === 'connect') {
        if (d.status === 'connected') toast(`${fresh.name} is connected.`);
        else setForm(f => ({ config: { ...fresh.config, ...f.config }, secrets: {} }));
      }
      if (action === 'disconnect') { toast(`${fresh.name} was disconnected.`); setOpen(null); }
      if (action === 'recheck') toast(d.status === 'connected' ? 'Checked: still working.' : 'The check failed. See the details below.', d.status === 'connected' ? 'ok' : 'error');
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  }

  if (!data) return err ? <div className="cd-note error">{err}</div> : <div className="cd-center"><div className="cd-spin" /></div>;
  const list = data.integrations.filter(i => cat === 'all' || i.category === cat);
  const connected = data.integrations.filter(i => i.status !== 'available' && i.status !== 'unavailable');

  return (
    <>
      {connected.length > 0 && (
        <div className="cd-card">
          <h2>Your integrations</h2>
          <ul className="cd-list">
            {connected.map(i => (
              <li key={i.id}><div className="grow"><b>{i.name}</b><small>{i.status === 'connected' ? (i.placements.length ? 'Ready to add to a page' : 'Active on every page after you publish') : i.needs || i.error}</small></div>
                <span className={'cd-pill ' + STATUS[i.status][0]}>{STATUS[i.status][1]}</span><button className="cd-btn small" onClick={() => show(i)}>Manage</button></li>
            ))}
          </ul>
        </div>
      )}

      <div className="cd-tabs" role="tablist">
        <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>All</button>
        {data.categories.filter(c => data.integrations.some(i => i.category === c.id)).map(c => <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.label}</button>)}
      </div>

      <div className="cd-mk">
        {list.map(i => (
          <div className="cd-int" key={i.id}>
            <div className="cd-int-head">
              <div className="cd-int-ic" style={{ background: i.color, color: i.ink }}>{i.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2)}</div>
              <div><h3 style={{ margin: 0 }}>{i.name}</h3><span className={'cd-pill ' + STATUS[i.status][0]} style={{ marginTop: 4 }}>{STATUS[i.status][1]}</span></div>
            </div>
            <p>{i.description}</p>
            <ul>{i.features.slice(0, 3).map(f => <li key={f}>{f}</li>)}</ul>
            <div className="foot">
              <span><span className="cd-tag">{i.pricing.label}</span> <span className="cd-tag">Setup: {i.complexity}</span></span>
              <button className={'cd-btn small' + (i.status === 'available' && i.entitled && !i.unavailable ? ' primary' : '')} onClick={() => show(i)}>{i.unavailable ? 'Details' : i.status === 'available' ? (i.entitled ? 'Connect' : 'Details') : 'Manage'}</button>
            </div>
          </div>
        ))}
      </div>

      {current && (
        <div className="cd-modal-back" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="cd-modal" role="dialog" aria-modal="true" aria-label={current.name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div className="cd-int-head"><div className="cd-int-ic" style={{ background: current.color, color: current.ink }}>{current.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2)}</div>
                <div><h2 style={{ margin: 0 }}>{current.name}</h2><span className={'cd-pill ' + STATUS[current.status][0]} style={{ marginTop: 4 }}>{STATUS[current.status][1]}</span></div></div>
              <button className="cd-btn small" onClick={() => setOpen(null)} aria-label="Close">Close</button>
            </div>
            <p style={{ marginTop: 14 }}>{current.description}</p>

            {current.unavailable ? <div className="cd-note warn">{current.availabilityNote}</div> : !current.entitled ? (
              <div className="cd-note warn">{current.entitlementNote} {!staff && <Link href="/dashboard/account#support">Send us a message</Link>}</div>
            ) : (
              <>
                {current.status === 'error' && <div className="cd-note error">{current.error}</div>}
                {current.needs && <div className="cd-note warn">{current.needs}</div>}
                {current.status === 'connected' && current.note && <div className="cd-note">{current.note}</div>}
                {err && <div className="cd-note error" role="alert">{err}</div>}

                <h3>How to set it up</h3>
                <ol className="cd-steps">{current.setup.map(s => <li key={s}>{s}</li>)}</ol>

                {current.auth === 'oauth' ? (
                  <a className="cd-btn primary" href={`/api/integrations/oauth/start?site=${siteId}&provider=${current.id}`}>{current.status === 'available' ? `Sign in with ${current.name}` : `Reconnect ${current.name}`}</a>
                ) : (
                  <form onSubmit={e => { e.preventDefault(); act('connect', form); }}>
                    {current.secretSchema.map(f => (
                      <div className="cd-field" key={f.key}><label htmlFor={'s-' + f.key}>{f.label}</label>
                        <input id={'s-' + f.key} className="cd-input" type="password" autoComplete="off" value={form.secrets[f.key] || ''} onChange={e => setForm(x => ({ ...x, secrets: { ...x.secrets, [f.key]: e.target.value } }))} placeholder={current.hasSecrets ? 'Saved. Leave blank to keep it.' : f.placeholder} />
                        {f.help && <p className="cd-hint">{f.help}</p>}</div>
                    ))}
                    {current.configSchema.map(f => <Field key={f.key} f={f} value={form.config[f.key]} options={current.options} onChange={v => setForm(x => ({ ...x, config: { ...x.config, [f.key]: v } }))} />)}
                    <div className="cd-actions" style={{ marginTop: 4 }}>
                      <button className="cd-btn primary" disabled={!!busy}>{busy === 'connect' ? 'Checking…' : current.status === 'available' ? 'Connect' : 'Save & re-check'}</button>
                      {current.status !== 'available' && <button type="button" className="cd-btn" disabled={!!busy} onClick={() => act('recheck')}>{busy === 'recheck' ? 'Checking…' : 'Test connection'}</button>}
                      {current.status !== 'available' && <button type="button" className="cd-btn danger" disabled={!!busy} onClick={() => { if (confirm(`Disconnect ${current.name}? Its blocks disappear from your site the next time you publish.`)) act('disconnect'); }}>Disconnect</button>}
                    </div>
                  </form>
                )}
                {current.auth === 'oauth' && current.status !== 'available' && <div className="cd-actions"><button className="cd-btn" disabled={!!busy} onClick={() => act('recheck')}>Test connection</button><button className="cd-btn danger" disabled={!!busy} onClick={() => { if (confirm(`Disconnect ${current.name}?`)) act('disconnect'); }}>Disconnect</button></div>}

                {current.status === 'connected' && current.placements.length > 0 && (
                  <div className="cd-note ok" style={{ marginTop: 16 }}>
                    <b>Add it to a page:</b> open the editor, hover the section you want it to follow, press <b>+</b>, and choose “{current.placements[0].label}”. {editorHref && <Link href={editorHref}>Open the editor</Link>}
                  </div>
                )}
                {current.status === 'connected' && current.placements.length === 0 && <div className="cd-note ok" style={{ marginTop: 16 }}>This works across your whole website. <b>Publish</b> your site for it to take effect.</div>}
                {current.lastCheckedAt && <p className="cd-hint">Last checked {timeAgo(current.lastCheckedAt)}.</p>}
              </>
            )}

            <details style={{ marginTop: 16 }}><summary style={{ cursor: 'pointer', fontWeight: 600 }}>What it includes and what it can access</summary>
              <ul className="cd-steps">{current.features.map(f => <li key={f}>{f}</li>)}</ul>
              <p className="cd-hint"><b>Access needed:</b> {current.permissions.join('; ')}.</p>
              <p className="cd-hint">Passwords and keys are encrypted, kept on our servers, and never placed in your website’s pages.</p>
            </details>
          </div>
        </div>
      )}
      {msg && <div className={'cd-toast ' + msg.type} role="status">{msg.text}</div>}
    </>
  );
}
