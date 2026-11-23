// Version history (GET) and restoring / rolling back (POST).
//   action: 'restore'  → load a version into the draft only (nothing public changes)
//           'rollback' → make a version the published site again (and the live domain)
//           'snapshot' → save a named restore point of the current draft
import { siteAccess } from '@/lib/access';
import { listVersions, listEvents, restoreDraftFrom, snapshotDraft, getVersion } from '@/lib/site/store';
import { rollbackAndSync } from '@/lib/site/publish';
import { rateLimit } from '@/lib/ratelimit';
import { handle, json, readJson, platformOrigin } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const GET = handle(async (req, { params }) => {
  const { site, role } = await siteAccess(params.id, { full: false });
  let versions = await listVersions(site.id);
  // Customers see their publish history and restore points, not internal staging artifacts.
  if (role !== 'staff') versions = versions.filter(v => ['publish', 'snapshot', 'legacy'].includes(v.kind)).map(v => ({ ...v, meta: undefined }));
  const events = role === 'staff' ? await listEvents(site.id) : (await listEvents(site.id)).filter(e => ['site.published', 'site.rolled_back', 'draft.restored', 'page.added'].includes(e.type)).map(e => ({ id: e.id, type: e.type, actor: e.actor, at: e.at }));
  return json({ versions, events, publishedVersionId: site.publishedVersionId, liveVersionId: site.liveVersionId, stagingVersionId: role === 'staff' ? site.stagingVersionId : undefined });
});

export const POST = handle(async (req, { params }) => {
  const { site, user, role } = await siteAccess(params.id, { full: false });
  await rateLimit(`versions:${site.id}`, 30, 600);
  const body = await readJson(req);
  if (body.action === 'snapshot') {
    const id = await snapshotDraft(site.id, String(body.label || 'Restore point').slice(0, 120), { actorId: user.id, meta: { manual: true } });
    return json({ versionId: id });
  }
  const version = await getVersion(String(body.versionId || ''));
  if (!version || version.siteId !== site.id) throw { status: 404, message: 'Version not found' };
  if (role !== 'staff' && !['publish', 'snapshot', 'legacy'].includes(version.kind)) throw { status: 404, message: 'Version not found' };
  if (body.action === 'restore') return json(await restoreDraftFrom(site.id, version.id, { actorId: user.id }));
  if (body.action === 'rollback') return json(await rollbackAndSync(site.id, version.id, { actor: user, origin: await platformOrigin(req) }));
  throw { status: 400, message: 'Unknown action' };
});
