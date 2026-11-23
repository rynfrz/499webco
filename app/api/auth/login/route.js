import { NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { verifyPassword, createSession } from '@/lib/auth';
import { rateLimit, clientIp } from '@/lib/ratelimit';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { identifier, password } = await req.json();
    if (!identifier || !password) return NextResponse.json({ error: 'Enter your username/email and password' }, { status: 400 });
    await initDb();
    const id = String(identifier).toLowerCase().trim().slice(0, 200);
    // Slow down password guessing: per address + per account.
    try {
      await rateLimit(`login-ip:${clientIp(req)}`, 30, 600);
      await rateLimit(`login-id:${id}`, 10, 600);
    } catch (e) { return NextResponse.json({ error: 'Too many sign-in attempts. Please wait a few minutes and try again.' }, { status: 429 }); }
    const rows = await sql`SELECT id, password, role FROM users WHERE username = ${id} OR email = ${id} LIMIT 1`;
    const user = rows[0];
    const ok = user ? await verifyPassword(String(password), user.password) : false;
    if (!ok) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    await createSession(user.id);
    await sql`UPDATE users SET last_login_at = ${Date.now()} WHERE id = ${user.id}`;
    // `next` tells the sign-in page where this kind of account belongs.
    return NextResponse.json({ ok: true, role: user.role, next: user.role === 'customer' ? '/dashboard' : '/admin' });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Login failed' }, { status: 500 });
  }
}
