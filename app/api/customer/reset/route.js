// Public: ask for a password reset email. The response is identical whether or
// not the address has an account.
import { requestPasswordReset } from '@/lib/customers';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { handle, json, readJson, platformOrigin } from '@/lib/http';

export const runtime = 'nodejs';

export const POST = handle(async req => {
  await rateLimit(`reset:${clientIp(req)}`, 8, 900);
  const body = await readJson(req);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  if (email) {
    await rateLimit(`reset-to:${email}`, 4, 3600).catch(() => null) && await requestPasswordReset(email, await platformOrigin(req));
  }
  return json({ ok: true });
});
