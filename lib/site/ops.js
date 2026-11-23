// Edit operations on a site draft.
//
// Editors never send whole documents or raw markup for content changes. They
// send small, named operations; each one is validated, permission-checked and
// applied to the structured document here. That is what lets a customer change
// content freely without being able to break the design system.
//
// Roles: 'staff' (administrators / designers) can do everything.
//        'owner' and 'editor' (customers) get the content-level subset.
import { cleanFieldValue, editItem, sanitizeHtml, sanitizeCss, safeUrl } from './html.js';
import { ingestSection } from './clean.js';
import { normalizeTokens, SECTION_OPTIONS } from './foundation.js';
import { cleanSlug, pagePath, livePages, rewriteInternalLinks, normalizePage, sid, isLegacyDoc, PAGE_TYPES } from './schema.js';
import { SECTION_TEMPLATES, buildTemplatePage } from './templates.js';

export class OpError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'OpError'; this.status = status; }
}

const CUSTOMER_OPS = new Set([
  'field.set', 'section.move', 'section.hide', 'section.options', 'section.add', 'section.remove', 'section.duplicate', 'item.edit',
  'page.update', 'page.move', 'page.add', 'page.archive', 'page.restore', 'page.delete', 'brand.colors', 'settings.contact',
  'integration.place', 'integration.update'
]);
const STAFF_ONLY = new Set(['design.tokens', 'design.css', 'page.css', 'section.html', 'chrome.html', 'redirect.add', 'redirect.remove', 'settings.update', 'section.lock']);
const MAX_PAGES = 40;
const MAX_SECTIONS = 40;

const s = (v, n) => String(v ?? '').slice(0, n);

function target(doc, op) {
  if (op.pageId === 'header' || op.pageId === 'footer') return { chrome: doc.design[op.pageId], where: op.pageId };
  const page = doc.pages.find(p => p.id === op.pageId);
  if (!page) throw new OpError('That page no longer exists.', 404);
  return { page };
}
function sectionOf(page, id) {
  const sec = page.sections.find(x => x.id === id);
  if (!sec) throw new OpError('That section no longer exists.', 404);
  return sec;
}

const HANDLERS = {
  'field.set'(doc, op) {
    const t = target(doc, op);
    const holder = t.chrome || sectionOf(t.page, op.sectionId);
    if (holder.integration) throw new OpError('This block is managed under Integrations.');
    const existing = holder.fields[s(op.key, 48)];
    if (!existing) throw new OpError('That piece of content no longer exists. Reload the editor.', 404);
    try { holder.fields[op.key] = cleanFieldValue(existing, op.value); }
    catch (e) { throw new OpError(e.message); }
    return { type: 'field', pageId: op.pageId };
  },

  'section.move'(doc, op) {
    const { page } = target(doc, op);
    const i = page.sections.findIndex(x => x.id === op.sectionId);
    if (i < 0) throw new OpError('That section no longer exists.', 404);
    const to = Number.isInteger(op.toIndex) ? op.toIndex : i + (op.dir === 'up' ? -1 : 1);
    if (to < 0 || to >= page.sections.length) return null;
    const [sec] = page.sections.splice(i, 1);
    page.sections.splice(to, 0, sec);
    return { type: 'structure', pageId: page.id };
  },

  'section.hide'(doc, op) {
    const { page } = target(doc, op);
    const sec = sectionOf(page, op.sectionId);
    if (op.hidden && page.sections.filter(x => !x.hidden).length <= 1) throw new OpError('A page needs at least one visible section.');
    sec.hidden = !!op.hidden;
    return { type: 'structure', pageId: page.id };
  },

  'section.options'(doc, op) {
    const { page } = target(doc, op);
    const sec = sectionOf(page, op.sectionId);
    if (sec.raw) throw new OpError('Presentation presets are not available for this converted section.');
    const o = op.options || {};
    for (const key of ['tone', 'spacing', 'align']) {
      if (o[key] == null) continue;
      if (!SECTION_OPTIONS[key].some(([v]) => v === o[key])) throw new OpError('Unknown presentation option.');
      sec.options[key] = o[key];
    }
    return { type: 'structure', pageId: page.id };
  },

  'section.add'(doc, op, ctx) {
    const { page } = target(doc, op);
    if (page.sections.length >= MAX_SECTIONS) throw new OpError('This page has the maximum number of sections.');
    const tpl = SECTION_TEMPLATES[op.template];
    if (!tpl) throw new OpError('Unknown section type.');
    const sec = tpl.build(ctx.facts);
    sec.id = sid('s');
    const after = page.sections.findIndex(x => x.id === op.afterSectionId);
    page.sections.splice(after >= 0 ? after + 1 : page.sections.length, 0, sec);
    return { type: 'structure', pageId: page.id, sectionId: sec.id };
  },

  'section.duplicate'(doc, op) {
    const { page } = target(doc, op);
    if (page.sections.length >= MAX_SECTIONS) throw new OpError('This page has the maximum number of sections.');
    const sec = sectionOf(page, op.sectionId);
    if (sec.integration) throw new OpError('Integration blocks cannot be duplicated.');
    const copy = JSON.parse(JSON.stringify(sec));
    copy.id = sid('s');
    page.sections.splice(page.sections.indexOf(sec) + 1, 0, copy);
    return { type: 'structure', pageId: page.id, sectionId: copy.id };
  },

  'section.remove'(doc, op, ctx) {
    const { page } = target(doc, op);
    const sec = sectionOf(page, op.sectionId);
    if (sec.locked && ctx.role !== 'staff') throw new OpError('This section is locked by your web team. Hide it instead, or ask us to remove it.');
    if (page.sections.filter(x => !x.hidden && x.id !== sec.id).length < 1) throw new OpError('A page needs at least one visible section.');
    page.sections.splice(page.sections.indexOf(sec), 1);
    return { type: 'structure', pageId: page.id };
  },

  'item.edit'(doc, op) {
    const t = target(doc, op);
    const holder = t.chrome || sectionOf(t.page, op.sectionId);
    if (holder.integration) throw new OpError('This block is managed under Integrations.');
    if (!['duplicate', 'remove', 'up', 'down'].includes(op.action)) throw new OpError('Unknown list action.');
    try {
      const r = editItem(holder.html, holder.fields, Number(op.index), op.action);
      holder.html = r.html; holder.fields = r.fields;
    } catch (e) { throw new OpError(e.message); }
    return { type: 'structure', pageId: op.pageId };
  },

  'page.update'(doc, op) {
    const { page } = target(doc, op);
    const out = { type: 'page', pageId: page.id };
    if (op.title != null) { const v = s(op.title, 120).trim(); if (!v) throw new OpError('A page needs a title.'); page.title = v; }
    if (op.navLabel != null) page.navLabel = s(op.navLabel, 40).trim() || page.title.slice(0, 40);
    if (op.inNav != null) page.inNav = !!op.inNav;
    if (op.seo) {
      if (op.seo.title != null) page.seo.title = s(op.seo.title, 140).trim();
      if (op.seo.description != null) page.seo.description = s(op.seo.description, 320).trim();
      if (op.seo.noindex != null) page.seo.noindex = !!op.seo.noindex;
    }
    if (op.status != null) {
      if (!['published', 'draft'].includes(op.status)) throw new OpError('Unknown page status.');
      if (page.slug === '' && op.status !== 'published') throw new OpError('The home page cannot be unpublished.');
      page.status = op.status;
    }
    if (op.slug != null && op.slug !== page.slug) {
      if (page.slug === '') throw new OpError('The home page address cannot be changed.');
      let next;
      try { next = cleanSlug(op.slug); } catch (e) { throw new OpError(e.message); }
      if (doc.pages.some(p => p.id !== page.id && p.status !== 'archived' && p.slug === next)) throw new OpError(`Another page already uses "/${next}/".`);
      const from = pagePath(page), to = `/${next}/`;
      page.slug = next;
      out.linksUpdated = rewriteInternalLinks(doc, from, to);
      // Keep old public addresses working.
      if (op.wasPublished !== false) {
        doc.redirects = (doc.redirects || []).filter(r => r.from !== to && r.from !== from).map(r => (r.to === from ? { ...r, to } : r));
        doc.redirects.push({ from, to });
        out.redirect = { from, to };
      }
    }
    return out;
  },

  'page.move'(doc, op) {
    const list = livePages(doc);
    const i = list.findIndex(p => p.id === op.pageId);
    if (i < 0) throw new OpError('That page no longer exists.', 404);
    const to = Number.isInteger(op.toIndex) ? op.toIndex : i + (op.dir === 'up' ? -1 : 1);
    if (to < 0 || to >= list.length) return null;
    const [p] = list.splice(i, 1);
    list.splice(to, 0, p);
    list.forEach((x, n) => { x.order = n; });
    return { type: 'pages' };
  },

  'page.add'(doc, op, ctx) {
    if (livePages(doc).length >= MAX_PAGES) throw new OpError('This site has the maximum number of pages.');
    const type = PAGE_TYPES.some(([k]) => k === op.type) && op.type !== 'home' ? op.type : 'standard';
    const title = s(op.title, 80).trim();
    if (!title) throw new OpError('Give the new page a title.');
    let slug;
    try { slug = cleanSlug(op.slug || title); } catch (e) { throw new OpError(e.message); }
    const taken = new Set(livePages(doc).map(p => p.slug));
    let n = 2; const base = slug;
    while (taken.has(slug)) slug = `${base}-${n++}`;
    const has = Object.fromEntries(livePages(doc).map(p => [p.type, true]));
    const page = normalizePage(buildTemplatePage(type, ctx.facts, { id: sid('p'), title, navLabel: s(op.navLabel || title, 40), slug, inNav: op.inNav !== false, order: doc.pages.length, status: 'draft', has, intro: s(op.intro, 300), description: '' }), doc.pages.length);
    page.status = 'draft';
    page.createdBy = ctx.role === 'staff' ? 'admin' : 'customer';
    doc.pages.push(page);
    return { type: 'pages', pageId: page.id, path: pagePath(page) };
  },

  'page.archive'(doc, op) {
    const { page } = target(doc, op);
    if (page.slug === '') throw new OpError('The home page cannot be removed.');
    page.archivedSlug = page.slug;
    page.status = 'archived';
    page.inNav = false;
    return { type: 'pages' };
  },

  'page.restore'(doc, op) {
    const page = doc.pages.find(p => p.id === op.pageId && p.status === 'archived');
    if (!page) throw new OpError('That page is not archived.', 404);
    let slug = page.archivedSlug || page.slug || 'page';
    const taken = new Set(livePages(doc).map(p => p.slug));
    let n = 2; const base = slug;
    while (taken.has(slug)) slug = `${base}-${n++}`;
    page.slug = slug; page.status = 'draft';
    return { type: 'pages', pageId: page.id };
  },

  'page.delete'(doc, op, ctx) {
    const page = doc.pages.find(p => p.id === op.pageId);
    if (!page) throw new OpError('That page no longer exists.', 404);
    if (page.slug === '' && page.status !== 'archived') throw new OpError('The home page cannot be deleted.');
    // Customers archive first; a permanent delete is only for an already-archived page.
    if (ctx.role !== 'staff' && page.status !== 'archived') throw new OpError('Archive the page first. Archived pages can be deleted permanently.');
    doc.pages.splice(doc.pages.indexOf(page), 1);
    return { type: 'pages' };
  },

  // Put a connected integration's block on a page. The block's markup is never
  // stored: it is rendered from the provider's trusted template at render time.
  'integration.place'(doc, op, ctx) {
    const { page } = target(doc, op);
    if (page.sections.length >= MAX_SECTIONS) throw new OpError('This page has the maximum number of sections.');
    const avail = ctx.integrations?.[op.provider];
    if (!avail) throw new OpError('Connect this integration first.');
    const placement = avail.placements.find(x => x.kind === op.kind);
    if (!placement) throw new OpError('That block is not offered by this integration.');
    const sec = {
      id: sid('s'), type: 'integration', name: `${avail.name}: ${placement.label}`, className: '', html: '', fields: {},
      options: { tone: 'default', spacing: 'normal', align: op.kind === 'payment' || op.kind === 'reviews' || op.kind === 'social' ? 'center' : 'default' }, hidden: false,
      integration: { provider: op.provider, kind: op.kind, config: {} }
    };
    const after = page.sections.findIndex(x => x.id === op.afterSectionId);
    page.sections.splice(after >= 0 ? after + 1 : page.sections.length, 0, sec);
    return { type: 'structure', pageId: page.id, sectionId: sec.id };
  },

  'integration.update'(doc, op) {
    const { page } = target(doc, op);
    const sec = sectionOf(page, op.sectionId);
    if (!sec.integration) throw new OpError('That section is not an integration block.');
    const cfg = { ...(sec.integration.config || {}) };
    for (const k of ['title', 'text', 'button']) if (op[k] !== undefined) cfg[k] = s(op[k], k === 'text' ? 300 : 120);
    sec.integration.config = cfg;
    return { type: 'structure', pageId: page.id };
  },

  // Controlled design customisation for customers: brand colours only.
  'brand.colors'(doc, op) {
    const next = normalizeTokens({ ...doc.design.tokens, colors: { ...doc.design.tokens.colors, ...(op.accent ? { accent: op.accent } : {}), ...(op.accent2 ? { accent2: op.accent2 } : {}), onAccent: undefined } });
    doc.design.tokens = next;
    return { type: 'design' };
  },

  'settings.contact'(doc, op) {
    if (op.formRecipient != null) {
      const v = s(op.formRecipient, 200).trim();
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new OpError('That does not look like an email address.');
      doc.settings.formRecipient = v;
    }
    return { type: 'settings' };
  },

  // ---- staff only -----------------------------------------------------------
  'design.tokens'(doc, op) {
    const merged = { ...doc.design.tokens };
    for (const k of ['colors', 'fonts', 'radius', 'layout', 'type']) if (op.tokens?.[k]) merged[k] = { ...merged[k], ...op.tokens[k] };
    if (op.tokens?.shadow) merged.shadow = op.tokens.shadow;
    if (op.tokens?.motion) merged.motion = op.tokens.motion;
    doc.design.tokens = normalizeTokens(merged);
    return { type: 'design' };
  },
  'design.css'(doc, op) { doc.design.css = sanitizeCss(s(op.css, 400000)); return { type: 'design' }; },
  'page.css'(doc, op) { const { page } = target(doc, op); page.css = sanitizeCss(s(op.css, 200000)); return { type: 'design', pageId: page.id }; },
  'section.html'(doc, op) {
    // Repair tool: replace a section's markup. Still sanitised and re-fielded.
    const { page } = target(doc, op);
    const sec = sectionOf(page, op.sectionId);
    const { section } = ingestSection({ id: sec.id, type: sec.type, name: op.name || sec.name, className: op.className ?? sec.className, html: s(op.html, 300000), options: sec.options });
    if (sec.raw) section.raw = true;
    section.hidden = sec.hidden;
    page.sections[page.sections.indexOf(sec)] = section;
    return { type: 'structure', pageId: page.id };
  },
  'chrome.html'(doc, op) {
    if (!['header', 'footer'].includes(op.which)) throw new OpError('Unknown area.');
    const { section } = ingestSection({ html: s(op.html, 200000) });
    const prev = doc.design[op.which];
    doc.design[op.which] = { html: section.html, fields: section.fields, className: prev.className, ...(prev.raw ? { raw: true } : {}) };
    return { type: 'design' };
  },
  'section.lock'(doc, op) { const { page } = target(doc, op); const sec = sectionOf(page, op.sectionId); if (op.locked) sec.locked = true; else delete sec.locked; return { type: 'structure', pageId: page.id }; },
  'redirect.add'(doc, op) {
    const from = '/' + s(op.from, 160).replace(/^\/+|\/+$/g, '') + '/', to = s(op.to, 160);
    if (!to.startsWith('/')) throw new OpError('A redirect must point to a page on this site.');
    doc.redirects = (doc.redirects || []).filter(r => r.from !== from);
    doc.redirects.push({ from, to });
    return { type: 'settings' };
  },
  'redirect.remove'(doc, op) { doc.redirects = (doc.redirects || []).filter(r => r.from !== op.from); return { type: 'settings' }; },
  'settings.update'(doc, op) {
    if (op.logo != null) { const u = op.logo === '' ? '' : safeUrl(op.logo, 'media'); if (op.logo && !u) throw new OpError('That logo address is not allowed.'); doc.settings.logo = u; }
    if (op.favicon != null) { const u = op.favicon === '' ? '' : safeUrl(op.favicon, 'media'); if (op.favicon && !u) throw new OpError('That icon address is not allowed.'); doc.settings.favicon = u; }
    if (op.businessName != null) doc.meta.businessName = s(op.businessName, 160);
    return { type: 'settings' };
  }
};

/**
 * Apply a list of operations to a draft.
 * @param {object} doc     normalised SiteDoc (mutated)
 * @param {Array}  ops     [{ op: 'field.set', … }]
 * @param {object} ctx     { role: 'staff'|'owner'|'editor', facts }
 * @returns {{ doc, results: Array }}
 */
export function applyOps(doc, ops, ctx) {
  if (isLegacyDoc(doc)) throw new OpError('This is a classic single-page site. It needs a Platform Conversion (or an upgrade) before it can be edited here.');
  if (!Array.isArray(ops) || !ops.length) throw new OpError('Nothing to save.');
  if (ops.length > 200) throw new OpError('Too many changes in one save.');
  const results = [];
  for (const op of ops) {
    const name = op?.op;
    const handler = HANDLERS[name];
    if (!handler) throw new OpError(`Unknown operation "${s(name, 40)}".`);
    if (ctx.role !== 'staff' && (STAFF_ONLY.has(name) || !CUSTOMER_OPS.has(name))) throw new OpError('You do not have permission to make that change.', 403);
    results.push(handler(doc, op, ctx) || { type: 'noop' });
  }
  return { doc, results };
}

export const OP_NAMES = Object.keys(HANDLERS);
