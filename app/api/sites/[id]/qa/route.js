// Quality checks on the current draft.
//   POST {}                 run the checks (optionally apply automatic fixes)
//   POST { browser: {...} } store findings from the in-browser responsive check
import { siteAccess } from '@/lib/access';
import { saveDraft, logEvent } from '@/lib/site/store';
import { runQa, autoFix } from '@/lib/site/qa';
import { normalizeDoc, isLegacyDoc } from '@/lib/site/schema';
import { factsForSite, stockAllowed } from '@/lib/site/service';
import { patchProject } from '@/lib/db';
import { handle, json, readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = handle(async (req, { params }) => {
  const { site, user } = await siteAccess(params.id, { staffOnly: true });
  const body = await readJson(req).catch(() => ({}));
  if (body.browser) {
    const findings = (Array.isArray(body.browser.findings) ? body.browser.findings : []).slice(0, 100).map(f => ({
      page: String(f.page || '').slice(0, 120), width: Number(f.width) || 0, code: String(f.code || '').slice(0, 40), message: String(f.message || '').slice(0, 300)
    }));
    await patchProject(site.projectId, { browserQa: { checkedAt: Date.now(), pages: Number(body.browser.pages) || 0, widths: [390, 768, 1280], findings } });
    return json({ ok: true, findings: findings.length });
  }
  if (isLegacyDoc(site.draft)) return json({ qa: await runQa(site.draft), fixes: [] });
  const { facts } = await factsForSite(site);
  const opts = { facts, allowStock: await stockAllowed() };
  let doc = normalizeDoc(site.draft), fixes = [], rev = site.draftRev;
  if (body.fix) {
    const fixed = autoFix(doc, opts);
    fixes = fixed.fixes;
    if (fixes.length) {
      const saved = await saveDraft(site.id, fixed.doc, { expectedRev: site.draftRev, actorId: user.id });
      doc = saved.doc; rev = saved.rev;
      await logEvent(site.id, 'qa.fixed', user.id, { fixes: fixes.length });
    }
  }
  return json({ qa: await runQa(doc, opts), fixes, rev });
});
