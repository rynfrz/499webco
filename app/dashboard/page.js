'use client';
// My Website: the customer's home. Preview, address, status, pages and health.
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { api, timeAgo } from '@/components/api';
import { useDash } from './DashShell';
import { brand } from '@/lib/brand';

function Thumb({ src }) {
  const box = useRef(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const fit = () => { if (box.current) setScale(box.current.clientWidth / 1280); };
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="cd-thumb" ref={box}>
      {src ? <iframe src={src} title="Your website preview" style={{ transform: `scale(${scale})` }} tabIndex={-1} loading="lazy" /> : <div className="empty">Your website preview will appear here once it is published.</div>}
    </div>
  );
}

const ICON = { domain: '🌐', ssl: '🔒', forms: '✉️', analytics: '📈', integrations: '🧩' };
const pillOf = state => (state === 'ok' ? 'ok' : state === 'error' ? 'error' : state === 'none' ? '' : 'warn');
const pillText = state => ({ ok: 'Working', error: 'Needs attention', pending: 'In progress', warn: 'Check', unknown: 'Unknown', none: 'Not set up' }[state] || state);

export default function MyWebsite() {
  const { current, websites, user } = useDash();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [msgs, setMsgs] = useState(null);
  const sid = current?.siteId;
  useEffect(() => {
    if (!sid) return;
    setD(null); setErr('');
    api(`/api/sites/${sid}/overview`).then(setD).catch(e => setErr(e.message));
    api(`/api/sites/${sid}/messages`).then(r => setMsgs(r.messages)).catch(() => setMsgs([]));
  }, [sid]);

  if (!websites.length) return (
    <div className="cd-card"><h1>Welcome{user.name ? ', ' + user.name.split(' ')[0] : ''}</h1>
      <p className="cd-sub">Your account is ready, but no website is linked to it yet. If you have just paid, this usually appears within a few minutes. Otherwise, contact us at <a href={`mailto:${brand.email}`}>{brand.email}</a>.</p></div>
  );
  if (!sid) return (
    <div className="cd-card"><h1>{current?.name || 'Your website'}</h1>
      <p className="cd-sub">Your website is being prepared for editing. We’ll email you as soon as it is ready. Questions? <a href={`mailto:${brand.email}`}>{brand.email}</a></p></div>
  );
  if (err) return <div className="cd-note error">{err}</div>;
  if (!d) return <div className="cd-center"><div className="cd-spin" /></div>;

  const s = d.site, h = d.health;
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const statusPill = s.status === 'live' ? ['ok', 'Live'] : s.status === 'published' ? ['ok', 'Published'] : ['warn', 'Not published yet'];
  const max = Math.max(1, ...h.analytics.days.map(x => x.views));

  return (
    <>
      <h1>{hello}{user.name ? ', ' + user.name.split(' ')[0] : ''}</h1>
      <p className="cd-sub">Here’s your website for <b>{s.businessName}</b>.</p>

      {s.legacy && <div className="cd-note warn">Your website needs a one-time upgrade before you can edit it yourself. Your web team can do this for you, usually the same day. <Link href="/dashboard/account#support">Ask us to upgrade it</Link>.</div>}
      {s.hasUnpublishedChanges && <div className="cd-note">You have changes that are saved but not published yet. <Link href={`/dashboard/site/${s.id}/edit`}>Open the editor</Link> and press Publish when you’re ready.</div>}

      <div className="cd-card">
        <div className="cd-two">
          <div>
            <span className={'cd-pill ' + statusPill[0]}>{statusPill[1]}</span>
            <h2 style={{ marginTop: 12 }}>Your website address</h2>
            {s.publicUrl ? <p className="cd-url"><a href={s.publicUrl} target="_blank" rel="noopener">{s.publicUrl.replace(/^https?:\/\//, '')} ↗</a></p> : <p className="cd-hint">Not published yet.</p>}
            {s.domain && h.domain.state !== 'ok' && <p className="cd-hint">Your own address <b>{s.domain}</b> is being connected. Until then your site is available at the address above.</p>}
            <p className="cd-hint">Last updated {timeAgo(s.updatedAt)}.</p>
            {!s.legacy && (
              <div className="cd-big">
                <Link className="primary" href={`/dashboard/site/${s.id}/edit`}><b>Edit Website</b><span>Click any text or photo to change it</span></Link>
                <Link href={`/dashboard/site/${s.id}/edit?add=1`}><b>Add Page</b><span>A new page that matches your site</span></Link>
                <Link href={`/dashboard/site/${s.id}/integrations`}><b>Integrations</b><span>Booking, maps, payments and more</span></Link>
                <Link href={`/dashboard/site/${s.id}/settings`}><b>Website Settings</b><span>Colours, contact email, domain</span></Link>
              </div>
            )}
          </div>
          <Thumb src={s.previewUrl} />
        </div>
      </div>

      <div className="cd-two">
        <div>
          <div className="cd-card">
            <h2>Pages</h2>
            <ul className="cd-list">
              {s.pages.map(p => (
                <li key={p.id}>
                  <div className="grow"><b>{p.title}</b><small>{p.path}{p.status === 'draft' ? ' · draft, not public yet' : ''}{!p.inNav && p.status !== 'draft' ? ' · not in the menu' : ''}</small></div>
                  {!s.legacy && <Link className="cd-btn small" href={`/dashboard/site/${s.id}/edit?page=${p.id}`}>Edit</Link>}
                </li>
              ))}
            </ul>
            {!s.legacy && <div className="cd-actions"><Link className="cd-btn" href={`/dashboard/site/${s.id}/edit?add=1`}>+ Add a page</Link></div>}
          </div>

          <div className="cd-card">
            <h2>Recent messages</h2>
            {!msgs ? <div className="cd-spin" /> : msgs.length === 0 ? <p className="cd-hint">Messages sent through your website’s contact form will appear here.</p> : (
              <ul className="cd-list">
                {msgs.slice(0, 4).map(m => (
                  <li key={m.id}><div className="grow"><b>{m.fields.name || m.fields.email || 'Someone'}</b><small>{(m.fields.message || Object.values(m.fields).join(' · ')).slice(0, 110)}</small></div><small>{timeAgo(m.at)}</small></li>
                ))}
              </ul>
            )}
            <div className="cd-actions"><Link className="cd-btn" href={`/dashboard/site/${s.id}/messages`}>See all messages</Link></div>
          </div>
        </div>

        <div className="cd-card">
          <h2>Website health</h2>
          <p className="cd-hint" style={{ marginBottom: 14 }}>A quick check that everything is working.</p>
          <div className="cd-health">
            <div><div className="ic">{ICON.domain}</div><div style={{ flex: 1 }}><b>Domain</b><span className="d">{s.domain ? s.domain + ' · ' : ''}{h.domain.label}</span></div><span className={'cd-pill ' + pillOf(h.domain.state)}>{pillText(h.domain.state)}</span></div>
            <div><div className="ic">{ICON.ssl}</div><div style={{ flex: 1 }}><b>Security (SSL)</b><span className="d">{h.ssl.label}</span></div><span className={'cd-pill ' + pillOf(h.ssl.state)}>{pillText(h.ssl.state)}</span></div>
            <div><div className="ic">{ICON.forms}</div><div style={{ flex: 1 }}><b>Contact form</b><span className="d">{h.forms.label}{h.forms.total ? ` · ${h.forms.last30} message${h.forms.last30 === 1 ? '' : 's'} in the last 30 days` : ''}</span></div><span className={'cd-pill ' + pillOf(h.forms.state)}>{pillText(h.forms.state)}</span></div>
            <div><div className="ic">{ICON.analytics}</div><div style={{ flex: 1 }}>
              <b>Visitors</b>
              <div className="cd-kpi" style={{ marginTop: 6 }}>{h.analytics.total.toLocaleString()}</div>
              <span className="d">page views in the last 30 days</span>
              <div className="cd-bars" role="img" aria-label="Page views per day for the last 30 days">{h.analytics.days.map((x, i) => <i key={x.day} className={i === h.analytics.days.length - 1 ? 'on' : ''} style={{ height: Math.max(3, (x.views / max) * 100) + '%' }} title={`${x.day}: ${x.views}`} />)}</div>
              {h.analytics.top.length > 0 && <span className="d">Most visited: {h.analytics.top.slice(0, 3).map(t => `${t.path === '/' ? 'Home' : t.path} (${t.views})`).join(', ')}</span>}
              {h.analytics.total === 0 && <span className="d">Counting starts once your site is published. No cookies are used.</span>}
            </div></div>
            <div><div className="ic">{ICON.integrations}</div><div style={{ flex: 1 }}><b>Integrations</b>
              {h.integrations.length === 0 ? <span className="d">None connected yet. <Link href={`/dashboard/site/${s.id}/integrations`}>Browse integrations</Link></span>
                : h.integrations.map(i => <div key={i.provider} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 6 }}><span className="d">{i.name}</span><span className={'cd-pill ' + (i.status === 'connected' ? 'ok' : i.status === 'error' ? 'error' : 'warn')}>{i.status === 'connected' ? 'Connected' : i.status === 'error' ? 'Error' : 'Setup needed'}</span></div>)}
            </div></div>
          </div>
        </div>
      </div>
    </>
  );
}
