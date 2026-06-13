// Admin-only: list and create users.
import { NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { requireAdmin, hashPassword, newId } from '@/lib/auth';

export const runtime = 'nodejs';

function guard(fn) {
  return async (req) => {
    try { return await fn(req); }
    catch (e) { return NextResponse.json({ error: e.message || 'Error' }, { status: e.status || 500 }); }
  };
}

export const GET = guard(async () => {
  await requireAdmin();
  await initDb();
  const rows = await sql`SELECT id, full_name, email, username, role, created_at FROM users ORDER BY created_at ASC`;
  return NextResponse.json({ users: rows });
});

export const POST = guard(async (req) => {
  await requireAdmin();
  const { fullName, email, username, password, role } = await req.json();
  if (!email || !username || !password) throw { status: 400, message: 'Email, username and password are required' };
  if (password.length < 8) throw { status: 400, message: 'Password must be at least 8 characters' };
  if (!['admin', 'designer'].includes(role)) throw { status: 400, message: 'Invalid role' };
  await initDb();
  const dup = await sql`SELECT 1 FROM users WHERE email = ${email.toLowerCase()} OR username = ${username.toLowerCase()} LIMIT 1`;
  if (dup.length) throw { status: 409, message: 'That email or username is already taken' };
  const id = newId();
  await sql`INSERT INTO users (id, full_name, email, username, password, role, created_at)
            VALUES (${id}, ${fullName || ''}, ${email.toLowerCase()}, ${username.toLowerCase()}, ${await hashPassword(password)}, ${role}, ${Date.now()})`;
  return NextResponse.json({ ok: true, id });
});
