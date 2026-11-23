// Staff repair tool: read one section's current markup (content applied) so it
// can be edited and saved back through the 'section.html' operation.
import { siteAccess } from '@/lib/access';
import { normalizeDoc, isLegacyDoc } from '@/lib/site/schema';
import { applyFields } from '@/lib/site/html';
import { handle, json } from '@/lib/http';

export const runtime = 'nodejs';

export const GET = handle(async (req, { params }) => {
  const { site } = await siteAccess(params.id, { staffOnly: true });
  if (isLegacyDoc(site.draft)) throw { status: 400, message: 'Classic site' };
  const url = new URL(req.url);
  const doc = normalizeDoc(site.draft);
  const which = url.searchParams.get('chrome');
  if (which === 'header' || which === 'footer') return json({ html: applyFields(doc.design[which].html, doc.design[which].fields), name: which });
  const page = doc.pages.find(p => p.id === url.searchParams.get('page'));
  const sec = page?.sections.find(s => s.id === url.searchParams.get('section'));
  if (!sec) throw { status: 404, message: 'Section not found' };
  return json({ html: applyFields(sec.html, sec.fields), name: sec.name, className: sec.className, css: page.css });
});
