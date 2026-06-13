'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Setup() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(null);
  const [f, setF] = useState({ fullName: '', email: 'ryanfreeze@me.com', username: '', password: '', confirm: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/setup').then(r => r.json()).then(d => {
      setAllowed(d.needsSetup);
      if (!d.needsSetup) router.replace('/admin/login');
    });
  }, [router]);

  const set = k => e => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (f.password !== f.confirm) return setErr('Passwords do not match');
    if (f.password.length < 8) return setErr('Password must be at least 8 characters');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(f)
      });
      const d = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
      if (!res.ok) { setErr(d.error || 'Setup failed'); return; }
      router.replace('/admin');
    } catch (err) {
      setErr('Could not reach the server: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  if (allowed === null) return <div className="auth-wrap"><span className="spinner" /></div>;
  if (!allowed) return null;

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand-mark">4</div>
        <h1>Create admin account</h1>
        <p className="subtitle">First-time setup for 499web.co. This becomes your owner account.</p>
        {err && <div className="err">{err}</div>}
        <div className="field"><label>Full name</label><input value={f.fullName} onChange={set('fullName')} /></div>
        <div className="field"><label>Email</label><input type="email" value={f.email} onChange={set('email')} required /></div>
        <div className="field"><label>Username</label><input value={f.username} onChange={set('username')} required autoComplete="username" /></div>
        <div className="field"><label>Password</label><input type="password" value={f.password} onChange={set('password')} required autoComplete="new-password" /></div>
        <div className="field"><label>Confirm password</label><input type="password" value={f.confirm} onChange={set('confirm')} required autoComplete="new-password" /></div>
        <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
          {busy ? <span className="spinner" /> : 'Create account & sign in'}
        </button>
      </form>
    </div>
  );
}
