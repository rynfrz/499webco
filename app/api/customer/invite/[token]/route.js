// Public: a customer opens their invite link and chooses a password.
import { inviteInfo, redeemToken } from '@/lib/customers';
import { createSession } from '@/lib/auth';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { handle, json, readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req, { params }) => {
  await rateLimit(`invite:${clientIp(req)}`, 30, 600);
  const info = await inviteInfo(params.token);
  if (!info) throw { status: 404, message: 'This invitation link has expired or was already used.' };
  return json(info);
});

export const POST = handle(async (req, { params }) => {
  await rateLimit(`invite:${clientIp(req)}`, 30, 600);
  const body = await readJson(req);
  const userId = await redeemToken(params.token, 'invite', { password: body.password, fullName: body.fullName });
  await createSession(userId);
  return json({ ok: true, next: '/dashboard' });
});
