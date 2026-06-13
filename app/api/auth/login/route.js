import { NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { verifyPassword, createSession } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req) {
  const { identifier, password } = await req.json();
  if (!identifier || !password) return NextResponse.json({ error: 'Enter your username/email and password' }, { status: 400 });
  await initDb();
  const id = identifier.toLowerCase().trim();
  const rows = await sql`SELECT id, password FROM users WHERE username = ${id} OR email = ${id} LIMIT 1`;
  const user = rows[0];
  // Constant-ish: still run a compare to reduce username enumeration timing.
  const ok = user ? await verifyPassword(password, user.password) : await verifyPassword(password, '$2a$11$0000000000000000000000000000000000000000000000000000');
  if (!user || !ok) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
