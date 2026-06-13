'use client';
import { useState, useEffect } from 'react';

export default function Account() {
  const [u, setU] = useState(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [msg, setMsg] = useState(null);
  const toast = (text, type = 'success') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 3500); };

  useEffect(() => { fetch('/api/account').then(r => r.json()).then(d => setU(d.user)); }, []);
  if (!u) return <div className="inner"><span className="spinner" /></div>;
  const set = k => e => setU({ ...u, [k]: e.target.value });

  async function saveDetails(e) {
    e.preventDefault();
    const res = await fetch('/api/account', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fullName: u.full_name, email: u.email, username: u.username })
    });
    const d = await res.json();
    toast(res.ok ? 'Details saved' : d.error, res.ok ? 'success' : 'error');
  }
  async function savePassword(e) {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) return toast('New passwords do not match', 'error');
    const res = await fetch('/api/account', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: pw.currentPassword, newPassword: pw.newPassword })
    });
    const d = await res.json();
    if (!res.ok) return toast(d.error, 'error');
    setPw({ currentPassword: '', newPassword: '', confirm: '' });
    toast('Password changed');
  }

  return (
    <div className="inner">
      <h1>My Account</h1>
      <p className="subtitle">Update your details. Your role (<span className={'badge ' + u.role}>{u.role}</span>) is set by an admin.</p>

      <div className="card">
        <div className="card-title">Details</div>
        <form onSubmit={saveDetails}>
          <div className="field"><label>Full name</label><input value={u.full_name || ''} onChange={set('full_name')} /></div>
          <div className="row">
            <div className="field"><label>Email</label><input type="email" value={u.email} onChange={set('email')} /></div>
            <div className="field"><label>Username</label><input value={u.username} onChange={set('username')} /></div>
          </div>
          <button className="btn primary">Save details</button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Change password</div>
        <form onSubmit={savePassword}>
          <div className="field" style={{ maxWidth: 360 }}><label>Current password</label>
            <input type="password" value={pw.currentPassword} onChange={e => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" /></div>
          <div className="row">
            <div className="field"><label>New password</label><input type="password" value={pw.newPassword} onChange={e => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" /></div>
            <div className="field"><label>Confirm new password</label><input type="password" value={pw.confirm} onChange={e => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" /></div>
          </div>
          <button className="btn primary">Change password</button>
        </form>
      </div>

      {msg && <div className={'toast ' + msg.type}>{msg.text}</div>}
    </div>
  );
}
