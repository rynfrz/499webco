// Any signed-in user manages their own details. Changing password requires the
// current password. Role is intentionally NOT editable here.
import { NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { requireUser, verifyPassword, hashPassword } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const u = await requireUser();
    return NextResponse.json({ user: u });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}

export async function PATCH(req) {
  try {
    const u = await requireUser();
    await initDb();
    const { fullName, email, username, currentPassword, newPassword } = await req.json();

    if (email || username) {
      const e2 = (email || '').toLowerCase(), un = (username || '').toLowerCase();
      const dup = await sql`SELECT id FROM users WHERE (email = ${e2} OR username = ${un}) AND id <> ${u.id} LIMIT 1`;
      if (dup.length) return NextResponse.json({ error: 'That email or username is already taken' }, { status: 409 });
    }
    if (fullName !== undefined) await sql`UPDATE users SET full_name = ${fullName} WHERE id = ${u.id}`;
    if (email) await sql`UPDATE users SET email = ${email.toLowerCase()} WHERE id = ${u.id}`;
    if (username) await sql`UPDATE users SET username = ${username.toLowerCase()} WHERE id = ${u.id}`;

    if (newPassword) {
      if (newPassword.length < 8) return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
      const rows = await sql`SELECT password FROM users WHERE id = ${u.id}`;
      if (!(await verifyPassword(currentPassword || '', rows[0].password)))
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 });
      await sql`UPDATE users SET password = ${await hashPassword(newPassword)} WHERE id = ${u.id}`;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Error' }, { status: e.status || 500 });
  }
}
