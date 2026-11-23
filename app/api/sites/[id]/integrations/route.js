// A site's integrations marketplace (GET) and connection controls (POST).
import { siteAccess } from '@/lib/access';
import { marketplace, connect, disconnect, recheck } from '@/lib/integrations/service';
import { logEvent } from '@/lib/site/store';
import { rateLimit } from '@/lib/ratelimit';
import { handle, json, readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const GET = handle(async (req, { params }) => {
  const { site, role } = await siteAccess(params.id, { full: false });
  return json(await marketplace(site, role));
});

export const POST = handle(async (req, { params }) => {
  const { site, user, role } = await siteAccess(params.id, { full: false });
  if (role === 'editor') throw { status: 403, message: 'Only the account owner can change integrations.' };
  await rateLimit(`integrations:${site.id}`, 40, 600);
  const body = await readJson(req);
  const provider = String(body.provider || '').slice(0, 40);
  let out;
  if (body.action === 'connect') out = await connect(site, provider, { config: body.config || {}, secrets: body.secrets || {} }, { actorId: user.id });
  else if (body.action === 'disconnect') out = await disconnect(site, provider);
  else if (body.action === 'recheck') out = await recheck(site, provider);
  else throw { status: 400, message: 'Unknown action' };
  await logEvent(site.id, 'integration.' + body.action, user.id, { provider, status: out.status });
  return json({ ...out, ...(await marketplace(site, role)) });
});
