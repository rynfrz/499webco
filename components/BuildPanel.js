'use client';
// Runs and displays a generation job: start it, keep it moving, show every
// stage with tokens and cost, let the administrator review and edit the
// sitemap before pages are built, and retry or cancel when needed.
import { useState, useEffect, useRef, useCallback } from 'react';
import { api, fmtInt, fmtUsd } from './api';

const PAGE_TYPES = ['home', 'about', 'services', 'service', 'products', 'product', 'gallery', 'testimonials', 'faq', 'contact', 'booking', 'locations', 'landing', 'standard'];
const ACTIVE = ['running', 'awaiting_review'];

/** Drive a job until it stops running. Returns the final view. */
export function useJobRunner(onUpdate) {
  const pumping = useRef(null);
  const run = useCallback(async jobId => {
    if (pumping.current === jobId) return;
    pumping.current = jobId;
    let stop = false;
    // While a long request is in flight, poll so the progress bar keeps moving.
    const poll = setInterval(async () => {
      if (stop) return;
      try { const d = await api('/api/jobs/' + jobId); if (!stop) onUpdate(d.job); } catch {}
    }, 2500);
    let last = null, failures = 0;
    try {
      // One request can run for many minutes (a slow model thinking hard about a page).
      // Only requests that actually advanced the job count towards the cap; waiting on a
      // request that is still running elsewhere does not.
      for (let runs = 0; runs < 120;) {
        try {
          const d = await api(`/api/jobs/${jobId}/run`, { method: 'POST', body: {} });
          last = d.job; failures = 0; onUpdate(d.job);
          if (d.job.status !== 'running') break;
          // Another tab/request holds the job: wait instead of spinning.
          if (d.job.running) await new Promise(r => setTimeout(r, 5000));
          else runs++;
        } catch (e) {
          // A dropped connection or a timed-out request: the job itself is durable, so just carry on.
          if (++failures > 6) throw e;
          await new Promise(r => setTimeout(r, 2500));
        }
      }
    } finally { stop = true; clearInterval(poll); pumping.current = null; }
    return last;
  }, [onUpdate]);
  return run;
}

export function JobProgress({ job, onRetry, onCancel, busy }) {
  if (!job) return null;
  const u = job.usage;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <div><span className={'badge ' + job.status}>{({ running: 'Running', awaiting_review: 'Waiting for review', done: 'Complete', error: 'Stopped', canceled: 'Canceled' })[job.status] || job.status}</span> <span className="small" style={{ marginLeft: 6 }}>{job.stage}</span></div>
        <span className="small muted">{job.progress}%</span>
      </div>
      <div className="progress"><i style={{ width: job.progress + '%' }} /></div>

      {job.error && <div className="err" style={{ marginTop: 12 }}>{job.error}</div>}
      {(job.status === 'error' || ACTIVE.includes(job.status)) && (
        <div className="btn-row" style={{ marginTop: 10 }}>
          {job.status === 'error' && <button className="btn primary" disabled={busy} onClick={onRetry}>↻ Retry from the failed step</button>}
          <button className="btn ghost danger" disabled={busy} onClick={onCancel}>Cancel job</button>
        </div>
      )}

      <div className="kv">
        <div><b>{job.input?.engine === 'demo' ? 'Demo' : 'AI'}</b><span>Engine</span></div>
        <div><b>{u ? fmtInt(u.inputTokens) : '0'}</b><span>Input tokens</span></div>
        <div><b>{u ? fmtInt(u.outputTokens) : '0'}</b><span>Output tokens</span></div>
        <div><b>{u ? fmtUsd(u.cost) : '—'}</b><span>Cost so far{u?.unpriced ? ' (some calls unpriced)' : ''}</span></div>
        {job.estimate && job.status !== 'done' && <div><b>~{fmtInt(job.estimate.outputTokens)}</b><span>Estimated output tokens</span></div>}
      </div>

      {job.models && (
        <div className="small muted" style={{ marginBottom: 6 }}>
          Models: {Object.entries(job.models).map(([t, m]) => `${t} → ${m.name}${m.thinking === 'adaptive' ? ' (thinking)' : ''}${m.effort ? ' · ' + m.effort : ''}`).join('   ·   ')}
        </div>
      )}

      <ul className="steps">
        {job.steps.map(s => (
          <li key={s.id} className={s.status}>
            <span className="dot" />
            <span>{s.label}{s.attempts > 1 ? <span className="muted"> · attempt {s.attempts}</span> : ''}{s.error && s.status !== 'done' ? <span style={{ color: '#ffb4b4' }}> — {s.error}</span> : ''}</span>
            <span className="meta">{s.model ? s.model.replace('claude-', '') + ' · ' : ''}{s.usage ? fmtInt(s.usage.output) + ' out · ' : ''}{s.cost != null ? fmtUsd(s.cost) + ' · ' : ''}{s.ms ? (s.ms / 1000).toFixed(s.ms < 10000 ? 1 : 0) + 's' : ''}</span>
          </li>
        ))}
      </ul>

      {job.notes?.length > 0 && (
        <div style={{ marginTop: 12 }}>{job.notes.map((n, i) => <div key={i} className="small" style={{ color: 'var(--amber)' }}>⚠ {n}</div>)}</div>
      )}
      {job.log?.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Generation log ({job.log.length})</summary>
          <div className="log" style={{ marginTop: 8 }}>{job.log.map((l, i) => <div key={i} className={l.level}>{new Date(l.t).toLocaleTimeString()}  {l.msg}</div>)}</div>
        </details>
      )}
    </div>
  );
}

function SitemapEditor({ pages, onChange }) {
  const set = (i, patch) => onChange(pages.map((p, n) => (n === i ? { ...p, ...patch } : p)));
  const move = (i, dir) => { const next = [...pages]; const j = i + dir; if (j < 1 || j >= next.length || i === 0) return; [next[i], next[j]] = [next[j], next[i]]; onChange(next); };
  const add = () => onChange([...pages, { id: 'new' + Date.now().toString(36), type: 'standard', title: 'New page', navLabel: 'New page', slug: 'new-page', purpose: '', inNav: true, sections: [] }]);
  return (
    <div>
      <div className="sitemap">
        {pages.map((p, i) => (
          <div className="pg" key={p.id}>
            <div style={{ display: 'grid', gap: 2 }}>
              <button type="button" className="linklike" style={{ textDecoration: 'none' }} disabled={i < 2} onClick={() => move(i, -1)} title="Move up">▲</button>
              <button type="button" className="linklike" style={{ textDecoration: 'none' }} disabled={i === 0 || i === pages.length - 1} onClick={() => move(i, 1)} title="Move down">▼</button>
            </div>
            <input value={p.title} onChange={e => set(i, { title: e.target.value })} placeholder="Page title" aria-label="Page title" />
            <input value={p.navLabel} onChange={e => set(i, { navLabel: e.target.value })} placeholder="Menu label" aria-label="Menu label" />
            <input value={i === 0 ? '/' : p.slug} disabled={i === 0} onChange={e => set(i, { slug: e.target.value })} placeholder="address" aria-label="Page address" className="mono" />
            <select value={p.type} disabled={i === 0} onChange={e => set(i, { type: e.target.value })} aria-label="Page type">{PAGE_TYPES.map(t => <option key={t}>{t}</option>)}</select>
            <div className="pill-row">
              <label style={{ margin: 0, display: 'flex', gap: 5, alignItems: 'center', fontWeight: 500 }}><input type="checkbox" style={{ width: 'auto' }} checked={p.inNav !== false} onChange={e => set(i, { inNav: e.target.checked })} /> in menu</label>
              {i > 0 && <button type="button" className="btn ghost small danger" style={{ padding: '3px 8px' }} onClick={() => onChange(pages.filter((_, n) => n !== i))}>Remove</button>}
            </div>
            <input className="purpose" value={p.purpose || ''} onChange={e => set(i, { purpose: e.target.value })} placeholder="What this page must achieve" aria-label="Purpose" />
            {p.sections?.length > 0 && <div className="purpose small muted">Sections: {p.sections.map(s => s.type).join(' → ')}</div>}
            <input className="purpose" value={p.note || ''} onChange={e => set(i, { note: e.target.value })} placeholder="Optional direction for this page" aria-label="Page direction" />
          </div>
        ))}
      </div>
      <div className="btn-row" style={{ marginTop: 10 }}><button type="button" className="btn" onClick={add}>+ Add page</button></div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.project           the project record
 * @param {'new'|'upgrade'} [props.mode]
 * @param {string} [props.upgradeType]
 * @param {object} [props.direction]       design direction to use (upgrade flow)
 * @param {function} props.onFinished      called with the finished job
 */
export default function BuildPanel({ project, mode = 'new', upgradeType = null, direction = null, onFinished = () => {}, toast = () => {}, hasKey = true, startLabel = null }) {
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState(null);
  const [preset, setPreset] = useState('');
  const [model, setModel] = useState('');
  const [note, setNote] = useState('');
  const [auto, setAuto] = useState(false);
  const [draftMap, setDraftMap] = useState(null);
  const finished = useRef(null);

  const onUpdate = useCallback(j => { if (j) setJob(j); }, []);
  const pump = useJobRunner(onUpdate);

  useEffect(() => { api('/api/ai').then(d => setAi({ ...d.ai, hasKey: d.hasKey })).catch(() => {}); }, []);
  // Pick up a job that is still in progress for this project (e.g. after a reload).
  useEffect(() => {
    let alive = true;
    api('/api/jobs?projectId=' + project.id + '&limit=5').then(async d => {
      const cur = d.jobs.find(j => j.kind === 'site_build' && (ACTIVE.includes(j.status) || j.status === 'error') && (mode === 'upgrade' ? j.mode === 'upgrade' : j.mode !== 'upgrade'));
      if (!cur || !alive) return;
      const full = (await api('/api/jobs/' + cur.id)).job;
      if (alive) setJob(full);
    }).catch(() => {});
    return () => { alive = false; };
  }, [project.id, mode]);

  useEffect(() => { if (job?.status === 'running') pump(job.id); }, [job?.id, job?.status]); // eslint-disable-line
  useEffect(() => { if (job?.status === 'awaiting_review' && job.sitemap) setDraftMap(m => m && m._job === job.id ? m : Object.assign([...job.sitemap], { _job: job.id })); }, [job?.status, job?.id]); // eslint-disable-line
  useEffect(() => {
    if (job?.status === 'done' && finished.current !== job.id) { finished.current = job.id; onFinished(job); }
  }, [job?.status]); // eslint-disable-line

  async function start() {
    setBusy(true);
    try {
      const override = {};
      if (preset) override.preset = preset;
      if (model) override.model = model;
      const d = await api('/api/sites/build', { method: 'POST', body: { projectId: project.id, mode, upgradeType, direction, note, autoApprove: auto, override: Object.keys(override).length ? override : null } });
      finished.current = null;
      setJob(d.job);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }
  async function action(a, extra = {}) {
    setBusy(true);
    try { const d = await api(`/api/jobs/${job.id}/action`, { method: 'POST', body: { action: a, ...extra } }); setJob(d.job); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  const active = job && (ACTIVE.includes(job.status) || job.status === 'error');
  const demo = ai && !ai.hasKey;

  return (
    <div>
      {!active && (
        <div>
          {demo && <div className="ok" style={{ background: 'rgba(232,179,75,.12)', borderColor: 'rgba(232,179,75,.4)', color: '#f3d59a' }}>Demo mode: no Anthropic API key is set, so the site is assembled from the platform templates and your design direction. Add a key in Settings for a custom-designed site.</div>}
          {ai && !demo && (
            <div className="row">
              <div className="field"><label>Quality preset for this job</label>
                <select value={preset} onChange={e => setPreset(e.target.value)}>
                  <option value="">Use the default ({ai.presets[ai.preset].label})</option>
                  {Object.entries(ai.presets).filter(([k]) => k !== 'custom').map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
                </select></div>
              <div className="field"><label>Or use one model for every stage</label>
                <select value={model} onChange={e => setModel(e.target.value)}>
                  <option value="">No override</option>
                  {ai.models.filter(m => m.available).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select></div>
            </div>
          )}
          <div className="field"><label>Note for this build (optional)</label>
            <textarea rows={2} style={{ minHeight: 0 }} value={note} onChange={e => setNote(e.target.value)} placeholder="Anything specific for this run, e.g. “lead with emergency repairs; keep pages short”." /></div>
          <div className="btn-row" style={{ marginTop: 6 }}>
            <button className="btn primary" onClick={start} disabled={busy}>{busy ? <span className="spinner" /> : (startLabel || '✦ Plan the website')}</button>
            <label style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'center', fontWeight: 500 }}><input type="checkbox" style={{ width: 'auto' }} checked={auto} onChange={e => setAuto(e.target.checked)} /> Build straight through without sitemap review</label>
          </div>
          {job && !active && job.status === 'done' && <div className="hint" style={{ marginTop: 10 }}>Last run finished. Starting again creates a new version; the current one is kept in the version history.</div>}
        </div>
      )}

      {job && (
        <div style={{ marginTop: active ? 0 : 18 }}>
          <JobProgress job={job} busy={busy} onRetry={() => action('retry')} onCancel={() => { if (confirm('Cancel this job? Finished steps are kept, but the site will not be saved.')) action('cancel'); }} />

          {job.status === 'awaiting_review' && draftMap && (
            <div className="card" style={{ marginTop: 16, background: 'var(--bg)' }}>
              <div className="card-title">Review the plan before building</div>
              {job.brief && (
                <div className="small" style={{ marginBottom: 12, lineHeight: 1.6 }}>
                  <div><b>Summary:</b> {job.brief.summary}</div>
                  {job.brief.positioning && <div><b>Positioning:</b> {job.brief.positioning}</div>}
                  {job.brief.audience && <div><b>Audience:</b> {job.brief.audience}</div>}
                  {job.brief.primaryAction?.label && <div><b>Main action:</b> {job.brief.primaryAction.label}</div>}
                  {job.brief.keyMessages?.length > 0 && <div><b>Key messages:</b> {job.brief.keyMessages.join(' · ')}</div>}
                  {job.brief.cautions?.length > 0 && <div style={{ color: 'var(--amber)' }}><b>Will not claim:</b> {job.brief.cautions.join(' · ')}</div>}
                </div>
              )}
              {job.missing?.length > 0 && (
                <div className="small" style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid rgba(232,179,75,.35)', borderRadius: 10, background: 'rgba(232,179,75,.07)' }}>
                  <b>Missing information</b> (nothing will be invented to fill these):
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{job.missing.map(m => <li key={m.key}>{m.label} — <span className="muted">{m.impact}</span></li>)}</ul>
                  {job.brief?.questionsForClient?.length > 0 && <div style={{ marginTop: 6 }}><b>Worth asking the client:</b> {job.brief.questionsForClient.join(' · ')}</div>}
                </div>
              )}
              {job.sitemapRationale && <div className="hint" style={{ marginBottom: 10 }}>{job.sitemapRationale}</div>}
              <SitemapEditor pages={draftMap} onChange={next => setDraftMap(Object.assign([...next], { _job: job.id }))} />
              <div className="btn-row">
                <button className="btn primary" disabled={busy || !draftMap.length} onClick={() => action('approve_plan', { sitemap: draftMap })}>{busy ? <span className="spinner" /> : `Approve & build ${draftMap.length} page${draftMap.length === 1 ? '' : 's'}`}</button>
                {job.estimate && <span className="small muted">Roughly {fmtInt(job.estimate.inputTokens)} input and {fmtInt(job.estimate.outputTokens)} output tokens.</span>}
              </div>
            </div>
          )}

          {job.status === 'done' && job.qa && (
            <div style={{ marginTop: 14 }} className="small">
              Quality checks: <span className={'badge ' + (job.qa.summary.errors ? 'err' : job.qa.summary.warnings ? 'warn' : 'ok')}>{job.qa.summary.errors} errors · {job.qa.summary.warnings} warnings</span>
              {job.fixes?.length > 0 && <span className="muted"> · {job.fixes.length} issue{job.fixes.length === 1 ? '' : 's'} fixed automatically</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
