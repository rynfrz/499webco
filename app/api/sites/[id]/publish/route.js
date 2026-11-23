// Publish the current draft. The live site only changes after the new version
// has rendered and been stored successfully.
import { siteAccess } from '@/lib/access';
import { publishAndSync } from '@/lib/site/publish';
import { rateLimit } from '@/lib/ratelimit';
import { handle, json, readJson, platformOrigin } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = handle(async (req, { params }) => {
  const { site, user, role } = await siteAccess(params.id, { ownerOnly: false });
  await rateLimit(`publish:${site.id}`, 20, 600);
  const body = await readJson(req).catch(() => ({}));
  const out = await publishAndSync(site.id, { actor: user, role, label: String(body.label || '').slice(0, 120), origin: await platformOrigin(req), notify: !!body.notify });
  return json(out);
});
