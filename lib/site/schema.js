// The structured website document ("SiteDoc").
//
// This is the authoritative definition of a website — not a blob of generated
// code. Shape:
//
//   {
//     schema: 2, format: 'structured',
//     meta:     { businessName, lang, generator: {engine, jobId, at} },
//     brief:    { …structured business brief, missing facts… },
//     direction:{ …design direction used… },
//     design:   { concept, system: {...}, tokens: {...}, css, header: {html, fields}, footer: {html, fields} },
//     pages:    [ { id, slug, title, navLabel, type, status, inNav, order, seo: {title, description, noindex},
//                   css, sections: [ { id, type, name, className, html, fields, options, hidden, integration? } ] } ],
//     redirects:[ { from, to } ],
//     settings: { logo, favicon, formRecipient, social: {} }
//   }
//
// A pre-2.0 site is represented as { schema: 2, format: 'legacy-html', html }
// so it can live in the same version history and be rolled back to.
import { normalizeTokens } from './foundation.js';

export const SCHEMA = 2;

export const PAGE_TYPES = [
  ['home', 'Home'], ['about', 'About'], ['services', 'Services'], ['service', 'Service Detail'], ['products', 'Products'],
  ['product', 'Product Detail'], ['gallery', 'Portfolio / Gallery'], ['testimonials', 'Testimonials'], ['faq', 'FAQ'],
  ['blog', 'Blog / Resources'], ['contact', 'Contact'], ['booking', 'Booking'], ['locations', 'Locations'],
  ['landing', 'Landing Page'], ['standard', 'Standard Content'], ['custom', 'Custom']
];
const PAGE_TYPE_KEYS = new Set(PAGE_TYPES.map(p => p[0]));

const RESERVED_SLUGS = new Set(['assets', 'api', 'admin', 'preview', 'sitemap.xml', 'robots.txt', '404']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

export function sid(prefix = 's') {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

export function slugify(name = '') {
  return String(name).toLowerCase().trim()
    .replace(/['’]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9/]+/g, '-').replace(/-*\/-*/g, '/').replace(/^[-/]+|[-/]+$/g, '').slice(0, 60);
}

/** A valid, non-reserved page slug ('' is the home page). Throws with a friendly message. */
export function cleanSlug(input) {
  const s = slugify(input || '');
  if (!s) throw new Error('Please enter a page address using letters and numbers.');
  if (!SLUG_RE.test(s)) throw new Error('A page address can use letters, numbers and dashes, with at most one "/".');
  if (RESERVED_SLUGS.has(s.split('/')[0])) throw new Error(`"${s.split('/')[0]}" is reserved — please choose another address.`);
  return s;
}

export function pagePath(page) { return page.slug ? `/${page.slug}/` : '/'; }

export function findPage(doc, idOrSlug) {
  return (doc.pages || []).find(p => p.id === idOrSlug) || (doc.pages || []).find(p => p.slug === idOrSlug) || null;
}
export function homePage(doc) { return (doc.pages || []).find(p => p.slug === '') || (doc.pages || [])[0] || null; }
export function livePages(doc) { return (doc.pages || []).filter(p => p.status !== 'archived').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
export function navPages(doc) { return livePages(doc).filter(p => p.inNav && p.status === 'published'); }

export function isLegacyDoc(doc) { return doc?.format === 'legacy-html'; }
export function legacyDoc(html, meta = {}) { return { schema: SCHEMA, format: 'legacy-html', html: String(html || ''), meta }; }

const str = (v, max = 300) => String(v ?? '').slice(0, max);

export function normalizeSection(s = {}) {
  const out = {
    id: /^[a-z0-9]{4,24}$/i.test(s.id || '') ? s.id : sid('s'),
    type: str(s.type || 'content', 40).toLowerCase().replace(/[^a-z0-9\-]/g, '') || 'content',
    name: str(s.name || s.type || 'Section', 80),
    className: str(s.className || '', 200).split(/\s+/).filter(c => /^[a-zA-Z][\w\-]{0,40}$/.test(c) && !c.startsWith('w-section')).join(' '),
    html: String(s.html || ''),
    fields: s.fields && typeof s.fields === 'object' ? s.fields : {},
    options: {
      tone: ['surface', 'tint', 'accent', 'dark'].includes(s.options?.tone) ? s.options.tone : 'default',
      spacing: ['tight', 'loose'].includes(s.options?.spacing) ? s.options.spacing : 'normal',
      align: s.options?.align === 'center' ? 'center' : 'default'
    },
    hidden: !!s.hidden
  };
  if (s.integration && typeof s.integration === 'object') {
    out.integration = { provider: str(s.integration.provider, 40), kind: str(s.integration.kind, 40), config: s.integration.config && typeof s.integration.config === 'object' ? s.integration.config : {} };
  }
  if (s.locked) out.locked = true;
  // A converted classic section keeps its original outer element (no platform wrapper).
  if (s.raw) out.raw = true;
  return out;
}

export function normalizePage(p = {}, index = 0) {
  const slug = p.slug === '' || p.slug == null ? '' : slugify(p.slug);
  return {
    id: /^[a-z0-9]{4,24}$/i.test(p.id || '') ? p.id : sid('p'),
    slug,
    title: str(p.title || (slug ? slug : 'Home'), 120),
    navLabel: str(p.navLabel || p.title || 'Page', 40),
    type: PAGE_TYPE_KEYS.has(p.type) ? p.type : 'standard',
    status: ['published', 'draft', 'archived'].includes(p.status) ? p.status : 'published',
    inNav: p.inNav !== false,
    order: Number.isFinite(p.order) ? p.order : index,
    purpose: str(p.purpose, 600),
    seo: { title: str(p.seo?.title, 140), description: str(p.seo?.description, 320), noindex: !!p.seo?.noindex },
    css: String(p.css || ''),
    sections: (Array.isArray(p.sections) ? p.sections : []).map(normalizeSection),
    createdBy: p.createdBy === 'customer' ? 'customer' : 'admin',
    ...(p.archivedSlug ? { archivedSlug: slugify(p.archivedSlug) } : {})
  };
}

/** Bring any stored doc to the current, complete shape. Never throws. */
export function normalizeDoc(doc = {}) {
  if (isLegacyDoc(doc)) return doc;
  const pages = (Array.isArray(doc.pages) ? doc.pages : []).map(normalizePage);
  // Unique ids and slugs; exactly one home page.
  const seenId = new Set(), seenSlug = new Set();
  for (const p of pages) {
    while (seenId.has(p.id)) p.id = sid('p');
    seenId.add(p.id);
    if (p.status === 'archived') continue;
    let s = p.slug, n = 2;
    while (seenSlug.has(s)) s = `${p.slug || 'page'}-${n++}`;
    p.slug = s; seenSlug.add(s);
    const secIds = new Set();
    for (const s2 of p.sections) { while (secIds.has(s2.id)) s2.id = sid('s'); secIds.add(s2.id); }
  }
  if (pages.length && !pages.some(p => p.slug === '' && p.status !== 'archived')) {
    const first = pages.find(p => p.status !== 'archived');
    if (first) first.slug = '';
  }
  pages.sort((a, b) => a.order - b.order).forEach((p, i) => { p.order = i; });
  const design = doc.design || {};
  const chrome = c => ({ html: String(c?.html || ''), fields: c?.fields && typeof c.fields === 'object' ? c.fields : {}, className: str(c?.className, 120), ...(c?.raw ? { raw: true } : {}) });
  return {
    schema: SCHEMA,
    format: 'structured',
    meta: { businessName: str(doc.meta?.businessName, 160), lang: /^[a-z]{2}(-[A-Z]{2})?$/.test(doc.meta?.lang || '') ? doc.meta.lang : 'en', generator: doc.meta?.generator || null, upgradedFrom: doc.meta?.upgradedFrom || null },
    brief: doc.brief && typeof doc.brief === 'object' ? doc.brief : {},
    direction: doc.direction && typeof doc.direction === 'object' ? doc.direction : null,
    design: {
      concept: str(design.concept, 2000),
      system: design.system && typeof design.system === 'object' ? design.system : {},
      tokens: normalizeTokens(design.tokens || {}),
      css: String(design.css || ''),
      header: chrome(design.header),
      footer: chrome(design.footer)
    },
    pages,
    redirects: (Array.isArray(doc.redirects) ? doc.redirects : [])
      .filter(r => r && typeof r.from === 'string' && typeof r.to === 'string' && r.from.startsWith('/') && r.to.startsWith('/'))
      .slice(0, 200).map(r => ({ from: r.from.slice(0, 160), to: r.to.slice(0, 160) })),
    settings: {
      logo: str(doc.settings?.logo, 2_000_000),
      favicon: str(doc.settings?.favicon, 2_000_000),
      formRecipient: str(doc.settings?.formRecipient, 200),
      social: doc.settings?.social && typeof doc.settings.social === 'object' ? doc.settings.social : {},
      legacyScript: str(doc.settings?.legacyScript, 200000),
      // 'primitives' = converted classic site: its own CSS is the baseline.
      foundation: doc.settings?.foundation === 'primitives' ? 'primitives' : 'full',
      bodyClass: str(doc.settings?.bodyClass, 200).replace(/[^\w\- ]/g, ''),
      extraFonts: str(doc.settings?.extraFonts, 600)
    }
  };
}

/** Structural validation used before saving a generated or edited doc. */
export function validateDoc(doc) {
  const errors = [];
  if (isLegacyDoc(doc)) { if (!doc.html) errors.push('Legacy site has no HTML.'); return { ok: !errors.length, errors }; }
  if (!doc || doc.schema !== SCHEMA) errors.push('Unknown site document version.');
  const pages = (doc?.pages || []).filter(p => p.status !== 'archived');
  if (!pages.length) errors.push('The site has no pages.');
  if (pages.filter(p => p.slug === '').length !== 1) errors.push('The site needs exactly one home page.');
  const slugs = new Set();
  for (const p of pages) {
    if (p.slug && !SLUG_RE.test(p.slug)) errors.push(`Page "${p.title}" has an invalid address "${p.slug}".`);
    if (slugs.has(p.slug)) errors.push(`Two pages share the address "/${p.slug}".`);
    slugs.add(p.slug);
    if (!p.sections?.length) errors.push(`Page "${p.title}" has no content.`);
  }
  if (!doc?.design?.header?.html) errors.push('The site has no header.');
  if (!doc?.design?.footer?.html) errors.push('The site has no footer.');
  return { ok: !errors.length, errors };
}

/** Compact outline of a doc (for lists, prompts and the dashboard). */
export function outline(doc) {
  if (isLegacyDoc(doc)) return { legacy: true, pages: [{ id: 'legacy', slug: '', title: 'Home (classic single page)', sections: 0 }] };
  return {
    legacy: false,
    pages: livePages(doc).map(p => ({ id: p.id, slug: p.slug, path: pagePath(p), title: p.title, navLabel: p.navLabel, type: p.type, status: p.status, inNav: p.inNav, sections: p.sections.length, seo: p.seo }))
  };
}

/** Update every internal link that pointed at `fromPath` (after a slug change). */
export function rewriteInternalLinks(doc, fromPath, toPath) {
  let count = 0;
  const fix = fields => {
    for (const f of Object.values(fields || {})) {
      if (f?.type === 'link' && typeof f.href === 'string') {
        if (f.href === fromPath || f.href === fromPath.replace(/\/$/, '')) { f.href = toPath; count++; }
        else if (f.href.startsWith(fromPath + '#')) { f.href = toPath + f.href.slice(fromPath.length); count++; }
      }
    }
  };
  const fixHtml = html => String(html || '').replace(/href="([^"]*)"/g, (m, h) => {
    if (h === fromPath || h === fromPath.replace(/\/$/, '')) { count++; return `href="${toPath}"`; }
    return m;
  });
  fix(doc.design?.header?.fields); fix(doc.design?.footer?.fields);
  if (doc.design?.header) doc.design.header.html = fixHtml(doc.design.header.html);
  if (doc.design?.footer) doc.design.footer.html = fixHtml(doc.design.footer.html);
  for (const p of doc.pages || []) for (const s of p.sections || []) { fix(s.fields); s.html = fixHtml(s.html); }
  return count;
}
