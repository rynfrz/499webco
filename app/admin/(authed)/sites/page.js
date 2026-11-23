'use client';
// Website management: every site with its status and the actions on it.
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, timeAgo } from '@/components/api';

export default function Sites() {
  const [sites, setSites] = useState(null);
  const [projects, setProjects] = useState([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    api('/api/sites').then(d => setSites(d.sites)).catch(e => setErr(e.message));
    api('/api/projects').then(d => setProjects(d.projects || [])).catch(() => {});
  }, []);
  // Classic sites that have never needed a site record yet are listed too.
  const known = new Set((sites || []).map(s => s.projectId));
  const classic = projects.filter(p => p.hasSite && !known.has(p.id)).map(p => ({ id: null, projectId: p.id, businessName: p.business?.name || 'Untitled', legacy: true, pages: 1, status: 'legacy', published: p.published, live: p.launched, projectStatus: p.status, updatedAt: p.updated_at, slug: '' }));
  const all = [...(sites || []), ...classic].filter(s => !q || s.businessName.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="inner wide">
      <h1>Websites</h1>
      <p className="subtitle">Every generated site: preview, edit, regenerate, upgrade, publish, versions.</p>
      <div className="pill-row" style={{ marginBottom: 16 }}><input style={{ maxWidth: 320 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search businesses…" /></div>
      {err && <div className="err">{err}</div>}
      {!sites ? <span className="spinner" /> : all.length === 0 ? <div className="card">No websites yet.</div> : (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table>
            <thead><tr><th>Business</th><th>Format</th><th>Pages</th><th>Status</th><th>Customer</th><th>Updated</th><th></th></tr></thead>
            <tbody>{all.map(s => (
              <tr key={s.id || s.projectId}>
                <td><Link href={`/admin/project/${s.projectId}?step=3`}><b>{s.businessName}</b></Link>{s.domain && <div className="small muted">{s.domain}</div>}</td>
                <td><span className={'badge ' + (s.legacy ? 'legacy' : 'v2')}>{s.legacy ? 'Classic' : 'Platform 2.0'}</span></td>
                <td>{s.pages}</td>
                <td className="pill-row" style={{ gap: 5 }}>
                  <span className={'badge ' + (s.published ? 'published' : 'draft')}>{s.published ? 'Published' : 'Draft'}</span>
                  {s.live && <span className="badge live">Live</span>}
                  {s.draftDirty && s.published && <span className="badge warn">Unpublished changes</span>}
                  {s.staged && <span className="badge staged">Upgrade staged</span>}
                </td>
                <td><span className="small muted">{s.projectStatus}</span></td>
                <td className="small muted">{timeAgo(s.updatedAt)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {s.published && s.slug && <a className="btn ghost small" style={{ padding: '4px 9px' }} href={`/preview/${s.slug}`} target="_blank" rel="noopener">Preview ↗</a>}{' '}
                  {s.id && !s.legacy && <Link className="btn ghost small" style={{ padding: '4px 9px' }} href={`/admin/site/${s.id}/edit`}>Edit</Link>}{' '}
                  <Link className="btn ghost small" style={{ padding: '4px 9px' }} href={`/admin/project/${s.projectId}?step=3`}>{s.legacy ? 'Upgrade' : 'Manage'}</Link>
                </td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
