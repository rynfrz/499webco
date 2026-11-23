// Request-level helpers shared by the site routes: the editor model, rendering
// contexts and integration wiring. Keeps the route files thin.
import { getProject, getSettings } from '../db.js';
import { factsFromProject } from '../gen/brief.js';
import { normalizeDoc, isLegacyDoc, livePages, pagePath, outline } from './schema.js';
import { listItems } from './html.js';
import { SECTION_OPTIONS } from './foundation.js';
import { SECTION_TEMPLATES } from './templates.js';
import { PAGE_TYPES } from './schema.js';
import { integrationRenderContext } from '../integrations/render.js';
import { listInstances } from '../integrations/store.js';
import { getProvider } from '../integrations/registry.js';

export async function factsForSite(site) {
  const project = await getProject(site.projectId);
  return { project, facts: project ? factsFromProject(project) : factsFromProject({ business: {}, questionnaire: {} }) };
}

/** Integration snippets + section renderer for a site (connected instances only). */
export async function integrationsFor(site, opts = {}) {
  return integrationRenderContext(site.id, opts);
}

/**
 * What an editor needs to drive the UI: structure and field metadata, never
 * raw templates. The canvas HTML comes from the render endpoint.
 */
export function editorModel(site, role) {
  const doc = site.draft;
  if (isLegacyDoc(doc)) {
    return { legacy: true, rev: site.draftRev, dirty: site.draftDirty, slug: site.slug, status: site.status, pages: outline(doc).pages,
      published: !!site.publishedVersionId, live: !!site.liveVersionId, staged: !!site.stagingVersionId };
  }
  const d = normalizeDoc(doc);
  const sectionView = s => ({
    id: s.id, name: s.name, type: s.type, hidden: s.hidden, options: s.options, raw: !!s.raw, locked: !!s.locked,
    integration: s.integration ? { provider: s.integration.provider, kind: s.integration.kind } : null,
    fields: Object.fromEntries(Object.entries(s.fields).map(([k, f]) => [k, f.type === 'text' ? { type: 'text' } : f])),
    items: s.integration ? 0 : listItems(s.html).length
  });
  return {
    legacy: false,
    rev: site.draftRev, dirty: site.draftDirty, slug: site.slug, status: site.status,
    published: !!site.publishedVersionId, live: !!site.liveVersionId, staged: !!site.stagingVersionId,
    businessName: d.meta.businessName,
    engine: d.meta.generator?.engine || null,
    pages: d.pages.map(p => ({
      id: p.id, slug: p.slug, path: pagePath(p), title: p.title, navLabel: p.navLabel, type: p.type, status: p.status, inNav: p.inNav, order: p.order,
      seo: p.seo, createdBy: p.createdBy, sections: p.sections.map(sectionView), ...(role === 'staff' ? { css: p.css } : {})
    })),
    chrome: {
      header: { fields: d.design.header.fields },
      footer: { fields: d.design.footer.fields }
    },
    tokens: d.design.tokens,
    redirects: d.redirects,
    settings: { formRecipient: d.settings.formRecipient, hasLogo: !!d.settings.logo },
    options: { section: SECTION_OPTIONS, sectionTemplates: Object.entries(SECTION_TEMPLATES).map(([k, v]) => ({ key: k, label: v.label })), pageTypes: PAGE_TYPES.filter(([k]) => k !== 'home') },
    ...(role === 'staff' ? { design: { concept: d.design.concept, system: d.design.system, css: d.design.css }, direction: d.direction, brief: d.brief } : {})
  };
}

export async function stockAllowed() {
  const s = await getSettings();
  return !!s.allowStockImagery;
}

export { livePages };

/** Blocks from connected integrations that can be placed on a page. */
export async function connectedBlocks(siteId) {
  const map = {}, list = [];
  for (const inst of await listInstances(siteId)) {
    if (inst.status !== 'connected') continue;
    const p = getProvider(inst.provider);
    if (!p?.placements?.length || !p.renderSection) continue;
    map[p.id] = { name: p.name, placements: p.placements };
    for (const pl of p.placements) list.push({ provider: p.id, name: p.name, kind: pl.kind, label: pl.label, description: pl.description || '' });
  }
  return { map, list };
}
