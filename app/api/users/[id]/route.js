// Admin-only: change a user's role, reset password, or delete. Guards against
// removing/demoting the last remaining admin.
import { NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { requireAdmin, hashPassword } from '@/lib/auth';

export const runtime = 'nodejs';

async function adminCountExcluding(id) {
  const rows = await sql`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND id <> ${id}`;
  return rows[0].n;
}

export async function PATCH(req, { params }) {
  try {
    const me = await requireAdmin();
    await initDb();
    const { role, password } = await req.json();
    const id = params.id;
    const rows = await sql`SELECT id, role FROM users WHERE id = ${id}`;
    const target = rows[0];
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (role && role !== target.role) {
      if (!['admin', 'designer'].includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      if (target.role === 'admin' && role === 'designer' && (await adminCountExcluding(id)) === 0)
        return NextResponse.json({ error: 'Cannot demote the last admin' }, { status: 400 });
      await sql`UPDATE users SET role = ${role} WHERE id = ${id}`;
    }
    if (password) {
      if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
      await sql`UPDATE users SET password = ${await hashPassword(password)} WHERE id = ${id}`;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Error' }, { status: e.status || 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const me = await requireAdmin();
    await initDb();
    const id = params.id;
    if (id === me.id) return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
    const rows = await sql`SELECT role FROM users WHERE id = ${id}`;
    if (!rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (rows[0].role === 'admin' && (await adminCountExcluding(id)) === 0)
      return NextResponse.json({ error: 'Cannot delete the last admin' }, { status: 400 });
    await sql`DELETE FROM users WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Error' }, { status: e.status || 500 });
  }
}
