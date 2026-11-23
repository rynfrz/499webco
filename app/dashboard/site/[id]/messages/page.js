'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { api, dateTime } from '@/components/api';

export default function Messages() {
  const { id } = useParams();
  const [msgs, setMsgs] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api(`/api/sites/${id}/messages`).then(d => setMsgs(d.messages)).catch(e => setErr(e.message)); }, [id]);
  return (
    <>
      <h1>Messages</h1>
      <p className="cd-sub">Everything sent through the forms on your website. You also get each one by email.</p>
      {err && <div className="cd-note error">{err}</div>}
      {!msgs ? <div className="cd-center"><div className="cd-spin" /></div> : msgs.length === 0 ? <div className="cd-card"><p style={{ margin: 0 }}>No messages yet. When someone fills in your contact form, it will show up here.</p></div> : (
        msgs.map(m => (
          <div className="cd-msg" key={m.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><b>{m.fields.name || m.fields.email || 'Website visitor'}</b><span className="cd-hint" style={{ margin: 0 }}>{dateTime(m.at)}{m.page ? ' · from ' + m.page : ''}</span></div>
            <dl>{Object.entries(m.fields).map(([k, v]) => [<dt key={k + 'k'}>{k}</dt>, <dd key={k + 'v'}>{/^[^\s@]+@[^\s@]+$/.test(v) ? <a href={`mailto:${v}`}>{v}</a> : k.toLowerCase() === 'phone' ? <a href={`tel:${String(v).replace(/[^\d+]/g, '')}`}>{v}</a> : v}</dd>])}</dl>
          </div>
        ))
      )}
    </>
  );
}
