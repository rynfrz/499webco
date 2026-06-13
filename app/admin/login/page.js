'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [f, setF] = useState({ identifier: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // If no users exist yet, route to first-run setup.
    fetch('/api/auth/setup').then(r => r.json()).then(d => { if (d.needsSetup) router.replace('/admin/setup'); });
  }, [router]);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f)
      });
      const d = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
      if (!res.ok) { setErr(d.error || 'Login failed'); return; }
      router.replace(params.get('next') || '/admin');
    } catch (err) {
      setErr('Could not reach the server: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <div className="brand-mark">W</div>
      <h1>Sign in</h1>
      <p className="subtitle">Websites For Locals studio</p>
      {err && <div className="err">{err}</div>}
      <div className="field"><label>Username or email</label>
        <input value={f.identifier} onChange={e => setF({ ...f, identifier: e.target.value })} required autoComplete="username" /></div>
      <div className="field"><label>Password</label>
        <input type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} required autoComplete="current-password" /></div>
      <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
        {busy ? <span className="spinner" /> : 'Sign in'}
      </button>
    </form>
  );
}

export default function Login() {
  return (
    <div className="auth-wrap">
      <Suspense fallback={<span className="spinner" />}><LoginForm /></Suspense>
    </div>
  );
}
