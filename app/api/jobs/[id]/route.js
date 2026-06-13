// Poll a generation job (recovery if the client disconnected mid-stream).
import { NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req, { params }) {
  try {
    await requireUser();
    await initDb();
    const rows = await sql`SELECT id, project_id, kind, status, progress, error FROM jobs WHERE id = ${params.id}`;
    if (!rows[0]) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    return NextResponse.json({ job: rows[0] });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
