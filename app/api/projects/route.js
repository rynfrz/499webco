// List projects (all team members see all projects) and create a new one.
import { NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { requireUser, newId } from '@/lib/auth';
import { blankProject } from '@/lib/projectModel';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireUser();
    await initDb();
    const rows = await sql`SELECT id, data, created_at, updated_at FROM projects ORDER BY updated_at DESC`;
    // Strip the big HTML blobs from the list payload.
    const list = rows.map(r => {
      const d = r.data;
      return {
        id: d.id, status: d.status,
        business: { name: d.business?.name, type: d.business?.type, city: d.business?.city },
        hasSite: !!d.generatedHtml, published: !!d.publish, launched: !!d.launch,
        updated_at: Number(r.updated_at)
      };
    });
    return NextResponse.json({ projects: list });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}

export async function POST(req) {
  try {
    const u = await requireUser();
    await initDb();
    const body = await req.json().catch(() => ({}));
    const id = newId('p');
    const project = blankProject(id, body.type);
    const now = Date.now();
    await sql`INSERT INTO projects (id, owner_id, data, created_at, updated_at)
              VALUES (${id}, ${u.id}, ${JSON.stringify(project)}::jsonb, ${now}, ${now})`;
    return NextResponse.json({ project });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
