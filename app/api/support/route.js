// Studio: all support requests, reply and close.
import { sql, initDb } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { supportReply } from '@/lib/email';
import { handle, json, readJson, platformOrigin } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = handle(async () => {
  await requireUser();
  await initDb();
  const rows = await sql`SELECT r.id, r.project_id, r.subject, r.body, r.status, r.reply, r.created_at, r.updated_at, u.email, u.full_name, p.data->'business'->>'name' AS business
                         FROM support_requests r LEFT JOIN users u ON u.id = r.user_id LEFT JOIN projects p ON p.id = r.project_id
                         ORDER BY CASE WHEN r.status = 'open' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 200`;
  return json({ requests: rows.map(r => ({ id: r.id, projectId: r.project_id, subject: r.subject, body: r.body, status: r.status, reply: r.reply, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at), from: r.full_name || r.email || '', email: r.email || '', business: r.business || '' })) });
});

export const POST = handle(async req => {
  await requireUser();
  await initDb();
  const body = await readJson(req);
  const rows = await sql`SELECT r.id, r.subject, u.email FROM support_requests r LEFT JOIN users u ON u.id = r.user_id WHERE r.id = ${body.id}`;
  if (!rows[0]) throw { status: 404, message: 'Request not found' };
  const reply = String(body.reply ?? '').slice(0, 5000);
  const status = body.status === 'open' ? 'open' : 'closed';
  await sql`UPDATE support_requests SET reply = ${reply}, status = ${status}, updated_at = ${Date.now()} WHERE id = ${body.id}`;
  if (reply && rows[0].email) supportReply(rows[0].email, rows[0].subject, reply, `${await platformOrigin(req)}/dashboard`).catch(() => {});
  return json({ ok: true });
});
