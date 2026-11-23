// A site's editor model (GET) and edit operations on its draft (PATCH).
// Shared by the admin and customer editors; siteAccess() decides the role and
// applyOps() enforces what that role may change.
import { siteAccess } from '@/lib/access';
import { saveDraft, logEvent } from '@/lib/site/store';
import { applyOps } from '@/lib/site/ops';
import { normalizeDoc } from '@/lib/site/schema';
import { editorModel, factsForSite, connectedBlocks } from '@/lib/site/service';
import { rateLimit } from '@/lib/ratelimit';
import { handle, json, readJson } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = handle(async (req, { params }) => {
  const { site, role } = await siteAccess(params.id);
  const blocks = await connectedBlocks(site.id);
  return json({ site: { id: site.id, projectId: site.projectId, ...editorModel(site, role), integrationBlocks: blocks.list }, role });
});

export const PATCH = handle(async (req, { params }) => {
  const { site, role, user } = await siteAccess(params.id);
  await rateLimit(`edit:${user.id}`, 240, 60);
  const body = await readJson(req);
  const { facts } = await factsForSite(site);
  const doc = normalizeDoc(site.draft);
  const blocks = (body.ops || []).some(o => o?.op === 'integration.place') ? await connectedBlocks(site.id) : { map: {}, list: [] };
  const { results } = applyOps(doc, body.ops, { role, facts, integrations: blocks.map });
  const saved = await saveDraft(site.id, doc, { expectedRev: Number.isInteger(body.rev) ? body.rev : null, actorId: user.id });
  const structural = results.filter(r => r.type !== 'field' && r.type !== 'noop');
  if (structural.length) await logEvent(site.id, 'draft.edited', user.id, { ops: body.ops.map(o => o.op).slice(0, 20) });
  const fresh = { ...site, draft: saved.doc, draftRev: saved.rev, draftDirty: true };
  return json({ rev: saved.rev, results, site: structural.length ? { id: site.id, projectId: site.projectId, ...editorModel(fresh, role), integrationBlocks: (await connectedBlocks(site.id)).list } : undefined });
});
