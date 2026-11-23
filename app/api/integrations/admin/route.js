// Studio: marketplace administration (enable/disable, visibility, entitlement,
// platform credentials), connection errors, and per-customer grants.
import { requireUser, requireAdmin } from '@/lib/auth';
import { adminOverview, adminUpdate, setGrant } from '@/lib/integrations/service';
import { allInstances } from '@/lib/integrations/store';
import { getProvider } from '@/lib/integrations/registry';
import { handle, json, readJson } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = handle(async () => {
  await requireUser();
  const instances = await allInstances();
  return json({
    providers: await adminOverview(),
    connections: instances.map(i => ({ siteId: i.siteId, slug: i.slug, businessName: i.businessName, provider: i.provider, name: getProvider(i.provider)?.name || i.provider, status: i.status, error: i.error, lastCheckedAt: i.lastCheckedAt }))
  });
});

export const PATCH = handle(async req => {
  await requireAdmin();
  const body = await readJson(req);
  if (body.grant) return json({ grants: await setGrant(body.grant.projectId, body.grant.provider, !!body.grant.granted) });
  return json({ provider: await adminUpdate(String(body.id || ''), body) });
});
