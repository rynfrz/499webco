// Working with existing (pre-2.0) websites.
//
//   existingContentOf(doc)   what a site currently says, page by page — fed to
//                            upgrade prompts so content is reused, not lost
//   convertLegacy(html)      "Platform Conversion": turn a classic single HTML
//                            file into a structured, editable SiteDoc while
//                            keeping its appearance (no AI involved)
//
// Conversion is deliberately conservative: the original stylesheet, markup and
// element order are kept; only unsafe constructs are removed, and every
// limitation is written to a report the administrator reviews before approving.
import { parse } from 'node-html-parser';
import { sanitizeCss, textOf, applyFields } from './html.js';
import { ingestSection, ingestChrome } from './clean.js';
import { normalizeDoc, isLegacyDoc, livePages, sid } from './schema.js';
import { basicBrief } from '../gen/brief.js';

const PARSE_OPTS = { comment: false, blockTextElements: { script: true, style: true, pre: true, noscript: true } };
const tagOf = el => (el.rawTagName || '').toLowerCase();

function topColors(css) {
  const counts = new Map();
  for (const m of String(css).matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    let h = m[1].toLowerCase();
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    counts.set('#' + h, (counts.get('#' + h) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]).slice(0, 8);
}

function fontsFrom(html, css) {
  const fonts = new Set();
  for (const m of String(html).matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/gi)) {
    for (const f of decodeURIComponent(m[1].replace(/&amp;/g, '&')).matchAll(/family=([^:&]+)/g)) fonts.add(f[1].replace(/\+/g, ' '));
  }
  for (const m of String(css).matchAll(/font-family\s*:\s*['"]?([A-Za-z][A-Za-z0-9 ]{2,30})['"]?/g)) {
    const f = m[1].trim();
    if (!/^(inherit|system-ui|sans-serif|serif|monospace|var)/i.test(f)) fonts.add(f);
  }
  return [...fonts].slice(0, 5);
}

function sectionName(el, i) {
  const h = el.querySelector?.('h1, h2, h3');
  const fromHeading = h ? h.text.replace(/\s+/g, ' ').trim().slice(0, 48) : '';
  const id = el.getAttribute?.('id') || '';
  const cls = (el.getAttribute?.('class') || '').split(/\s+/)[0] || '';
  return fromHeading || (id || cls).replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || `Section ${i + 1}`;
}

function guessType(el, i) {
  const key = `${el.getAttribute?.('id') || ''} ${el.getAttribute?.('class') || ''}`.toLowerCase();
  for (const [t, re] of [['hero', /hero|banner|masthead/], ['services', /service|offer|feature/], ['about', /about|story/], ['testimonials', /review|testimonial/], ['faq', /faq/], ['contact', /contact|visit|location/], ['gallery', /gallery|photos/], ['cta', /cta|call-to/], ['stats', /stat|numbers/]]) if (re.test(key)) return t;
  return i === 0 ? 'hero' : 'content';
}

/** What an existing site says, in a neutral shape for prompts and reports. */
export function existingContentOf(doc) {
  if (isLegacyDoc(doc)) {
    const root = parse(doc.html || '', PARSE_OPTS);
    const body = root.querySelector('body') || root;
    const css = root.querySelectorAll('style').map(s => s.text).join('\n');
    const main = body.querySelector('main');
    const blocks = (main ? main.childNodes : body.childNodes).filter(n => n.nodeType === 1 && !['script', 'style', 'header', 'footer', 'nav', 'noscript'].includes(tagOf(n)));
    const sections = blocks.map((el, i) => ({ name: sectionName(el, i), type: guessType(el, i), text: el.text.replace(/\s+/g, ' ').trim().slice(0, 4000) })).filter(s => s.text.length > 1);
    return {
      legacy: true,
      identity: { colors: topColors(css), fonts: fontsFrom(doc.html, css) },
      title: root.querySelector('title')?.text?.trim() || '',
      description: root.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      pages: [{ id: 'legacy', type: 'home', title: 'Home', navLabel: 'Home', slug: '', inNav: true, sections }]
    };
  }
  const d = normalizeDoc(doc);
  return {
    legacy: false,
    identity: { colors: Object.values(d.design.tokens.colors).filter(c => /^#/.test(c)), fonts: [d.design.tokens.fonts.head, d.design.tokens.fonts.body] },
    title: d.meta.businessName, description: '',
    pages: livePages(d).map(p => ({
      id: p.id, type: p.type, title: p.title, navLabel: p.navLabel, slug: p.slug, inNav: p.inNav, purpose: p.purpose,
      sections: p.sections.filter(s => !s.hidden && !s.integration).map(s => ({ name: s.name, type: s.type, text: textOf(applyFields(s.html, s.fields)).slice(0, 4000) }))
    }))
  };
}

export function existingContentNote(existing, max = 12000) {
  const out = [];
  for (const p of existing.pages || []) {
    out.push(`### Page: ${p.title}${p.slug ? ' (/' + p.slug + '/)' : ''}`);
    for (const s of p.sections) out.push(`[${s.name}] ${s.text}`);
  }
  return out.join('\n').slice(0, max);
}

/**
 * Convert a classic single-file site into the structured format.
 * @returns {{ doc, report: { sections, editableFields, limitations: string[], kept: string[] } }}
 */
export function convertLegacy(html, { businessName = '', logo = '', facts = null } = {}) {
  const limitations = [], kept = [];
  const root = parse(String(html || ''), PARSE_OPTS);
  const htmlEl = root.querySelector('html');
  const head = root.querySelector('head');
  const body = root.querySelector('body') || root;

  // --- styles -----------------------------------------------------------------
  const styleBlocks = root.querySelectorAll('style').map(s => s.text);
  const rawCss = styleBlocks.join('\n');
  const css = sanitizeCss(rawCss);
  if (/@import/i.test(rawCss)) limitations.push('An @import in the original stylesheet was removed; a font or stylesheet it loaded may be missing.');
  let extraFonts = '';
  for (const l of (head || root).querySelectorAll('link')) {
    const href = (l.getAttribute('href') || '').replace(/&amp;/g, '&');
    if (/^https:\/\/fonts\.googleapis\.com\/css2?\?/.test(href) && !extraFonts) extraFonts = href;
    else if ((l.getAttribute('rel') || '').toLowerCase() === 'stylesheet') limitations.push(`An external stylesheet was not carried over: ${href.slice(0, 80)}.`);
  }
  if (extraFonts) kept.push('Google Fonts link');

  // --- scripts ----------------------------------------------------------------
  const inline = [];
  for (const sc of root.querySelectorAll('script')) {
    const type = (sc.getAttribute('type') || '').toLowerCase();
    if (type === 'application/ld+json') continue;
    const src = sc.getAttribute('src');
    if (src) limitations.push(`An external script was removed for safety: ${src.slice(0, 80)}. If it powered a widget, reconnect it under Integrations.`);
    else if (sc.text.trim()) inline.push(sc.text);
  }
  const legacyScript = inline.join('\n;\n');
  if (legacyScript) {
    kept.push('the original inline script (menus, animations)');
    limitations.push('The original inline JavaScript is kept so menus and animations keep working. It is model-written code from the classic generator; a Full Redesign or Multipage Conversion replaces it with the platform runtime.');
  }
  if (/\son[a-z]+\s*=/i.test(body.toString())) limitations.push('Inline event handlers (onclick and similar) were removed; anything that relied on them needs checking in the preview.');

  // --- structure ----------------------------------------------------------------
  let headerEl = null, footerEl = null;
  const mainEl = body.querySelector('main');
  const top = body.childNodes.filter(n => n.nodeType === 1);
  const blocks = [];
  const pushBlock = el => { const t = tagOf(el); if (!['script', 'style', 'noscript', 'link', 'meta'].includes(t)) blocks.push(el); };
  for (const el of top) {
    const t = tagOf(el);
    if (!headerEl && (t === 'header' || (t === 'nav' && !blocks.length))) { headerEl = el; continue; }
    if (t === 'footer') { footerEl = el; continue; }
    if (el === mainEl) { for (const c of mainEl.childNodes.filter(n => n.nodeType === 1)) pushBlock(c); continue; }
    pushBlock(el);
  }
  if (!headerEl) limitations.push('No separate header was found; the navigation stays part of the first section.');
  if (!footerEl) limitations.push('No separate footer was found.');
  if (mainEl && (mainEl.getAttribute('class') || mainEl.getAttribute('id'))) limitations.push('The original <main> wrapper had its own class or id; styles that depended on it may differ slightly.');

  const sections = [];
  let editable = 0;
  blocks.forEach((el, i) => {
    const { section, removed } = ingestSection({ type: guessType(el, i), name: sectionName(el, i), html: el.toString(), id: sid('s') });
    section.raw = true;
    if (!section.html.trim()) return;
    if (removed.some(t => t === 'iframe')) limitations.push(`An embedded frame in "${section.name}" was removed because its source is not on the trusted list.`);
    editable += Object.keys(section.fields).length;
    sections.push(section);
  });
  if (!sections.length) throw new Error('No content sections could be identified in this site.');

  const chromeOf = el => {
    if (!el) return { html: '', fields: {}, className: '' };
    const { chrome } = ingestChrome(el.toString());
    editable += Object.keys(chrome.fields).length;
    return { ...chrome, raw: true };
  };
  const header = chromeOf(headerEl);
  const footer = chromeOf(footerEl);
  // A site with no header/footer still needs non-empty chrome to validate.
  const emptyChrome = '<div hidden data-no-edit></div>';
  limitations.push('The original navigation is static: pages added later will not appear in the menu automatically. Links inside it can be edited by hand.');
  limitations.push('Section colour and spacing presets are not offered for converted sections; text, images, links, ordering and visibility are all editable.');

  const title = root.querySelector('title')?.text?.trim() || businessName;
  const description = root.querySelector('meta[name="description"]')?.getAttribute('content') || '';
  const doc = normalizeDoc({
    meta: { businessName, lang: htmlEl?.getAttribute('lang') || 'en', generator: { engine: 'convert', at: Date.now() }, upgradedFrom: 'convert' },
    brief: facts ? basicBrief(facts) : {},
    design: { concept: 'Converted from the original single-page site; appearance preserved.', system: { converted: true }, css, header: header.html ? header : { html: emptyChrome, fields: {}, raw: true }, footer: footer.html ? footer : { html: emptyChrome, fields: {}, raw: true } },
    pages: [{ id: sid('p'), slug: '', title: 'Home', navLabel: 'Home', type: 'home', status: 'published', inNav: true, order: 0, seo: { title: title.slice(0, 140), description: description.slice(0, 320) }, css: '', sections }],
    settings: { logo, favicon: logo, formRecipient: facts?.email || '', legacyScript, foundation: 'primitives', bodyClass: body.getAttribute?.('class') || '', extraFonts }
  });
  return { doc, report: { sections: sections.length, editableFields: editable, limitations: [...new Set(limitations)], kept } };
}
