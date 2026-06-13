'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = () => fetch('/api/projects').then(r => r.json()).then(d => setProjects(d.projects || []));
  useEffect(() => { load(); }, []);

  async function create() {
    setCreating(true);
    const res = await fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const d = await res.json();
    if (d.project) router.push('/admin/project/' + d.project.id);
    else setCreating(false);
  }
  async function del(id, name, e) {
    e.preventDefault(); e.stopPropagation();
    if (!confirm(`Delete ${name || 'this project'}?`)) return;
    await fetch('/api/projects/' + id, { method: 'DELETE' });
    load();
  }

  // Prefer the lifecycle status; fall back to flags for older projects.
  const statusOf = p => {
    if (['lead', 'approved', 'paid', 'launched'].includes(p.status)) return p.status;
    return p.launched ? 'launched' : p.published ? 'published' : p.hasSite ? 'generated' : 'draft';
  };
  const labelOf = { lead: 'New lead', draft: 'Draft', generated: 'Site generated', published: 'Preview live', approved: 'Approved', paid: 'Paid', launched: 'Launched' };

  return (
    <div className="inner wide">
      <h1>Pipeline</h1>
      <p className="subtitle">Find → Build → Preview → Show → Launch → Maintain</p>
      <div className="btn-row" style={{ margin: '0 0 24px' }}>
        <button className="btn primary" onClick={create} disabled={creating}>{creating ? <span className="spinner" /> : '+ New Business'}</button>
      </div>
      {!projects ? <span className="spinner" /> : projects.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 34 }}>🏪</div>
          <div style={{ fontWeight: 700, margin: '10px 0 4px' }}>No businesses yet</div>
          <div className="small muted">Find a local business with a weak website and click “New Business”.</div>
        </div>
      ) : (
        <div className="grid">
          {projects.map(p => {
            const st = statusOf(p);
            return (
              <Link key={p.id} href={'/admin/project/' + p.id} className="proj">
                <h3 style={{ margin: '0 0 4px' }}>{p.business?.name || 'Untitled'}</h3>
                <div className="small muted">{p.business?.type}{p.business?.city ? ' · ' + p.business.city : ''}</div>
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={'badge ' + st}>{labelOf[st]}</span>
                  <button className="btn ghost small danger" style={{ padding: '3px 9px', fontSize: 12 }} onClick={e => del(p.id, p.business?.name, e)}>Delete</button>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
