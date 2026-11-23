// The visual editor's canvas: one draft page rendered with inline assets and
// the editor bridge. Returned as JSON and shown in a sandboxed iframe, so the
// page (even if something unsafe slipped through) has no access to the
// platform's cookies or APIs.
import { siteAccess } from '@/lib/access';
import { renderPageHtml } from '@/lib/site/render';
import { normalizeDoc, isLegacyDoc, findPage, homePage } from '@/lib/site/schema';
import { EDITOR_CSS, EDITOR_SCRIPT } from '@/lib/site/editorBridge';
import { integrationsFor } from '@/lib/site/service';
import { handle, json } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = handle(async (req, { params }) => {
  const { site, role } = await siteAccess(params.id);
  if (isLegacyDoc(site.draft)) return json({ legacy: true, html: site.draft.html, rev: site.draftRev });
  const doc = normalizeDoc(site.draft);
  const url = new URL(req.url);
  const page = findPage(doc, url.searchParams.get('page') || '') || homePage(doc);
  if (!page) throw { status: 404, message: 'This site has no pages yet.' };
  const integ = await integrationsFor(site, { editMode: true });
  let html = renderPageHtml(doc, page, {
    base: '/', inlineAssets: true, editMode: true, includeDrafts: true, siteId: site.id,
    renderIntegration: integ.renderIntegration,
    editorHead: `<style>${EDITOR_CSS}</style>`,
    editorScript: `<script>${EDITOR_SCRIPT}</script>`
  });
  html = html.replace('<html ', `<html data-editor-role="${role}" data-editor-page="${page.id}" `);
  return json({ html, rev: site.draftRev, pageId: page.id });
});
