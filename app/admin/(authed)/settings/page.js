'use client';
import { useState, useEffect } from 'react';

export default function Settings() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState(null);
  const toast = (text, type = 'success') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 4000); };

  useEffect(() => { fetch('/api/settings').then(r => r.json()).then(d => setS(d.settings || {})); }, []);
  if (!s) return <div className="inner"><span className="spinner" /></div>;
  const set = (k, isNum) => e => setS({ ...s, [k]: isNum ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value });
  const field = (label, k, opts = {}) => (
    <div className="field">
      <label>{label}</label>
      {opts.select
        ? <select value={s[k] || ''} onChange={set(k)}>{opts.select.map(o => <option key={o} value={o}>{o}</option>)}</select>
        : <input type={opts.type || 'text'} value={s[k] ?? ''} onChange={set(k, opts.type === 'number')} placeholder={opts.placeholder || ''} />}
      {opts.hint && <div className="hint">{opts.hint}</div>}
    </div>
  );

  async function save() {
    const res = await fetch('/api/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) });
    const d = await res.json();
    toast(res.ok ? 'Settings saved' : d.error, res.ok ? 'success' : 'error');
  }

  return (
    <div className="inner">
      <h1>Settings</h1>
      <p className="subtitle">Admin only. Secrets are stored server-side and never sent back to the browser.</p>

      <div className="card">
        <div className="card-title">✦ AI engine (Claude)</div>
        {field('Anthropic API key', 'anthropicKey', { type: 'password', placeholder: 'sk-ant-…', hint: 'console.anthropic.com → API Keys. Leave blank for demo mode.' })}
        <div className="row">
          {field('Model', 'model', { select: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5-20251001'] })}
          {field('Max output tokens', 'maxTokens', { type: 'number', placeholder: '32000' })}
        </div>
      </div>

      <div className="card">
        <div className="card-title">🌐 Previews & hosting</div>
        {field('Preview domain', 'previewDomain', { placeholder: '499web.co', hint: 'The domain this app is deployed to. Previews are served at /preview/<business>/.' })}
        {field('Homepage preview slug (optional)', 'homepageSlug', { placeholder: 'e.g. 499-web', hint: 'Serve one of your published previews as the site root. Leave blank to show the auto-portfolio. Portfolio always at /portfolio.' })}
        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />
        <div className="card-title" style={{ fontSize: 13 }}>Client launches (Vercel)</div>
        {field('Vercel API token', 'vercelToken', { type: 'password', hint: 'Used to deploy each client’s final site to its own project + domain.' })}
        {field('Vercel team ID (optional)', 'vercelTeamId', { placeholder: 'team_…' })}
      </div>

      <div className="card">
        <div className="card-title">💳 Payments (Stripe)</div>
        {field('Stripe secret key', 'stripeSecretKey', { type: 'password', placeholder: 'sk_live_… or sk_test_…', hint: 'Stripe Dashboard → Developers → API keys.' })}
        {field('Stripe webhook signing secret', 'stripeWebhookSecret', { type: 'password', placeholder: 'whsec_…', hint: 'Create a webhook to /api/stripe/webhook for event checkout.session.completed, then paste its signing secret.' })}
        {field('Site price (in cents)', 'sitePriceCents', { type: 'number', placeholder: '49900', hint: '49900 = $499.00' })}
      </div>

      <div className="card">
        <div className="card-title">✉️ Email (Resend)</div>
        {field('Resend API key', 'resendApiKey', { type: 'password', placeholder: 're_…', hint: 'resend.com → API Keys. Verify the 499web.co domain for sending.' })}
        <div className="row">
          {field('From address', 'fromEmail', { placeholder: 'hello@499web.co' })}
          {field('Team notification email', 'teamNotifyEmail', { type: 'email', placeholder: 'you@499web.co', hint: 'Where new-lead and payment alerts are sent.' })}
        </div>
      </div>

      <div className="card">
        <div className="card-title">✍ Outreach identity</div>
        <div className="row">
          {field('Your name (email sign-off)', 'senderName', { placeholder: 'Jax' })}
          {field('Your email', 'senderEmail', { type: 'email' })}
        </div>
      </div>

      <div className="btn-row"><button className="btn primary" onClick={save}>Save settings</button></div>
      {msg && <div className={'toast ' + msg.type}>{msg.text}</div>}
    </div>
  );
}
