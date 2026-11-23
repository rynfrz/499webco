// Named design presets: save a successful style and reuse it on other sites.
import { sql, initDb } from '@/lib/db';
import { requireUser, newId } from '@/lib/auth';
import { presetConfigFrom } from '@/lib/design/direction';
import { handle, json, readJson } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = handle(async () => {
  await requireUser();
  await initDb();
  const rows = await sql`SELECT p.id, p.name, p.note, p.config, p.created_at, p.updated_at, u.full_name, u.username
                         FROM design_presets p LEFT JOIN users u ON u.id = p.created_by ORDER BY p.updated_at DESC`;
  return json({ presets: rows.map(r => ({ id: r.id, name: r.name, note: r.note, config: r.config, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at), createdBy: r.full_name || r.username || '' })) });
});

export const POST = handle(async req => {
  const u = await requireUser();
  await initDb();
  const body = await readJson(req);
  const name = String(body.name || '').trim().slice(0, 80);
  if (!name) throw { status: 400, message: 'Give the preset a name.' };
  if (!body.direction) throw { status: 400, message: 'No design direction to save.' };
  const id = newId('dp');
  const now = Date.now();
  const config = presetConfigFrom(body.direction);
  await sql`INSERT INTO design_presets (id, name, note, config, created_by, created_at, updated_at)
            VALUES (${id}, ${name}, ${String(body.note || '').slice(0, 500)}, ${JSON.stringify(config)}::jsonb, ${u.id}, ${now}, ${now})`;
  return json({ preset: { id, name, note: body.note || '', config } });
});
