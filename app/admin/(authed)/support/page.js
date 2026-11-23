'use client';
// Studio: customer support requests.
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, dateTime } from '@/components/api';

export default function SupportAdmin() {
  const [reqs, setReqs] = useState(null);
  const [reply, setReply] = useState({});
  const load = () => api('/api/support').then(d => setReqs(d.requests)).catch(() => setReqs([]));
  useEffect(() => { load(); }, []);
  async function answer(r, status) {
    await api('/api/support', { method: 'POST', body: { id: r.id, reply: reply[r.id] ?? r.reply, status } });
    load();
  }
  return (
    <div className="inner wide">
      <h1>Support</h1>
      <p className="subtitle">Requests sent by customers from their dashboard. Replies are emailed to them and shown in their account.</p>
      {!reqs ? <span className="spinner" /> : reqs.length === 0 ? <div className="card">No support requests.</div> : reqs.map(r => (
        <div className="card" key={r.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div><b>{r.subject}</b> <span className={'badge ' + (r.status === 'open' ? 'warn' : 'ok')}>{r.status}</span><div className="small muted">{r.business} · {r.from}{r.email && r.from !== r.email ? ` (${r.email})` : ''} · {dateTime(r.createdAt)}</div></div>
            {r.projectId && <Link className="btn ghost small" href={`/admin/project/${r.projectId}?step=3`}>Open website</Link>}
          </div>
          <p style={{ whiteSpace: 'pre-wrap', margin: '12px 0' }}>{r.body}</p>
          <textarea rows={3} style={{ minHeight: 0 }} value={reply[r.id] ?? r.reply} onChange={e => setReply({ ...reply, [r.id]: e.target.value })} placeholder="Write a reply…" />
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={() => answer(r, 'closed')}>Reply &amp; close</button>
            <button className="btn" onClick={() => answer(r, 'open')}>Reply, keep open</button>
          </div>
        </div>
      ))}
    </div>
  );
}
