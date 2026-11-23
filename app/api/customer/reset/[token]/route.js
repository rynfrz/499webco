// Public: set a new password from a reset link.
import { redeemToken } from '@/lib/customers';
import { createSession } from '@/lib/auth';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { handle, json, readJson } from '@/lib/http';

export const runtime = 'nodejs';

export const POST = handle(async (req, { params }) => {
  await rateLimit(`reset:${clientIp(req)}`, 20, 900);
  const body = await readJson(req);
  const userId = await redeemToken(params.token, 'reset', { password: body.password });
  await createSession(userId);
  return json({ ok: true, next: '/dashboard' });
});
