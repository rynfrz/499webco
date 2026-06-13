'use client';
import { useState, useEffect } from 'react';

export default function Users() {
  const [users, setUsers] = useState(null);
  const [msg, setMsg] = useState(null);
  const [f, setF] = useState({ fullName: '', email: '', username: '', password: '', role: 'designer' });

  const load = () => fetch('/api/users').then(r => r.json()).then(d => setUsers(d.users || []), () => setUsers([]));
  useEffect(() => { load(); }, []);

  const toast = (text, type = 'success') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 3500); };

  async function add(e) {
    e.preventDefault();
    const res = await fetch('/api/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f) });
    const d = await res.json();
    if (!res.ok) return toast(d.error, 'error');
    setF({ fullName: '', email: '', username: '', password: '', role: 'designer' });
    toast('User added'); load();
  }
  async function setRole(id, role) {
    const res = await fetch(`/api/users/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role }) });
    const d = await res.json(); if (!res.ok) return toast(d.error, 'error');
    toast('Role updated'); load();
  }
  async function resetPw(id) {
    const pw = prompt('New password (min 8 chars):'); if (!pw) return;
    const res = await fetch(`/api/users/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    const d = await res.json(); toast(res.ok ? 'Password reset' : d.error, res.ok ? 'success' : 'error');
  }
  async function del(id, name) {
    if (!confirm(`Delete ${name}?`)) return;
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    const d = await res.json(); if (!res.ok) return toast(d.error, 'error');
    toast('User deleted'); load();
  }

  const set = k => e => setF({ ...f, [k]: e.target.value });

  return (
    <div className="inner wide">
      <h1>Users</h1>
      <p className="subtitle">Add team members and assign access. Admins manage settings and users; designers run the pipeline.</p>

      <div className="card">
        <div className="card-title">Add user</div>
        <form onSubmit={add}>
          <div className="row">
            <div className="field"><label>Full name</label><input value={f.fullName} onChange={set('fullName')} /></div>
            <div className="field"><label>Email</label><input type="email" value={f.email} onChange={set('email')} required /></div>
          </div>
          <div className="row">
            <div className="field"><label>Username</label><input value={f.username} onChange={set('username')} required /></div>
            <div className="field"><label>Temporary password</label><input value={f.password} onChange={set('password')} required /></div>
          </div>
          <div className="field" style={{ maxWidth: 220 }}>
            <label>Role</label>
            <select value={f.role} onChange={set('role')}>
              <option value="designer">Designer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button className="btn primary">+ Add user</button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Team</div>
        {!users ? <span className="spinner" /> : (
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Username</th><th>Role</th><th></th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.full_name || '—'}</td>
                  <td>{u.email}</td>
                  <td className="mono">{u.username}</td>
                  <td>
                    <select value={u.role} onChange={e => setRole(u.id, e.target.value)} style={{ width: 'auto', padding: '4px 8px' }}>
                      <option value="designer">designer</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn ghost small" style={{ padding: '4px 10px' }} onClick={() => resetPw(u.id)}>Reset password</button>{' '}
                    <button className="btn ghost small danger" style={{ padding: '4px 10px' }} onClick={() => del(u.id, u.full_name || u.username)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {msg && <div className={'toast ' + msg.type}>{msg.text}</div>}
    </div>
  );
}
