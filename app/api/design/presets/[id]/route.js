import { sql, initDb } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { presetConfigFrom } from '@/lib/design/direction';
import { handle, json, readJson } from '@/lib/http';

export const runtime = 'nodejs';

export const PATCH = handle(async (req, { params }) => {
  await requireUser();
  await initDb();
  const body = await readJson(req);
  const rows = await sql`SELECT id, name, note, config FROM design_presets WHERE id = ${params.id}`;
  if (!rows[0]) throw { status: 404, message: 'Preset not found' };
  const name = body.name != null ? String(body.name).trim().slice(0, 80) || rows[0].name : rows[0].name;
  const note = body.note != null ? String(body.note).slice(0, 500) : rows[0].note;
  const config = body.direction ? presetConfigFrom(body.direction) : rows[0].config;
  await sql`UPDATE design_presets SET name = ${name}, note = ${note}, config = ${JSON.stringify(config)}::jsonb, updated_at = ${Date.now()} WHERE id = ${params.id}`;
  return json({ preset: { id: params.id, name, note, config } });
});

export const DELETE = handle(async (req, { params }) => {
  await requireUser();
  await initDb();
  await sql`DELETE FROM design_presets WHERE id = ${params.id}`;
  return json({ ok: true });
});
