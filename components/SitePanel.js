'use client';
// The studio's view of a structured website inside a project:
// multi-page preview, per-page AI revisions, pages, quality checks,
// version history / rollback, staged upgrades and the upgrade workflow.
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { api, dateTime, timeAgo } from './api';
import BuildPanel, { useJobRunner, JobProgress } from './BuildPanel';
import DirectionPanel from './DirectionPanel';
import Marketplace from './Marketplace';
import '../app/dashboard/dashboard.css';

const WIDTHS = [['Desktop', '100%'], ['Tablet', '768px'], ['Phone', '390px']];
const UPGRADES = [
  ['convert', 'Platform Conversion', 'Moves the existing site into the editable format and keeps its appearance. No AI, no cost.'],
  ['refresh', 'Visual Refresh', 'A new, better-crafted design for the same content and page structure.'],
  ['multipage', 'Multipage Conversion', 'Expands a one-page site into a proper multipage site, reusing its content.'],
  ['redesign', 'Full Redesign', 'A substantially improved site from the current business information and design direction.']
];

function Issues({ qa }) {
  if (!qa) return null;
  const order = { error: 0, warning: 1, info: 2 };
  const list = [...qa.issues].sort((a, b) => order[a.severity] - order[b.severity]);
  if (!list.length) return <div className="ok">No issues found.</div>;
  return <div>{list.map((i, n) => <div className="issue" key={n}><span className={'badge ' + (i.severity === 'error' ? 'err' : i.severity === 'warning' ? 'warn' : 'info')}>{i.severity}</span><span>{i.message}</span></div>)}</div>;
}

/** Render every page at three widths in hidden iframes and look for real layout problems. */
async function browserCheck(siteId, pages, onProgress) {
  const findings = [];
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none';
  document.body.appendChild(holder);
  let n = 0;
  try {
    for (const p of pages) {
      for (const width of [390, 768, 1280]) {
        onProgress(`${p.title} @ ${width}px (${++n}/${pages.length * 3})`);
        const frame = document.createElement('iframe');
        frame.style.cssText = `width:${width}px;height:900px;border:0`;
        holder.appendChild(frame);
        await new Promise(resolve => {
          const done = () => resolve();
          frame.onload = done;
          setTimeout(done, 9000);
          frame.src = `/api/sites/${siteId}/preview/draft/${p.slug}`;
        });
        await new Promise(r => setTimeout(r, 500));
        try {
          const doc = frame.contentDocument;
          const root = doc.documentElement;
          const over = root.scrollWidth - root.clientWidth;
          if (over > 2) {
            let culprit = '';
            for (const el of doc.body.querySelectorAll('*')) {
              const r = el.getBoundingClientRect();
              if (r.right > root.clientWidth + 2 && r.width > 0) { culprit = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''); break; }
            }
            findings.push({ page: p.title, width, code: 'overflow', message: `Sideways scrolling: content is ${over}px wider than the screen${culprit ? ` (first offender: ${culprit})` : ''}.` });
          }
          const broken = [...doc.images].filter(i => i.complete && i.naturalWidth === 0);
          if (broken.length && width === 1280) findings.push({ page: p.title, width, code: 'image_broken', message: `${broken.length} image(s) failed to load.` });
          const tiny = [...doc.querySelectorAll('a.w-btn, button, nav a')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 28 && width === 390; });
          if (tiny.length) findings.push({ page: p.title, width, code: 'tap_target', message: `${tiny.length} button(s)/link(s) are under 28px tall on phones.` });
          if (!doc.querySelector('h1')) findings.push({ page: p.title, width, code: 'no_h1', message: 'No main heading rendered.' });
        } catch (e) { findings.push({ page: p.title, width, code: 'inspect_failed', message: 'Could not inspect the rendered page.' }); }
        frame.remove();
      }
    }
  } finally { holder.remove(); }
  return findings;
}

export default function SitePanel({ project, siteId, toast, onProjectChanged, hasKey }) {
  const [site, setSite] = useState(null);
  const [tab, setTab] = useState('preview');
  const [pageId, setPageId] = useState(null);
  const [width, setWidth] = useState('100%');
  const [nonce, setNonce] = useState(0);
  const [instruction, setInstruction] = useState('');
  const [job, setJob] = useState(null);
  const [qa, setQa] = useState(null);
  const [fixes, setFixes] = useState([]);
  const [qaBusy, setQaBusy] = useState('');
  const [browser, setBrowser] = useState(project.browserQa || null);
  const [versions, setVersions] = useState(null);
  const [staging, setStaging] = useState(null);
  const [busy, setBusy] = useState('');
  const [upgrade, setUpgrade] = useState(null);
  const [direction, setDirection] = useState(project.direction || null);

  const load = useCallback(async () => {
    const d = await api('/api/sites/' + siteId);
    setSite(d.site);
    setPageId(cur => (d.site.pages?.some(p => p.id === cur) ? cur : d.site.pages?.[0]?.id || null));
    if (d.site.staged) api(`/api/sites/${siteId}/staging`).then(s => setStaging(s.staging)).catch(() => {}); else setStaging(null);
    return d.site;
  }, [siteId]);
  useEffect(() => { load().catch(e => toast(e.message, 'error')); }, [load]); // eslint-disable-line
  const loadVersions = () => api(`/api/sites/${siteId}/versions`).then(setVersions).catch(() => {});
  useEffect(() => { if (tab === 'versions') loadVersions(); if (tab === 'quality' && !qa) runQa(false); }, [tab]); // eslint-disable-line

  const pump = useJobRunner(useCallback(j => setJob(j), []));
  const refresh = async () => { await load(); setNonce(n => n + 1); };

  async function regen(kind, extra = {}) {
    setBusy('regen');
    try {
      const d = await api(`/api/sites/${siteId}/regen`, { method: 'POST', body: { kind, pageId, ...extra } });
      setJob(d.job);
      const done = await pump(d.job.id);
      if (done?.status === 'done') { toast(kind === 'add' ? 'Page added as a draft' : 'Page updated'); setInstruction(''); await refresh(); }
      else toast(done?.error || 'That did not complete', 'error');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  }
  async function runQa(fix) {
    setQaBusy(fix ? 'fix' : 'run');
    try { const d = await api(`/api/sites/${siteId}/qa`, { method: 'POST', body: { fix } }); setQa(d.qa); setFixes(d.fixes || []); if (fix && d.fixes?.length) await refresh(); }
    catch (e) { toast(e.message, 'error'); } finally { setQaBusy(''); }
  }
  async function runBrowser() {
    setQaBusy('browser');
    try {
      const pages = site.pages.filter(p => p.status !== 'archived');
      const findings = await browserCheck(siteId, pages, msg => setQaBusy('browser:' + msg));
      const result = { checkedAt: Date.now(), pages: pages.length, widths: [390, 768, 1280], findings };
      setBrowser(result);
      await api(`/api/sites/${siteId}/qa`, { method: 'POST', body: { browser: result } });
      toast(findings.length ? `${findings.length} layout finding(s)` : 'No layout problems found at 390, 768 or 1280px', findings.length ? 'error' : 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setQaBusy(''); }
  }
  async function publish() {
    setBusy('publish');
    try {
      const d = await api('/api/publish', { method: 'POST', body: { projectId: project.id } });
      toast(d.live && !d.live.ok ? d.live.error : d.emailed ? 'Published. The review link was emailed to the prospect.' : 'Published', d.live && !d.live.ok ? 'error' : 'success');
      await refresh(); onProjectChanged();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  }
  async function versionAction(action, v) {
    if (!confirm(action === 'rollback' ? `Make the version from ${dateTime(v.createdAt)} the published site again?` : `Load the version from ${dateTime(v.createdAt)} into the draft? (Nothing public changes.)`)) return;
    setBusy(v.id);
    try { const d = await api(`/api/sites/${siteId}/versions`, { method: 'POST', body: { action, versionId: v.id } }); if (d.live && !d.live.ok) toast(d.live.error, 'error'); else toast(action === 'rollback' ? 'Rolled back' : 'Draft restored'); await refresh(); loadVersions(); onProjectChanged(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  }
  async function stagingAction(action, publishToo = false) {
    if (action === 'discard' && !confirm('Discard the staged upgrade? The current site is not affected.')) return;
    setBusy('staging');
    try {
      await api(`/api/sites/${siteId}/staging`, { method: 'POST', body: { action, publish: publishToo } });
      toast(action === 'approve' ? (publishToo ? 'Upgrade approved and published. The previous site is in the version history.' : 'Upgrade approved. It is now the draft; publish when ready.') : 'Staged upgrade discarded');
      setUpgrade(null); await refresh(); onProjectChanged();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  }

  if (!site) return <div className="card"><span className="spinner" /></div>;
  const legacy = site.legacy;
  const page = site.pages?.find(p => p.id === pageId);
  const live = (site.pages || []).filter(p => p.status !== 'archived');
  const previewSrc = `/api/sites/${siteId}/preview/draft/${legacy ? '' : (page?.slug || '')}?n=${nonce}`;

  return (
    <div>
      {/* ---- status strip ---- */}
      <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div className="pill-row">
          <span className={'badge ' + (legacy ? 'legacy' : 'v2')}>{legacy ? 'Classic single page' : `Platform 2.0 · ${live.length} page${live.length === 1 ? '' : 's'}`}</span>
          <span className={'badge ' + (site.published ? 'published' : 'draft')}>{site.published ? 'Published' : 'Not published'}</span>
          {site.live && <span className="badge live">Live on its domain</span>}
          {site.dirty && site.published && <span className="badge warn">Unpublished changes</span>}
          {site.staged && <span className="badge staged">Upgrade staged for review</span>}
          {site.engine === 'demo' && <span className="badge info">Demo build</span>}
        </div>
        <div className="pill-row">
          {!legacy && <Link className="btn" href={`/admin/site/${siteId}/edit${page ? '?page=' + page.id : ''}`}>✎ Open visual editor</Link>}
          <button className="btn primary" onClick={publish} disabled={busy === 'publish'}>{busy === 'publish' ? <span className="spinner" /> : site.published ? '↻ Publish changes' : '🚀 Publish preview'}</button>
        </div>
      </div>

      {/* ---- staged upgrade ---- */}
      {staging && (
        <div className="card" style={{ borderColor: 'rgba(232,179,75,.5)' }}>
          <div className="card-title">Staged upgrade: {staging.label}</div>
          <div className="hint" style={{ marginBottom: 10 }}>Created {dateTime(staging.createdAt)}. The current site is untouched until you approve. {staging.outline.pages.length} page(s): {staging.outline.pages.map(p => p.title).join(', ')}.</div>
          {staging.meta?.report && (
            <div className="small" style={{ marginBottom: 10 }}>
              <div>Converted {staging.meta.report.sections} sections with {staging.meta.report.editableFields} editable pieces of content. Kept: {staging.meta.report.kept.join(', ') || 'markup and styles'}.</div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--amber)' }}>{staging.meta.report.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
          )}
          <iframe className="preview" style={{ height: '60vh' }} src={`/api/sites/${siteId}/preview/staging/`} title="Staged upgrade preview" />
          <div className="btn-row">
            <a className="btn" href={`/api/sites/${siteId}/preview/staging/`} target="_blank" rel="noopener">Open staging in a new tab ↗</a>
            <button className="btn primary" disabled={busy === 'staging'} onClick={() => stagingAction('approve')}>Approve (make it the draft)</button>
            <button className="btn" disabled={busy === 'staging'} onClick={() => stagingAction('approve', true)}>Approve &amp; publish</button>
            <button className="btn ghost danger" disabled={busy === 'staging'} onClick={() => stagingAction('discard')}>Discard</button>
          </div>
          <div className="hint">Approving snapshots the current site first (“Before upgrade”), so you can roll back from Versions at any time.</div>
        </div>
      )}

      <div className="tabs">
        {[['preview', 'Preview'], ['pages', 'Pages'], ['quality', 'Quality'], ['versions', 'Versions'], ['integrations', 'Integrations'], ['upgrade', 'Upgrade']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {/* ---- preview ---- */}
      {tab === 'preview' && (
        <div>
          <div className="pill-row" style={{ marginBottom: 10 }}>
            {!legacy && live.map(p => <button key={p.id} className={'btn' + (p.id === pageId ? ' primary' : ' ghost')} onClick={() => setPageId(p.id)}>{p.title}{p.status === 'draft' ? ' (draft)' : ''}</button>)}
            <span style={{ marginLeft: 'auto' }} />
            {WIDTHS.map(([n, w]) => <button key={n} className={'btn' + (width === w ? ' primary' : ' ghost')} onClick={() => setWidth(w)}>{n}</button>)}
            <a className="btn ghost" href={previewSrc} target="_blank" rel="noopener">↗</a>
          </div>
          {!legacy && page && (
            <div className="pill-row" style={{ marginBottom: 10 }}>
              <input style={{ flex: 1, minWidth: 240 }} value={instruction} onChange={e => setInstruction(e.target.value)} onKeyDown={e => e.key === 'Enter' && instruction.trim() && regen('page', { instruction })}
                placeholder={`Ask for a change to “${page.title}”… e.g. “open with the emergency repair service; add a short FAQ”`} />
              <button className="btn" disabled={busy === 'regen' || !instruction.trim()} onClick={() => regen('page', { instruction })}>✦ Revise page</button>
              <button className="btn ghost" disabled={busy === 'regen'} onClick={() => { if (confirm(`Regenerate “${page.title}” from scratch? The current version is saved to Versions first.`)) regen('page', { instruction: '' }); }}>↻ Regenerate page</button>
            </div>
          )}
          {job && busy === 'regen' && <div className="card"><JobProgress job={job} /></div>}
          <div style={{ width, margin: '0 auto', transition: 'width .2s', maxWidth: '100%' }}>
            <iframe className="preview" key={previewSrc} src={previewSrc} title="Draft preview" />
          </div>
          <div className="hint" style={{ marginTop: 8 }}>This is the working draft, served only to signed-in staff{site.published ? '. Visitors still see the last published version until you publish.' : '.'} Only one page is regenerated at a time; the rest of the site is untouched.</div>
        </div>
      )}

      {/* ---- pages ---- */}
      {tab === 'pages' && !legacy && (
        <div className="card">
          <div className="card-title">Sitemap</div>
          <table>
            <thead><tr><th>Page</th><th>Address</th><th>Type</th><th>Status</th><th>Menu</th><th>Sections</th><th>SEO</th><th></th></tr></thead>
            <tbody>{live.map(p => (
              <tr key={p.id}>
                <td><b>{p.title}</b>{p.createdBy === 'customer' && <span className="badge info" style={{ marginLeft: 6 }}>added by customer</span>}</td>
                <td className="mono">{p.path}</td><td>{p.type}</td>
                <td><span className={'badge ' + (p.status === 'published' ? 'published' : 'draft')}>{p.status}</span></td>
                <td>{p.inNav ? 'Yes' : '—'}</td><td>{p.sections.length}</td>
                <td className="small">{p.seo.title ? '✓ title' : '✗ title'} · {p.seo.description ? '✓ desc' : '✗ desc'}</td>
                <td><Link className="btn ghost small" style={{ padding: '4px 9px' }} href={`/admin/site/${siteId}/edit?page=${p.id}`}>Edit</Link></td>
              </tr>))}</tbody>
          </table>
          {site.redirects?.length > 0 && <div className="hint" style={{ marginTop: 10 }}>Redirects: {site.redirects.map(r => `${r.from} → ${r.to}`).join(' · ')}</div>}
          <div className="hint" style={{ marginTop: 10 }}>Add, remove, reorder and rename pages, and edit page settings and SEO, in the visual editor (Pages).</div>
        </div>
      )}
      {tab === 'pages' && legacy && <div className="card">A classic site is one page. Use the Upgrade tab to convert it to the editable multipage format.</div>}

      {/* ---- quality ---- */}
      {tab === 'quality' && (
        <div>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="card-title" style={{ margin: 0 }}>Automated checks {qa && <span className={'badge ' + (qa.summary.errors ? 'err' : qa.summary.warnings ? 'warn' : 'ok')} style={{ marginLeft: 8 }}>{qa.summary.errors} errors · {qa.summary.warnings} warnings · {qa.summary.info} notes</span>}</div>
              <div className="pill-row">
                <button className="btn" onClick={() => runQa(false)} disabled={!!qaBusy}>{qaBusy === 'run' ? <span className="spinner" /> : '⟳ Re-run'}</button>
                {!legacy && <button className="btn primary" onClick={() => runQa(true)} disabled={!!qaBusy}>{qaBusy === 'fix' ? <span className="spinner" /> : '🛠 Fix what can be fixed'}</button>}
              </div>
            </div>
            <div className="hint" style={{ margin: '8px 0 12px' }}>Checks links, navigation targets, images, forms, headings, metadata, contrast, placeholder text, invented reviews and unstyled classes on every page.</div>
            {fixes.length > 0 && <div className="ok">{fixes.length} fix(es) applied: {fixes.slice(0, 6).join(' ')}{fixes.length > 6 ? ' …' : ''}</div>}
            <Issues qa={qa} />
          </div>
          {!legacy && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="card-title" style={{ margin: 0 }}>Responsive render check (phone 390 · tablet 768 · desktop 1280)</div>
                <button className="btn" onClick={runBrowser} disabled={!!qaBusy}>{qaBusy.startsWith('browser') ? <><span className="spinner" /> {qaBusy.split(':')[1] || 'Rendering…'}</> : '▶ Render every page at 3 sizes'}</button>
              </div>
              <div className="hint" style={{ margin: '8px 0 12px' }}>Renders each page in your browser at three widths and measures real overflow, failed images, missing headings and small tap targets.</div>
              {browser ? (browser.findings.length
                ? browser.findings.map((f, i) => <div className="issue" key={i}><span className="badge err">{f.width}px</span><span><b>{f.page}</b>: {f.message}</span></div>)
                : <div className="ok">No layout problems on {browser.pages} page(s). Checked {timeAgo(browser.checkedAt)}.</div>) : <div className="small muted">Not run yet for this draft.</div>}
            </div>
          )}
        </div>
      )}

      {/* ---- versions ---- */}
      {tab === 'versions' && (
        <div className="card">
          <div className="card-title">Version history</div>
          {!versions ? <span className="spinner" /> : (
            <table>
              <thead><tr><th>When</th><th>Type</th><th>Label</th><th>By</th><th></th></tr></thead>
              <tbody>{versions.versions.map(v => (
                <tr key={v.id}>
                  <td>{dateTime(v.createdAt)}</td>
                  <td><span className={'badge ' + (v.kind === 'publish' ? 'published' : v.kind === 'legacy' ? 'legacy' : v.kind === 'staging' ? 'staged' : 'draft')}>{v.kind}</span>{v.id === versions.publishedVersionId && <span className="badge ok" style={{ marginLeft: 6 }}>published</span>}{v.id === versions.liveVersionId && <span className="badge live" style={{ marginLeft: 6 }}>live</span>}</td>
                  <td>{v.label}</td><td className="small muted">{v.createdByName}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <a className="btn ghost small" style={{ padding: '4px 9px' }} href={`/api/sites/${siteId}/preview/${v.id}/`} target="_blank" rel="noopener">View</a>{' '}
                    <button className="btn ghost small" style={{ padding: '4px 9px' }} disabled={!!busy} onClick={() => versionAction('restore', v)}>Restore to draft</button>{' '}
                    {v.id === versions.stagingVersionId && <button className="btn primary small" style={{ padding: '4px 9px' }} disabled={!!busy} onClick={() => stagingAction('approve', true)}>Approve &amp; publish</button>}
                    {v.kind !== 'staging' && v.id !== versions.publishedVersionId && <button className="btn ghost small" style={{ padding: '4px 9px' }} disabled={!!busy} onClick={() => versionAction('rollback', v)}>Roll back to this</button>}
                  </td>
                </tr>))}</tbody>
            </table>
          )}
          {versions?.events?.length > 0 && (
            <details style={{ marginTop: 14 }}><summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Publication &amp; change history ({versions.events.length})</summary>
              <div className="log" style={{ marginTop: 8 }}>{versions.events.map(e => <div key={e.id}>{dateTime(e.at)}  {e.type}{e.actor ? ' · ' + e.actor : ''}{e.detail?.label ? ' · ' + e.detail.label : ''}</div>)}</div>
            </details>
          )}
        </div>
      )}

      {/* ---- integrations ---- */}
      {tab === 'integrations' && (legacy
        ? <div className="card">Integrations are available once this site is converted or upgraded to the editable format.</div>
        : <div className="cd" style={{ minHeight: 0, background: 'transparent', borderRadius: 14 }}><div style={{ background: '#f6f7f9', borderRadius: 14, padding: 18 }}><Marketplace siteId={siteId} editorHref={`/admin/site/${siteId}/edit`} staff /></div></div>)}

      {/* ---- upgrade ---- */}
      {tab === 'upgrade' && (
        <div>
          <div className="card">
            <div className="card-title">Upgrade this website</div>
            <div className="hint" style={{ marginBottom: 12 }}>Every upgrade is built as a separate staging version. The current site keeps running untouched; you review every page, then approve. A snapshot is taken first, so any upgrade can be rolled back.</div>
            <div className="preset-grid">
              {UPGRADES.filter(([k]) => legacy || k !== 'convert').filter(([k]) => !(k === 'multipage' && !legacy && live.length > 1)).map(([k, label, desc]) => (
                <button type="button" key={k} className={'preset' + (upgrade === k ? ' on' : '')} onClick={() => setUpgrade(k)}><b>{label}</b><span>{desc}</span></button>
              ))}
            </div>
          </div>
          {upgrade && upgrade !== 'convert' && (
            <DirectionPanel direction={direction} onChange={setDirection} ctx={{ businessType: project.business.type, hasPhotos: (project.business.photos || []).length > 0 }} toast={toast} compact />
          )}
          {upgrade && (
            <div className="card">
              <div className="card-title">{UPGRADES.find(u => u[0] === upgrade)[1]}</div>
              <BuildPanel key={upgrade} project={project} mode="upgrade" upgradeType={upgrade} direction={upgrade === 'convert' ? null : direction} toast={toast} hasKey={hasKey}
                startLabel={upgrade === 'convert' ? '⇄ Convert to the editable format' : '✦ Plan the upgrade'}
                onFinished={async () => { toast('Upgrade ready for review (staging)'); await refresh(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
