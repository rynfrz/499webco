'use client';
// Account: business information, profile, billing, support.
import { useState, useEffect } from 'react';
import { api, dateTime } from '@/components/api';
import { useDash } from '../DashShell';
import { brand } from '@/lib/brand';

export default function Account() {
  const { current, user } = useDash();
  const pid = current?.projectId;
  const [proj, setProj] = useState(null);
  const [biz, setBiz] = useState(null);
  const [me, setMe] = useState({ fullName: user.name || '', email: user.email });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [reqs, setReqs] = useState(null);
  const [ticket, setTicket] = useState({ subject: '', body: '' });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const toast = (text, type = 'ok') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 4200); };
  const loadReqs = () => pid && api('/api/customer/support?projectId=' + pid).then(d => setReqs(d.requests)).catch(() => setReqs([]));
  useEffect(() => {
    if (!pid) return;
    api('/api/customer/projects/' + pid).then(d => { setProj(d.project); setBiz(d.project.business); }).catch(e => toast(e.message, 'error'));
    loadReqs();
  }, [pid]); // eslint-disable-line

  async function run(name, fn, ok) { setBusy(name); try { await fn(); toast(ok); } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); } }
  const isOwner = current?.role !== 'editor';
  const f = (k, label, opts = {}) => (
    <div className="cd-field"><label htmlFor={'b-' + k}>{label}</label>
      {opts.area ? <textarea id={'b-' + k} value={biz[k]} onChange={e => setBiz({ ...biz, [k]: e.target.value })} disabled={!isOwner} rows={opts.area} />
        : <input id={'b-' + k} className="cd-input" type={opts.type || 'text'} value={biz[k]} onChange={e => setBiz({ ...biz, [k]: e.target.value })} disabled={!isOwner} />}</div>
  );

  return (
    <>
      <h1>Account</h1>
      <p className="cd-sub">Your business details, your sign-in, billing and help.</p>

      {pid && (
        <div className="cd-card">
          <h2>Business information</h2>
          <p className="cd-hint" style={{ marginBottom: 14 }}>The details we keep on file for {current.name}. Changing them here does not change the text on your website; edit that in the editor.</p>
          {!biz ? <div className="cd-spin" /> : (
            <>
              <div className="cd-row">{f('name', 'Business name')}{f('phone', 'Phone', { type: 'tel' })}</div>
              <div className="cd-row">{f('email', 'Business email', { type: 'email' })}{f('address', 'Street address')}</div>
              <div className="cd-row">{f('city', 'Town / city')}{f('state', 'State')}</div>
              {f('hours', 'Opening hours', { area: 3 })}
              {isOwner ? <button className="cd-btn primary" disabled={busy === 'biz'} onClick={() => run('biz', async () => { const d = await api('/api/customer/projects/' + pid, { method: 'PATCH', body: biz }); setBiz(d.project.business); }, 'Business information saved')}>{busy === 'biz' ? 'Saving…' : 'Save business information'}</button>
                : <p className="cd-hint">Only the account owner can change these.</p>}
            </>
          )}
        </div>
      )}

      <div className="cd-card">
        <h2>Your profile</h2>
        <div className="cd-row" style={{ marginTop: 10 }}>
          <div className="cd-field"><label htmlFor="p-name">Your name</label><input id="p-name" className="cd-input" value={me.fullName} onChange={e => setMe({ ...me, fullName: e.target.value })} autoComplete="name" /></div>
          <div className="cd-field"><label htmlFor="p-email">Sign-in email</label><input id="p-email" className="cd-input" type="email" value={me.email} onChange={e => setMe({ ...me, email: e.target.value })} autoComplete="email" /></div>
        </div>
        <button className="cd-btn" disabled={busy === 'me'} onClick={() => run('me', () => api('/api/account', { method: 'PATCH', body: { fullName: me.fullName, email: me.email } }), 'Profile saved')}>{busy === 'me' ? 'Saving…' : 'Save profile'}</button>
        <h3 style={{ marginTop: 22 }}>Change password</h3>
        <div className="cd-row" style={{ marginTop: 8 }}>
          <div className="cd-field"><label htmlFor="p-cur">Current password</label><input id="p-cur" className="cd-input" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={e => setPw({ ...pw, currentPassword: e.target.value })} /></div>
          <div className="cd-field"><label htmlFor="p-new">New password</label><input id="p-new" className="cd-input" type="password" autoComplete="new-password" value={pw.newPassword} onChange={e => setPw({ ...pw, newPassword: e.target.value })} /><p className="cd-hint">At least 10 characters.</p></div>
        </div>
        <button className="cd-btn" disabled={busy === 'pw' || !pw.currentPassword || !pw.newPassword} onClick={() => run('pw', async () => { await api('/api/account', { method: 'PATCH', body: pw }); setPw({ currentPassword: '', newPassword: '' }); }, 'Password changed')}>{busy === 'pw' ? 'Saving…' : 'Change password'}</button>
      </div>

      {pid && (
        <div className="cd-card">
          <h2>Billing</h2>
          {!proj ? <div className="cd-spin" /> : proj.billing ? (
            <table className="cd-table" style={{ marginTop: 8 }}>
              <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody><tr><td>{dateTime(proj.billing.paidAt)}</td><td>{brand.name} website ({proj.billing.plan}), one-time</td><td>{proj.billing.amount ? '$' + (proj.billing.amount / 100).toFixed(2) : '—'}</td><td><span className="cd-pill ok">Paid</span></td></tr></tbody>
            </table>
          ) : <p className="cd-hint">No payments recorded yet.</p>}
          <p className="cd-hint">Your website was a one-time purchase; there is no subscription on this account. Receipts are emailed by Stripe to {proj?.billing?.receiptEmail || 'the address used at checkout'}.</p>
        </div>
      )}

      {pid && (
        <div className="cd-card" id="support">
          <h2>Help &amp; support</h2>
          <p className="cd-hint" style={{ marginBottom: 14 }}>Stuck, or want us to make a change for you? Send a message and a real person will reply by email. You can also reach us at <a href={`mailto:${brand.email}`}>{brand.email}</a> or <a href={`tel:${brand.phoneTel}`}>{brand.phone}</a>.</p>
          <div className="cd-field"><label htmlFor="t-sub">What do you need help with?</label><input id="t-sub" className="cd-input" value={ticket.subject} onChange={e => setTicket({ ...ticket, subject: e.target.value })} placeholder="e.g. Connect my domain" /></div>
          <div className="cd-field"><label htmlFor="t-body">Details</label><textarea id="t-body" value={ticket.body} onChange={e => setTicket({ ...ticket, body: e.target.value })} placeholder="Tell us what you’d like changed, or what isn’t working." /></div>
          <button className="cd-btn primary" disabled={busy === 'tk' || !ticket.subject.trim() || !ticket.body.trim()} onClick={() => run('tk', async () => { await api('/api/customer/support', { method: 'POST', body: { projectId: pid, ...ticket } }); setTicket({ subject: '', body: '' }); await loadReqs(); }, 'Message sent. We’ll reply by email.')}>{busy === 'tk' ? 'Sending…' : 'Send message'}</button>
          {reqs?.length > 0 && (
            <ul className="cd-list" style={{ marginTop: 18 }}>
              {reqs.map(r => (
                <li key={r.id}><div className="grow"><b>{r.subject}</b><small>{dateTime(r.createdAt)} · {r.body.slice(0, 140)}</small>{r.reply && <div className="cd-note ok" style={{ margin: '8px 0 0' }}><b>Our reply:</b> {r.reply}</div>}</div><span className={'cd-pill ' + (r.status === 'open' ? 'warn' : 'ok')}>{r.status === 'open' ? 'Open' : 'Answered'}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
      {msg && <div className={'cd-toast ' + msg.type} role="status">{msg.text}</div>}
    </>
  );
}
