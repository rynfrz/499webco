'use client';
// Generation dashboard: every job with stage, progress, tokens, cost, errors.
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api, fmtInt, fmtUsd, timeAgo } from '@/components/api';
import { JobProgress, useJobRunner } from '@/components/BuildPanel';

const KIND = { site_build: 'Site build', page_regen: 'Page revision', section_regen: 'Section rework', page_add: 'New page', generate: 'Classic build' };

export default function Jobs() {
  const [jobs, setJobs] = useState(null);
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api('/api/jobs?limit=100').then(d => setJobs(d.jobs)).catch(() => setJobs([]));
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);
  const pump = useJobRunner(useCallback(j => setDetail(j), []));

  async function show(id) {
    setOpen(id); setDetail(null);
    try { setDetail((await api('/api/jobs/' + id)).job); } catch {}
  }
  async function action(a) {
    setBusy(true);
    try {
      const d = await api(`/api/jobs/${open}/action`, { method: 'POST', body: { action: a } });
      setDetail(d.job);
      if (d.job.status === 'running') pump(d.job.id).then(load);
      load();
    } finally { setBusy(false); }
  }
  const totals = (jobs || []).reduce((a, j) => { if (j.usage) { a.cost += j.usage.cost; a.out += j.usage.outputTokens; a.inp += j.usage.inputTokens; } return a; }, { cost: 0, out: 0, inp: 0 });

  return (
    <div className="inner wide">
      <h1>Generation</h1>
      <p className="subtitle">Jobs, model usage and cost. Running jobs continue from the project page; a stopped job can be retried here.</p>
      <div className="kv">
        <div><b>{jobs ? jobs.length : '…'}</b><span>Recent jobs</span></div>
        <div><b>{fmtInt(totals.inp)}</b><span>Input tokens</span></div>
        <div><b>{fmtInt(totals.out)}</b><span>Output tokens</span></div>
        <div><b>{fmtUsd(totals.cost)}</b><span>Estimated cost</span></div>
      </div>
      {!jobs ? <span className="spinner" /> : jobs.length === 0 ? <div className="card">No generation jobs yet.</div> : (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table>
            <thead><tr><th>Website</th><th>Job</th><th>Stage</th><th>Progress</th><th>Tokens (in / out)</th><th>Cost</th><th>Started</th><th></th></tr></thead>
            <tbody>{jobs.map(j => (
              <tr key={j.id} style={open === j.id ? { background: 'var(--panel-2)' } : null}>
                <td>{j.projectId ? <Link href={`/admin/project/${j.projectId}?step=3`}><b>{j.businessName || 'Untitled'}</b></Link> : '—'}</td>
                <td>{KIND[j.kind] || j.kind}{j.upgradeType ? ` · ${j.upgradeType}` : ''}{j.engine === 'demo' ? <span className="badge info" style={{ marginLeft: 6 }}>demo</span> : ''}</td>
                <td><span className={'badge ' + j.status}>{j.status.replace('_', ' ')}</span> <span className="small muted">{j.stage}</span>{j.error && <div className="small" style={{ color: '#ffb4b4', maxWidth: 360 }}>{j.error}</div>}</td>
                <td style={{ minWidth: 110 }}><div className="progress"><i style={{ width: j.progress + '%' }} /></div></td>
                <td className="small">{j.usage ? `${fmtInt(j.usage.inputTokens)} / ${fmtInt(j.usage.outputTokens)}` : '—'}</td>
                <td>{j.usage ? fmtUsd(j.usage.cost) : '—'}</td>
                <td className="small muted">{timeAgo(j.createdAt)}</td>
                <td><button className="btn ghost small" style={{ padding: '4px 9px' }} onClick={() => (open === j.id ? setOpen(null) : show(j.id))}>{open === j.id ? 'Hide' : 'Details'}</button></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {open && (
        <div className="card">
          <div className="card-title">Job {open}</div>
          {!detail ? <span className="spinner" /> : (
            <>
              <JobProgress job={detail} busy={busy} onRetry={() => action('retry')} onCancel={() => confirm('Cancel this job?') && action('cancel')} />
              {detail.calls?.length > 0 && (
                <details style={{ marginTop: 14 }} open>
                  <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Model calls ({detail.calls.length})</summary>
                  <table className="tight" style={{ marginTop: 8 }}>
                    <thead><tr><th>Task</th><th>Model</th><th>Result</th><th>Input</th><th>Cached</th><th>Output</th><th>Cost</th><th>Time</th><th>Tries</th></tr></thead>
                    <tbody>{detail.calls.map((c, i) => (
                      <tr key={i}><td>{c.task}</td><td className="mono small">{c.model}</td>
                        <td>{c.status === 'ok' ? <span className="badge ok">{c.stopReason || 'ok'}</span> : <span className="badge err" title={c.error}>error</span>}</td>
                        <td>{fmtInt(c.inputTokens + c.cacheWrite)}</td><td>{fmtInt(c.cacheRead)}</td><td>{fmtInt(c.outputTokens)}</td><td>{fmtUsd(c.cost)}</td><td>{(c.durationMs / 1000).toFixed(1)}s</td><td>{c.attempts}</td></tr>))}</tbody>
                  </table>
                </details>
              )}
              {detail.result && <div className="hint" style={{ marginTop: 10 }}>Result: {detail.result.staged ? 'staged for review' : detail.result.saved ? 'saved to the draft' : JSON.stringify(detail.result)}{detail.projectId && <> · <Link href={`/admin/project/${detail.projectId}?step=3`}>Open website →</Link></>}{detail.siteId && <> · <a href={`/api/sites/${detail.siteId}/preview/${detail.result.staged ? 'staging' : 'draft'}/`} target="_blank" rel="noopener">Preview ↗</a></>}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
