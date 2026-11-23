// A staged upgrade: approve it (it becomes the draft; the previous draft is
// snapshotted) or discard it. Publishing is a separate, explicit step.
import { siteAccess } from '@/lib/access';
import { approveStaging, discardStaging, getVersion } from '@/lib/site/store';
import { publishAndSync } from '@/lib/site/publish';
import { patchProject } from '@/lib/db';
import { outline } from '@/lib/site/schema';
import { handle, json, readJson, platformOrigin } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const GET = handle(async (req, { params }) => {
  const { site } = await siteAccess(params.id, { full: false, staffOnly: true });
  if (!site.stagingVersionId) return json({ staging: null });
  const v = await getVersion(site.stagingVersionId);
  return json({ staging: v ? { id: v.id, label: v.label, meta: v.meta, createdAt: v.createdAt, outline: outline(v.doc) } : null });
});

export const POST = handle(async (req, { params }) => {
  const { site, user } = await siteAccess(params.id, { full: false, staffOnly: true });
  const body = await readJson(req);
  if (body.action === 'discard') { await discardStaging(site.id, { actorId: user.id }); return json({ ok: true }); }
  if (body.action === 'approve') {
    const out = await approveStaging(site.id, { actorId: user.id });
    await patchProject(site.projectId, { siteId: site.id, siteEngine: 'v2' });
    let published = null;
    if (body.publish) published = await publishAndSync(site.id, { actor: user, role: 'staff', label: 'Upgrade published', origin: await platformOrigin(req) });
    return json({ ...out, published });
  }
  throw { status: 400, message: 'Unknown action' };
});
