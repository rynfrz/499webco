// Studio-side management of customer account access for a project.
import { requireUser } from '@/lib/auth';
import { inviteCustomer, listMembers, revokeMember, resendAccess } from '@/lib/customers';
import { handle, json, readJson, platformOrigin } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = handle(async req => {
  await requireUser();
  const projectId = new URL(req.url).searchParams.get('projectId');
  if (!projectId) throw { status: 400, message: 'projectId is required' };
  return json({ members: await listMembers(projectId) });
});

export const POST = handle(async req => {
  await requireUser();
  const body = await readJson(req);
  const origin = await platformOrigin(req);
  if (!body.projectId) throw { status: 400, message: 'projectId is required' };
  if (body.action === 'invite') {
    const r = await inviteCustomer(body.projectId, { email: body.email, role: body.role === 'editor' ? 'editor' : 'owner', origin });
    return json({ ok: true, link: r.link, emailed: r.emailed, userId: r.userId });
  }
  if (body.action === 'resend') {
    const r = await resendAccess(body.projectId, body.userId, origin);
    return json({ ok: true, link: r.link, emailed: r.emailed });
  }
  if (body.action === 'revoke') { await revokeMember(body.projectId, body.userId); return json({ ok: true }); }
  throw { status: 400, message: 'Unknown action' };
});
