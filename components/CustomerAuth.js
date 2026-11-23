'use client';
// Sign-in, welcome (set password) and password reset screens for customers.
import { useState, useEffect } from 'react';
import { api } from './api';
import { brand } from '@/lib/brand';

function Card({ title, lead, children, foot }) {
  return (
    <div className="cd cd-auth">
      <div className="cd-auth-card">
        <a className="cd-logo" href="/"><i>4</i>{brand.name}</a>
        <h1 style={{ fontSize: '1.5rem' }}>{title}</h1>
        {lead && <p className="cd-sub" style={{ marginBottom: 18 }}>{lead}</p>}
        {children}
        {foot && <div className="cd-auth-foot">{foot}</div>}
      </div>
    </div>
  );
}

export function Login() {
  const [f, setF] = useState({ identifier: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const d = await api('/api/auth/login', { method: 'POST', body: f });
      const next = new URLSearchParams(window.location.search).get('next') || '';
      // Only follow a same-site path that belongs to this kind of account.
      const safe = /^\/(dashboard|admin)(\/|$)/.test(next) && next.startsWith(d.next) ? next : d.next;
      window.location.assign(safe);
    } catch (e2) { setErr(e2.status === 401 ? 'That email and password don’t match. Please try again.' : e2.message); setBusy(false); }
  }
  return (
    <Card title="Sign in to your website" lead="Edit your site, add pages and see how it’s doing." foot={<a href="/reset">Forgot your password?</a>}>
      <form onSubmit={submit}>
        {err && <div className="cd-note error" role="alert">{err}</div>}
        <div className="cd-field"><label htmlFor="li-email">Email</label><input id="li-email" className="cd-input" type="email" autoComplete="username" value={f.identifier} onChange={e => setF({ ...f, identifier: e.target.value })} required autoFocus /></div>
        <div className="cd-field"><label htmlFor="li-pw">Password</label><input id="li-pw" className="cd-input" type="password" autoComplete="current-password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} required /></div>
        <button className="cd-btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </Card>
  );
}

function PasswordFields({ f, setF }) {
  return (
    <>
      <div className="cd-field"><label htmlFor="pw1">Choose a password</label><input id="pw1" className="cd-input" type="password" autoComplete="new-password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} required minLength={10} />
        <p className="cd-hint">At least 10 characters. A short sentence works well.</p></div>
      <div className="cd-field"><label htmlFor="pw2">Type it again</label><input id="pw2" className="cd-input" type="password" autoComplete="new-password" value={f.confirm} onChange={e => setF({ ...f, confirm: e.target.value })} required /></div>
    </>
  );
}

export function Welcome({ token }) {
  const [info, setInfo] = useState(null);
  const [bad, setBad] = useState('');
  const [f, setF] = useState({ fullName: '', password: '', confirm: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/api/customer/invite/' + token).then(setInfo).catch(e => setBad(e.message)); }, [token]);
  async function submit(e) {
    e.preventDefault(); setErr('');
    if (f.password !== f.confirm) return setErr('The two passwords don’t match.');
    setBusy(true);
    try { const d = await api('/api/customer/invite/' + token, { method: 'POST', body: { fullName: f.fullName, password: f.password } }); window.location.assign(d.next); }
    catch (e2) { setErr(e2.message); setBusy(false); }
  }
  if (bad) return <Card title="This link has expired" lead="Invitation links work once and for 7 days."><a className="cd-btn primary" href="/reset">Send me a new link</a></Card>;
  if (!info) return <Card title="One moment…"><div className="cd-spin" /></Card>;
  return (
    <Card title="Welcome! Let’s set up your account" lead={<>You’ll use <b>{info.email}</b> to sign in{info.businessName ? <> and manage the <b>{info.businessName}</b> website</> : ''}.</>}>
      <form onSubmit={submit}>
        {err && <div className="cd-note error" role="alert">{err}</div>}
        <div className="cd-field"><label htmlFor="wn">Your name</label><input id="wn" className="cd-input" autoComplete="name" value={f.fullName} onChange={e => setF({ ...f, fullName: e.target.value })} required autoFocus /></div>
        <PasswordFields f={f} setF={setF} />
        <button className="cd-btn primary" disabled={busy}>{busy ? 'Setting up…' : 'Open my dashboard'}</button>
      </form>
    </Card>
  );
}

export function ResetRequest() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e) { e.preventDefault(); setBusy(true); try { await api('/api/customer/reset', { method: 'POST', body: { email } }); } catch {} setSent(true); setBusy(false); }
  if (sent) return <Card title="Check your email" lead={<>If <b>{email}</b> has an account, a link to choose a new password is on its way. It works for one hour.</>} foot={<a href="/login">Back to sign in</a>} />;
  return (
    <Card title="Reset your password" lead="Enter your email and we’ll send you a link." foot={<a href="/login">Back to sign in</a>}>
      <form onSubmit={submit}>
        <div className="cd-field"><label htmlFor="re">Email</label><input id="re" className="cd-input" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required autoFocus /></div>
        <button className="cd-btn primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a link'}</button>
      </form>
    </Card>
  );
}

export function ResetSet({ token }) {
  const [f, setF] = useState({ password: '', confirm: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setErr('');
    if (f.password !== f.confirm) return setErr('The two passwords don’t match.');
    setBusy(true);
    try { const d = await api('/api/customer/reset/' + token, { method: 'POST', body: { password: f.password } }); window.location.assign(d.next); }
    catch (e2) { setErr(e2.message); setBusy(false); }
  }
  return (
    <Card title="Choose a new password" foot={<a href="/reset">Need a new link?</a>}>
      <form onSubmit={submit}>
        {err && <div className="cd-note error" role="alert">{err}</div>}
        <PasswordFields f={f} setF={setF} />
        <button className="cd-btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save and sign in'}</button>
      </form>
    </Card>
  );
}
