'use client';
// Studio: integration management — availability, visibility, entitlement,
// platform credentials, and connection errors across all sites.
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, timeAgo } from '@/components/api';

export default function IntegrationsAdmin() {
  const [data, setData] = useState(null);
  const [creds, setCreds] = useState(null);
  const [msg, setMsg] = useState(null);
  const toast = (text, type = 'success') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 4000); };
  const load = () => api('/api/integrations/admin').then(setData).catch(e => toast(e.message, 'error'));
  useEffect(() => { load(); }, []);

  async function patch(id, body) {
    try { await api('/api/integrations/admin', { method: 'PATCH', body: { id, ...body } }); await load(); }
    catch (e) { toast(e.message, 'error'); }
  }
  if (!data) return <div className="inner"><span className="spinner" /></div>;
  const errors = data.connections.filter(c => c.status === 'error');

  return (
    <div className="inner wide">
      <h1>Integrations</h1>
      <p className="subtitle">Control what customers see in the marketplace and who can use it. No price is shown to customers unless you set one here.</p>

      {errors.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(232,96,96,.5)' }}>
          <div className="card-title">Connection errors ({errors.length})</div>
          <table><thead><tr><th>Website</th><th>Integration</th><th>Error</th><th>Checked</th></tr></thead>
            <tbody>{errors.map((c, i) => <tr key={i}><td><b>{c.businessName}</b></td><td>{c.name}</td><td className="small" style={{ color: '#ffb4b4' }}>{c.error}</td><td className="small muted">{timeAgo(c.lastCheckedAt)}</td></tr>)}</tbody></table>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table>
          <thead><tr><th>Integration</th><th>Enabled</th><th>In marketplace</th><th>Entitlement</th><th>Requires plan</th><th>Setup fee label</th><th>Sign-in credentials</th></tr></thead>
          <tbody>{data.providers.map(p => (
            <tr key={p.id}>
              <td><b>{p.name}</b><div className="small muted">{p.category} · {p.auth} · {p.complexity}</div>{p.unavailable && <div className="small" style={{ color: 'var(--amber)', maxWidth: 320 }}>Not available: {p.availabilityNote}</div>}</td>
              <td><input type="checkbox" style={{ width: 'auto' }} checked={p.enabled} disabled={p.unavailable} onChange={e => patch(p.id, { enabled: e.target.checked })} aria-label={`Enable ${p.name}`} /></td>
              <td><input type="checkbox" style={{ width: 'auto' }} checked={p.visible} onChange={e => patch(p.id, { visible: e.target.checked })} aria-label={`Show ${p.name} in the marketplace`} /></td>
              <td><select value={p.tier} onChange={e => patch(p.id, { tier: e.target.value })} style={{ width: 130 }}><option value="included">Included</option><option value="premium">Premium</option></select></td>
              <td><select value={p.requiredPlan} onChange={e => patch(p.id, { requiredPlan: e.target.value })} style={{ width: 140 }}><option value="">Any plan</option><option>Professional</option><option>Growth</option></select></td>
              <td><input style={{ width: 140 }} defaultValue={p.setupFee} placeholder="none" onBlur={e => e.target.value !== p.setupFee && patch(p.id, { setupFee: e.target.value })} aria-label={`Setup fee label for ${p.name}`} /></td>
              <td>{p.supportsOAuth ? <button className="btn ghost small" style={{ padding: '4px 9px' }} onClick={() => setCreds({ id: p.id, name: p.name, clientId: '', clientSecret: '', has: p.hasCredentials })}>{p.hasCredentials ? '✓ Set · change' : 'Add'}</button> : <span className="small muted">not needed</span>}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <div className="hint">“Premium” and plan requirements block self-service connection; grant an individual customer access from their project. A setup-fee label is display text only; nothing is charged automatically.</div>

      {creds && (
        <div className="card">
          <div className="card-title">{creds.name}: one-click sign-in credentials</div>
          <div className="hint" style={{ marginBottom: 12 }}>From the developer app you registered with {creds.name}. Set its redirect address to <span className="mono">{typeof window !== 'undefined' ? window.location.origin : ''}/api/integrations/oauth/callback</span>. Stored encrypted and never shown again. Without these, customers connect {creds.name} with their own key instead.</div>
          <div className="row">
            <div className="field"><label>Client ID</label><input value={creds.clientId} onChange={e => setCreds({ ...creds, clientId: e.target.value })} autoComplete="off" /></div>
            <div className="field"><label>Client secret</label><input type="password" value={creds.clientSecret} onChange={e => setCreds({ ...creds, clientSecret: e.target.value })} autoComplete="off" /></div>
          </div>
          <div className="btn-row" style={{ marginTop: 0 }}>
            <button className="btn primary" disabled={!creds.clientId || !creds.clientSecret} onClick={async () => { await patch(creds.id, { credentials: { clientId: creds.clientId, clientSecret: creds.clientSecret } }); setCreds(null); toast('Credentials saved'); }}>Save</button>
            {creds.has && <button className="btn ghost danger" onClick={async () => { await patch(creds.id, { credentials: { clear: true } }); setCreds(null); toast('Credentials removed'); }}>Remove</button>}
            <button className="btn" onClick={() => setCreds(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Connections across all websites ({data.connections.length})</div>
        {data.connections.length === 0 ? <div className="small muted">No integrations connected yet.</div> : (
          <table><thead><tr><th>Website</th><th>Integration</th><th>Status</th><th>Last checked</th></tr></thead>
            <tbody>{data.connections.map((c, i) => <tr key={i}><td>{c.businessName}</td><td>{c.name}</td><td><span className={'badge ' + (c.status === 'connected' ? 'ok' : c.status === 'error' ? 'err' : 'warn')}>{c.status.replace('_', ' ')}</span></td><td className="small muted">{timeAgo(c.lastCheckedAt)}</td></tr>)}</tbody></table>
        )}
      </div>
      {msg && <div className={'toast ' + msg.type}>{msg.text}</div>}
    </div>
  );
}
