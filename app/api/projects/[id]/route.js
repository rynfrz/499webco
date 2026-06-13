import { NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const runtime = 'nodejs';

async function load(id) {
  const rows = await sql`SELECT data FROM projects WHERE id = ${id}`;
  return rows[0]?.data || null;
}

export async function GET(req, { params }) {
  try {
    await requireUser();
    await initDb();
    const p = await load(params.id);
    if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ project: p });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}

export async function PATCH(req, { params }) {
  try {
    await requireUser();
    await initDb();
    const incoming = await req.json();
    incoming.id = params.id;
    await sql`UPDATE projects SET data = ${JSON.stringify(incoming)}::jsonb, updated_at = ${Date.now()} WHERE id = ${params.id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    await requireUser();
    await initDb();
    await sql`DELETE FROM projects WHERE id = ${params.id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
