// First-run admin creation. Only works while zero users exist.
import { NextResponse } from 'next/server';
import { sql, userCount, initDb } from '@/lib/db';
import { hashPassword, createSession, newId } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  const n = await userCount();
  return NextResponse.json({ needsSetup: n === 0 });
}

export async function POST(req) {
  const n = await userCount();
  if (n > 0) return NextResponse.json({ error: 'Setup already completed' }, { status: 403 });

  const { fullName, email, username, password } = await req.json();
  if (!email || !username || !password) return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  await initDb();
  const id = newId();
  await sql`INSERT INTO users (id, full_name, email, username, password, role, created_at)
            VALUES (${id}, ${fullName || ''}, ${email.toLowerCase()}, ${username.toLowerCase()}, ${await hashPassword(password)}, 'admin', ${Date.now()})`;
  await createSession(id);
  return NextResponse.json({ ok: true });
}
