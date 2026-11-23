// Support requests from a customer about their website.
import { sql, initDb, getProject, getSettings } from '@/lib/db';
import { newId } from '@/lib/auth';
import { projectAccess } from '@/lib/access';
import { supportRequestNotice } from '@/lib/email';
import { rateLimit } from '@/lib/ratelimit';
import { handle, json, readJson, platformOrigin } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = handle(async req => {
  const projectId = new URL(req.url).searchParams.get('projectId');
  await projectAccess(projectId);
  await initDb();
  const rows = await sql`SELECT id, subject, body, status, reply, created_at, updated_at FROM support_requests WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 50`;
  return json({ requests: rows.map(r => ({ id: r.id, subject: r.subject, body: r.body, status: r.status, reply: r.reply, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) })) });
});

export const POST = handle(async req => {
  const body = await readJson(req);
  const { user } = await projectAccess(body.projectId);
  await rateLimit(`support:${user.id}`, 10, 3600);
  const subject = String(body.subject || '').trim().slice(0, 160);
  const text = String(body.body || '').trim().slice(0, 5000);
  if (!subject || !text) throw { status: 400, message: 'Please add a subject and a message.' };
  await initDb();
  const id = newId('sr');
  const now = Date.now();
  await sql`INSERT INTO support_requests (id, project_id, user_id, subject, body, status, created_at, updated_at) VALUES (${id}, ${body.projectId}, ${user.id}, ${subject}, ${text}, 'open', ${now}, ${now})`;
  const s = await getSettings();
  if (s.teamNotifyEmail) {
    const p = await getProject(body.projectId);
    supportRequestNotice(s.teamNotifyEmail, p?.business?.name, user.email, subject, text, `${await platformOrigin(req)}/admin/support`).catch(() => {});
  }
  return json({ ok: true, id });
});
