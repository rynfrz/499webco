'use client';
// Studio view of a project's customer account: invite, resend, revoke.
import { useState, useEffect } from 'react';
import { api, dateTime } from './api';

export default function CustomerAccessCard({ project, toast, onChanged }) {
  const [data, setData] = useState(null);
  const [email, setEmail] = useState(project.business?.email || '');
  const [busy, setBusy] = useState('');
  const paid = ['paid', 'launched'].includes(project.status) || !!project.payment?.paidAt;
  const load = () => api(`/api/customer/admin?projectId=${project.id}`).then(setData).catch(() => setData({ members: [] }));
  useEffect(() => { load(); }, [project.id]); // eslint-disable-line

  async function act(action, extra = {}) {
    setBusy(action);
    try {
      const d = await api('/api/customer/admin', { method: 'POST', body: { projectId: project.id, action, ...extra } });
      if (d.link) { try { await navigator.clipboard.writeText(d.link); } catch {} }
      toast(action === 'invite' || action === 'resend' ? (d.emailed ? 'Invitation emailed. The link was also copied.' : 'Invitation link copied (email is not configured, so send it yourself).') : action === 'revoke' ? 'Access removed' : 'Done');
      await load(); onChanged?.();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  }

  if (!data) return null;
  if (!paid && !data.members.length) return null; // accounts come with a purchase
  return (
    <div className="card">
      <div className="card-title">🔑 Customer account</div>
      {data.members.length === 0 ? (
        <>
          <div className="hint" style={{ marginBottom: 10 }}>This customer has paid. Invite them to their dashboard, where they can edit the site, add pages and connect integrations. They only ever see this website.</div>
          <div className="pill-row">
            <input style={{ maxWidth: 320 }} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="customer@business.com" />
            <button className="btn primary" disabled={!!busy || !email} onClick={() => act('invite', { email })}>{busy === 'invite' ? <span className="spinner" /> : 'Invite customer'}</button>
          </div>
        </>
      ) : (
        <table>
          <thead><tr><th>Person</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>{data.members.map(m => (
            <tr key={m.userId}>
              <td>{m.name || '—'}<div className="small muted">{m.email}</div></td>
              <td>{m.role === 'owner' ? 'Account owner' : 'Editor'}</td>
              <td>{m.active ? <span className="badge ok">Active</span> : <span className="badge warn">Invited{m.invitedAt ? ' ' + dateTime(m.invitedAt) : ''}</span>}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {!m.active && <button className="btn ghost small" style={{ padding: '4px 9px' }} disabled={!!busy} onClick={() => act('resend', { userId: m.userId })}>Resend invite</button>}{' '}
                {m.active && <button className="btn ghost small" style={{ padding: '4px 9px' }} disabled={!!busy} onClick={() => act('resend', { userId: m.userId, reset: true })}>Send password reset</button>}{' '}
                <button className="btn ghost small danger" style={{ padding: '4px 9px' }} disabled={!!busy} onClick={() => { if (confirm(`Remove ${m.email}'s access to this website?`)) act('revoke', { userId: m.userId }); }}>Remove access</button>
              </td>
            </tr>))}</tbody>
        </table>
      )}
      {data.members.length > 0 && (
        <div className="pill-row" style={{ marginTop: 12 }}>
          <input style={{ maxWidth: 280 }} type="email" value={data.members.some(m => m.email === email) ? '' : email} onChange={e => setEmail(e.target.value)} placeholder="Add another person (editor)" />
          <button className="btn" disabled={!!busy || !email || data.members.some(m => m.email === email)} onClick={() => act('invite', { email, role: 'editor' })}>Add editor</button>
        </div>
      )}
    </div>
  );
}
