'use client';
// Website Settings: where messages go, brand colours, domain, publishing, history.
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, dateTime } from '@/components/api';

export default function WebsiteSettings() {
  const { id } = useParams();
  const [site, setSite] = useState(null);
  const [over, setOver] = useState(null);
  const [recipient, setRecipient] = useState('');
  const [colors, setColors] = useState({ accent: '#2563eb', accent2: '#e4572e' });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const toast = (text, type = 'ok') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 4000); };
  const load = async () => {
    const d = await api('/api/sites/' + id);
    setSite(d.site);
    if (!d.site.legacy) { setRecipient(d.site.settings.formRecipient || ''); setColors({ accent: d.site.tokens.colors.accent, accent2: d.site.tokens.colors.accent2 }); }
    api(`/api/sites/${id}/overview`).then(setOver).catch(() => {});
  };
  useEffect(() => { load().catch(e => toast(e.message, 'error')); }, [id]); // eslint-disable-line

  async function op(name, ops, ok) {
    setBusy(name);
    try { await api('/api/sites/' + id, { method: 'PATCH', body: { rev: site.rev, ops } }); toast(ok); await load(); }
    catch (e) { toast(e.status === 409 ? 'Your website was changed in another window. Reloading the latest version…' : e.message, 'error'); if (e.status === 409) await load(); }
    finally { setBusy(''); }
  }
  async function publish() {
    setBusy('publish');
    try { const d = await api(`/api/sites/${id}/publish`, { method: 'POST', body: {} }); toast(d.live && !d.live.ok ? d.live.error : 'Published. Your website is up to date.', d.live && !d.live.ok ? 'error' : 'ok'); await load(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  }

  if (!site) return <div className="cd-center"><div className="cd-spin" /></div>;
  if (site.legacy) return <><h1>Website Settings</h1><div className="cd-note warn">Your website needs a one-time upgrade before these settings are available. <Link href="/dashboard/account#support">Ask us to upgrade it</Link>.</div></>;
  const hex = v => (/^#[0-9a-f]{6}$/i.test(v) ? v : '#000000');

  return (
    <>
      <h1>Website Settings</h1>
      <p className="cd-sub">The few settings that apply to your whole website.</p>

      <div className="cd-card">
        <h2>Publishing</h2>
        <p className="cd-hint" style={{ marginBottom: 12 }}>{site.dirty ? 'You have saved changes that visitors cannot see yet.' : 'Everything you have saved is published.'}</p>
        <div className="cd-actions" style={{ marginTop: 0 }}>
          <button className="cd-btn primary" onClick={publish} disabled={busy === 'publish' || (!site.dirty && site.published)}>{busy === 'publish' ? 'Publishing…' : 'Publish my changes'}</button>
          <Link className="cd-btn" href={`/dashboard/site/${id}/edit`}>Open the editor</Link>
          <a className="cd-btn" href={`/api/sites/${id}/preview/draft/`} target="_blank" rel="noopener">Preview before publishing ↗</a>
        </div>
        <p className="cd-hint">Every published version is kept. To go back to an earlier one, open the editor and choose History.</p>
      </div>

      <div className="cd-card">
        <h2>Where should website messages go?</h2>
        <div className="cd-field" style={{ maxWidth: 420, marginTop: 10 }}>
          <label htmlFor="rcp">Notification email</label>
          <input id="rcp" className="cd-input" type="email" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="you@yourbusiness.com" />
          <p className="cd-hint">Contact form messages are emailed here and also kept under Messages.</p>
        </div>
        <button className="cd-btn" disabled={busy === 'rcp' || recipient === (site.settings.formRecipient || '')} onClick={() => op('rcp', [{ op: 'settings.contact', formRecipient: recipient }], 'Saved. Remember to publish.')}>{busy === 'rcp' ? 'Saving…' : 'Save email'}</button>
      </div>

      <div className="cd-card">
        <h2>Brand colours</h2>
        <p className="cd-hint" style={{ marginBottom: 12 }}>Used for buttons and highlights on every page. Text colours adjust automatically so everything stays readable.</p>
        <div className="cd-row" style={{ maxWidth: 520 }}>
          {[['accent', 'Main colour'], ['accent2', 'Second colour']].map(([k, l]) => (
            <div key={k}><label htmlFor={'c-' + k}>{l}</label>
              <div style={{ display: 'flex', gap: 8 }}><input id={'c-' + k} type="color" value={hex(colors[k])} onChange={e => setColors(c => ({ ...c, [k]: e.target.value }))} style={{ width: 52, height: 46, padding: 2, border: '1px solid #cfd5de', borderRadius: 10, background: '#fff' }} />
                <input className="cd-input" value={colors[k]} onChange={e => setColors(c => ({ ...c, [k]: e.target.value }))} aria-label={l + ' code'} /></div></div>
          ))}
        </div>
        <div className="cd-actions"><button className="cd-btn" disabled={busy === 'col'} onClick={() => op('col', [{ op: 'brand.colors', accent: colors.accent, accent2: colors.accent2 }], 'Colours updated. Preview, then publish.')}>{busy === 'col' ? 'Saving…' : 'Apply colours'}</button></div>
      </div>

      <div className="cd-card">
        <h2>Domain</h2>
        {!over ? <div className="cd-spin" /> : over.site.domain ? (
          <>
            <p><b>{over.site.domain}</b> <span className={'cd-pill ' + (over.health.domain.state === 'ok' ? 'ok' : 'warn')} style={{ marginLeft: 8 }}>{over.health.domain.label}</span></p>
            {over.health.domain.records?.length > 0 && over.health.domain.state !== 'ok' && (
              <>
                <p className="cd-hint" style={{ marginBottom: 8 }}>To finish connecting your domain, add these records where you bought it (GoDaddy, Namecheap, Google Domains…). If that sounds unfamiliar, send us a message and we’ll do it with you.</p>
                <table className="cd-table"><thead><tr><th>Type</th><th>Name</th><th>Value</th></tr></thead><tbody>{over.health.domain.records.map((r, i) => <tr key={i}><td>{r.type}</td><td className="cd-mono">{r.name}</td><td className="cd-mono">{r.value}</td></tr>)}</tbody></table>
              </>
            )}
          </>
        ) : (
          <p className="cd-hint">Your website doesn’t have its own domain yet (for example <i>yourbusiness.com</i>). <Link href="/dashboard/account#support">Send us a message</Link> and we’ll connect one for you.</p>
        )}
        {over?.site.previewUrl && <p className="cd-hint">Preview address: <a href={over.site.previewUrl} target="_blank" rel="noopener">{over.site.previewUrl.replace(/^https?:\/\//, '')}</a></p>}
      </div>

      {site.redirects?.length > 0 && (
        <div className="cd-card"><h2>Redirects</h2><p className="cd-hint" style={{ marginBottom: 8 }}>Old page addresses that automatically send visitors to the new ones.</p>
          <table className="cd-table"><tbody>{site.redirects.map(r => <tr key={r.from}><td className="cd-mono">{r.from}</td><td>→</td><td className="cd-mono">{r.to}</td></tr>)}</tbody></table></div>
      )}
      {msg && <div className={'cd-toast ' + msg.type} role="status">{msg.text}</div>}
    </>
  );
}
