'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function Review() {
  const { token } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState('');
  const [paidParam, setPaidParam] = useState(false);

  const load = () => fetch('/api/review/' + token).then(r => r.json()).then(setD, () => setErr('Could not load'));
  useEffect(() => { load(); setPaidParam(new URLSearchParams(window.location.search).get('paid') === '1'); }, [token]);

  async function approve() {
    setBusy('approve');
    const res = await fetch('/api/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
    setBusy('');
    if (res.ok) load(); else setErr((await res.json()).error || 'Error');
  }
  async function pay() {
    setBusy('pay');
    const res = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, domain }) });
    const j = await res.json();
    setBusy('');
    if (res.ok && j.url) window.location.href = j.url;
    else setErr(j.error || 'Could not start checkout');
  }

  return (
    <div className="rv">
      <style>{CSS}</style>
      <header className="rv-hd"><a href="/" className="rv-logo" aria-label="499 Web Co."></a>
        <span className="rv-tag">Your new website</span></header>

      {!d && !err && <div className="rv-mid"><span className="spin" /></div>}
      {err && <div className="rv-mid"><p className="rv-err">{err}</p></div>}

      {d && (
        <div className="rv-wrap">
          <div className="rv-head">
            <span className="eyebrow">Private preview for</span>
            <h1>{d.businessName || 'Your business'}</h1>
            <p className="sub">Here's the website we built for you{d.city ? ' in ' + d.city : ''}. Take a look — when you love it, approve it and you're moments from going live.</p>
          </div>

          {d.hasSite && d.previewUrl ? (
            <div className="frame"><iframe src={d.previewUrl} title="Your website preview"></iframe></div>
          ) : (
            <div className="frame empty">Your preview is being finished — check back shortly or contact us.</div>
          )}
          <div className="open"><a href={d.previewUrl || '#'} target="_blank" rel="noopener">Open full preview in a new tab ↗</a></div>

          {(d.paid || paidParam) ? (
            <div className="card done">
              <div className="big">🎉 Payment received — thank you!</div>
              <p>Your website is locked in{d.domain ? ` for ${d.domain}` : ''}. We've emailed you the next steps to point your domain to your new site, and our team will confirm once you're live. Most sites go live within 24–48 hours.</p>
              {d.dnsRecords && d.dnsRecords.length > 0 && (
                <table className="dns"><thead><tr><th>Type</th><th>Name</th><th>Value</th></tr></thead>
                  <tbody>{d.dnsRecords.map((r, i) => <tr key={i}><td>{r.type}</td><td>{r.name}</td><td className="mono">{r.value}</td></tr>)}</tbody></table>
              )}
            </div>
          ) : !d.approved ? (
            <div className="card">
              <div className="big">Love it?</div>
              <p>Approve the design to continue. One flat price — <b>$499</b>, one time. No payment until you approve.</p>
              {err && <p className="rv-err">{err}</p>}
              <button className="btn" disabled={busy === 'approve' || !d.hasSite} onClick={approve}>{busy === 'approve' ? 'Approving…' : '✓ Approve this design'}</button>
            </div>
          ) : (
            <div className="card">
              <div className="big">Approved ✓ — let's make it live</div>
              <p>Last step: pay the one-time <b>$499</b> and we'll get you online. Have a domain already? Add it and we'll send the exact steps to point it here.</p>
              <label className="lbl">Your domain (optional)</label>
              <input className="inp" value={domain} onChange={e => setDomain(e.target.value)} placeholder="yourbusiness.com" />
              {err && <p className="rv-err">{err}</p>}
              <button className="btn pay" disabled={busy === 'pay'} onClick={pay}>{busy === 'pay' ? 'Starting secure checkout…' : 'Pay $499 & go live →'}</button>
              <p className="fine">Secure payment by Stripe. You'll be redirected to a secure checkout page.</p>
            </div>
          )}
        </div>
      )}
      <footer className="rv-ft">499 Web Co. · Great websites for $499 · Gwinnett County &amp; Metro Atlanta</footer>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@700;800;900&family=Inter:wght@400;500;600&display=swap');
.rv{--ink:#07080c;--panel:#0f121b;--line:#222840;--muted:#9aa3bd;--cyan:#5fd8ff;--pink:#ff2e7e;--yellow:#ffd21a;
  min-height:100vh;background:radial-gradient(1100px 600px at 80% -10%,rgba(26,166,255,.16),transparent 60%),radial-gradient(900px 600px at 0 5%,rgba(255,46,126,.12),transparent 55%),var(--ink);
  color:#eaf0ff;font-family:-apple-system,Segoe UI,Inter,sans-serif}
.rv-hd{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--line);position:sticky;top:0;background:rgba(7,8,12,.7);backdrop-filter:blur(12px);z-index:5}
.rv-logo{display:block;height:40px;width:150px;background:url(/brand/logo.png) left center/contain no-repeat;filter:drop-shadow(0 2px 10px rgba(26,166,255,.35))}
.rv-tag{font-family:'Saira Condensed',sans-serif;text-transform:uppercase;letter-spacing:.14em;font-size:12px;color:var(--muted)}
.rv-wrap{max-width:1000px;margin:0 auto;padding:40px 24px 80px}
.rv-mid{display:flex;align-items:center;justify-content:center;min-height:50vh}
.rv-head{text-align:center;margin-bottom:28px}
.eyebrow{font-family:'Saira Condensed',sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:.2em;font-size:12px;color:var(--cyan)}
.rv-head h1{font-family:'Saira Condensed',sans-serif;text-transform:uppercase;font-weight:900;font-size:clamp(34px,6vw,64px);margin:8px 0 10px}
.sub{color:var(--muted);max-width:60ch;margin:0 auto;font-size:16px;line-height:1.6}
.frame{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:#fff;height:62vh;min-height:420px;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.frame iframe{width:100%;height:100%;border:0}
.frame.empty{display:flex;align-items:center;justify-content:center;color:#444;background:#0f121b;color:var(--muted);text-align:center;padding:30px}
.open{text-align:center;margin:14px 0 30px}.open a{color:var(--cyan);font-size:14px;text-decoration:none}
.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:30px;max-width:560px;margin:0 auto;text-align:center}
.card.done{border-color:rgba(74,222,128,.4)}
.big{font-family:'Saira Condensed',sans-serif;text-transform:uppercase;font-weight:900;font-size:28px;margin-bottom:8px}
.card p{color:var(--muted);line-height:1.6;margin-bottom:18px}.card p b{color:#fff}
.lbl{display:block;text-align:left;font-size:12.5px;color:var(--muted);font-weight:600;margin-bottom:6px}
.inp{width:100%;background:var(--ink);border:1px solid var(--line);border-radius:10px;color:#fff;padding:12px 14px;font-size:15px;margin-bottom:16px;outline:none}
.inp:focus{border-color:var(--cyan)}
.btn{font-family:'Saira Condensed',sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:.04em;font-size:18px;border:0;cursor:pointer;
  padding:16px 30px;border-radius:12px;color:#04121f;background:linear-gradient(100deg,#5fd8ff,#ff2e7e);width:100%;
  box-shadow:0 10px 30px rgba(26,166,255,.3);transition:transform .15s}
.btn:hover{transform:translateY(-2px)}.btn:disabled{opacity:.55;cursor:default;transform:none}
.btn.pay{background:linear-gradient(100deg,#4ade80,#5fd8ff)}
.fine{font-size:12px;color:var(--muted);margin-top:14px}
.dns{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px;text-align:left}
.dns th{color:var(--muted);font-size:11px;text-transform:uppercase;padding:6px 8px}
.dns td{border-top:1px solid var(--line);padding:8px}.mono{font-family:ui-monospace,Menlo,monospace}
.rv-err{color:#ffb4b4;background:rgba(232,96,96,.12);border:1px solid rgba(232,96,96,.4);border-radius:8px;padding:10px;font-size:14px}
.rv-ft{text-align:center;color:var(--muted);font-size:13px;padding:30px;border-top:1px solid var(--line)}
.spin{width:30px;height:30px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--cyan);animation:sp .8s linear infinite;display:inline-block}
@keyframes sp{to{transform:rotate(360deg)}}
`;
