// Stage E — quality assurance for a structured site.
//
// runQa() inspects the rendered output of every page and returns issues with
// a severity. autoFix() repairs everything that can be repaired without
// guessing content, so a build only finishes with the problems a person really
// needs to look at.
//
// Rendering in a real browser at three widths is done by the admin preview
// (see ResponsiveCheck in the admin UI): serverless functions cannot run a
// browser, but the administrator's own browser can, and its findings are
// stored next to these.
import { parseFragment, textOf, LOGO_TOKEN } from './html.js';
import { renderSite, buildSiteCss } from './render.js';
import { livePages, pagePath, isLegacyDoc } from './schema.js';
import { normalizeTokens, contrastRatio } from './foundation.js';

const PLACEHOLDER_RE = /lorem ipsum|dolor sit amet|\[(?:your|insert|company|business|phone|address|name)[^\]]*\]|\bTODO\b|\bTBD\b|xxx-xxxx|555-0100|example\.com/i;

function issue(severity, code, message, extra = {}) {
  return { severity, code, message, ...extra };
}

function pathOfHref(href) {
  let h = String(href || '');
  const hashAt = h.indexOf('#');
  const hash = hashAt >= 0 ? h.slice(hashAt + 1) : '';
  if (hashAt >= 0) h = h.slice(0, hashAt);
  const q = h.indexOf('?');
  if (q >= 0) h = h.slice(0, q);
  return { path: h, hash };
}
const normPath = p => (p === '' || p === '/' ? '/' : '/' + p.replace(/^\/+|\/+$/g, '') + '/');

function cssBalanced(css) {
  let depth = 0;
  for (const ch of css.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '')) {
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth < 0) return false; }
  }
  return depth === 0;
}

/**
 * @param {object} doc      SiteDoc
 * @param {object} [o]      { facts, removed: [{where, tags}], checkRemote: async url => boolean }
 * @returns {{ status, summary: {errors, warnings, info}, issues: [], checkedAt }}
 */
export async function runQa(doc, o = {}) {
  const issues = [];
  if (isLegacyDoc(doc)) {
    return { status: 'skipped', summary: { errors: 0, warnings: 0, info: 1 }, issues: [issue('info', 'legacy', 'Classic single-page site: structural checks apply after it is upgraded or converted.')], checkedAt: Date.now() };
  }
  const pages = livePages(doc).filter(p => p.status !== 'archived');
  const validPaths = new Set(pages.map(p => pagePath(p)));
  const facts = o.facts || null;
  const allowedImages = new Set([...(facts?.photos || [])]);

  // ---- build ----------------------------------------------------------------
  let rendered;
  try {
    rendered = renderSite(doc, { base: '/', includeDrafts: true });
  } catch (e) {
    issues.push(issue('error', 'build_failed', 'The site failed to render: ' + e.message));
    return finish(issues);
  }
  const css = buildSiteCss(doc);
  if (!cssBalanced(doc.design?.css || '')) issues.push(issue('error', 'css_unbalanced', 'The design stylesheet has unbalanced braces, so some styles will not apply.', { fixable: false }));
  for (const p of pages) if (p.css && !cssBalanced(p.css)) issues.push(issue('error', 'css_unbalanced', `The page stylesheet for "${p.title}" has unbalanced braces.`, { pageId: p.id }));

  // ---- design tokens --------------------------------------------------------
  const t = normalizeTokens(doc.design?.tokens);
  const c1 = contrastRatio(t.colors.text, t.colors.bg);
  if (c1 != null && c1 < 4.5) issues.push(issue('error', 'contrast_text', `Body text contrast is ${c1.toFixed(1)}:1 (needs 4.5:1).`, { fixable: true }));
  const c2 = contrastRatio(t.colors.muted, t.colors.bg);
  if (c2 != null && c2 < 3) issues.push(issue('warning', 'contrast_muted', `Secondary text contrast is ${c2.toFixed(1)}:1 (aim for 4.5:1).`, { fixable: true }));
  const c3 = contrastRatio(t.colors.accent, t.colors.onAccent);
  if (c3 != null && c3 < 3) issues.push(issue('error', 'contrast_button', `Button text contrast is ${c3.toFixed(1)}:1.`, { fixable: true }));

  if (!doc.design?.header?.html?.includes('data-nav')) issues.push(issue('warning', 'nav_static', 'The header has no dynamic navigation slot, so new pages will not appear in the menu automatically.'));

  // ---- per page -------------------------------------------------------------
  const titles = new Map(), descs = new Map();
  const definedClasses = new Set((css.match(/\.[a-zA-Z_][\w\-]*/g) || []).map(s => s.slice(1)));
  const undefinedClasses = new Map();

  for (const page of pages) {
    const file = rendered.files.find(f => f.path === (page.slug ? `${page.slug}/index.html` : 'index.html'));
    if (!file) { issues.push(issue('error', 'page_missing', `"${page.title}" was not rendered.`, { pageId: page.id })); continue; }
    const root = parseFragment(file.content);
    const where = { pageId: page.id, page: page.title };
    const ids = new Set(root.querySelectorAll('[id]').map(e => e.getAttribute('id')));

    if (!page.sections.filter(s => !s.hidden).length) issues.push(issue('error', 'page_empty', `"${page.title}" has no visible content.`, where));

    // metadata
    const title = root.querySelector('title')?.text?.trim() || '';
    const desc = root.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    if (!page.seo?.title) issues.push(issue('warning', 'seo_title_missing', `"${page.title}" has no SEO title (the page name is used).`, { ...where, fixable: true }));
    else if (title.length > 65) issues.push(issue('info', 'seo_title_long', `"${page.title}" has a long SEO title (${title.length} characters; search results cut off around 60).`, where));
    if (!page.seo?.description) issues.push(issue('warning', 'seo_description_missing', `"${page.title}" has no meta description.`, { ...where, fixable: true }));
    else if (desc.length > 170) issues.push(issue('info', 'seo_description_long', `"${page.title}" has a long meta description (${desc.length} characters).`, where));
    if (title) { if (titles.has(title)) issues.push(issue('warning', 'seo_title_duplicate', `"${page.title}" and "${titles.get(title)}" share the same SEO title.`, where)); else titles.set(title, page.title); }
    if (page.seo?.description) { if (descs.has(page.seo.description)) issues.push(issue('warning', 'seo_description_duplicate', `"${page.title}" and "${descs.get(page.seo.description)}" share the same meta description.`, where)); else descs.set(page.seo.description, page.title); }

    // headings
    const main = root.querySelector('main');
    const h1s = main ? main.querySelectorAll('h1') : [];
    if (h1s.length === 0) issues.push(issue('warning', 'h1_missing', `"${page.title}" has no main heading (h1).`, { ...where, fixable: true }));
    if (h1s.length > 1) issues.push(issue('warning', 'h1_multiple', `"${page.title}" has ${h1s.length} main headings; a page should have one.`, { ...where, fixable: true }));

    // links
    for (const a of root.querySelectorAll('a')) {
      const href = a.getAttribute('href');
      const label = (a.text || '').replace(/\s+/g, ' ').trim().slice(0, 50) || a.getAttribute('aria-label') || 'link';
      if (href == null || href.trim() === '' || href.trim() === '#') {
        issues.push(issue('error', 'link_dead', `"${label}" on "${page.title}" does not go anywhere.`, { ...where, fixable: true }));
        continue;
      }
      if (/^(https?:|mailto:|tel:|sms:)/i.test(href)) continue;
      const { path, hash } = pathOfHref(href);
      if (path === '' && hash) { if (!ids.has(hash)) issues.push(issue('warning', 'anchor_missing', `"${label}" on "${page.title}" points to a section (#${hash}) that does not exist.`, { ...where, fixable: true })); continue; }
      if (path.startsWith('/assets/')) continue;
      if (!validPaths.has(normPath(path))) issues.push(issue('error', 'link_broken', `"${label}" on "${page.title}" links to ${path}, which is not a page on this site.`, { ...where, fixable: true, href }));
    }
    for (const b of root.querySelectorAll('button')) {
      const inForm = !!b.closest?.('form');
      const isToggle = b.getAttribute('data-nav-toggle') != null;
      if (!inForm && !isToggle) issues.push(issue('warning', 'button_inert', `A button ("${(b.text || '').trim().slice(0, 40)}") on "${page.title}" has no action. Buttons outside a form should be links.`, where));
      if (!(b.text || '').trim() && !b.getAttribute('aria-label')) issues.push(issue('warning', 'button_unlabelled', `An icon button on "${page.title}" has no accessible label.`, where));
    }

    // images
    for (const img of root.querySelectorAll('img')) {
      const src = img.getAttribute('src') || '';
      if (!src) { issues.push(issue('error', 'image_missing', `An image on "${page.title}" has no source.`, { ...where, fixable: true })); continue; }
      if (src === LOGO_TOKEN) { issues.push(issue('error', 'logo_missing', `"${page.title}" expects a logo but none is uploaded.`, where)); continue; }
      if ((img.getAttribute('alt') || '').trim() === '' && !img.closest?.('[aria-hidden="true"]')) issues.push(issue('warning', 'image_alt_missing', `An image on "${page.title}" has no description (alt text).`, { ...where, fixable: true }));
      if (facts && !/^data:/.test(src) && !allowedImages.has(src) && src !== doc.settings?.logo && !o.allowStock) {
        issues.push(issue('error', 'image_unprovided', `"${page.title}" uses an image that was not supplied by the business (${src.slice(0, 80)}).`, { ...where, fixable: true, src }));
      } else if (o.checkRemote && /^https:/.test(src)) {
        const ok = await o.checkRemote(src).catch(() => false);
        if (!ok) issues.push(issue('error', 'image_unreachable', `An image on "${page.title}" could not be loaded (${src.slice(0, 80)}).`, { ...where, fixable: true, src }));
      }
    }

    // forms
    for (const form of root.querySelectorAll('form')) {
      if (form.getAttribute('data-form') == null) issues.push(issue('error', 'form_unwired', `A form on "${page.title}" is not connected to anything.`, { ...where, fixable: true }));
      if (!form.querySelector('[type="submit"]') && !form.querySelector('button')) issues.push(issue('error', 'form_no_submit', `A form on "${page.title}" has no submit button.`, where));
      for (const input of form.querySelectorAll('input, textarea, select')) {
        const type = input.getAttribute('type') || '';
        if (['hidden', 'submit'].includes(type) || input.getAttribute('class')?.includes('w-hp')) continue;
        if (!input.getAttribute('name')) issues.push(issue('error', 'form_field_unnamed', `A form field on "${page.title}" has no name, so its value would be lost.`, where));
        const id = input.getAttribute('id');
        if (!input.getAttribute('aria-label') && !(id && form.querySelector(`label[for="${id}"]`)) && !input.closest?.('label')) issues.push(issue('warning', 'form_field_unlabelled', `A form field on "${page.title}" has no label.`, where));
      }
    }

    // content
    const text = textOf(main ? main.toString() : file.content);
    const ph = text.match(PLACEHOLDER_RE);
    if (ph) issues.push(issue('error', 'placeholder_text', `"${page.title}" contains placeholder text ("${ph[0]}").`, where));
    if (text.length < 120) issues.push(issue('warning', 'page_thin', `"${page.title}" has very little content.`, where));
    if (facts && !facts.reviews.length && /★|out of 5|5-star|five-star|\b\d(\.\d)? stars?\b/i.test(text)) issues.push(issue('error', 'invented_reviews', `"${page.title}" shows ratings or reviews, but none were supplied.`, where));

    // unstyled classes (a sign the page ignored the design system)
    for (const el of root.querySelectorAll('[class]')) {
      for (const cls of (el.getAttribute('class') || '').split(/\s+/)) {
        if (!cls || cls.startsWith('is-') || cls.startsWith('page-') || cls.startsWith('type-') || cls.startsWith('s-') || cls.startsWith('js-')) continue;
        if (!definedClasses.has(cls)) undefinedClasses.set(cls, page.title);
      }
    }
    // layout risk: fixed widths in inline styles
    for (const el of root.querySelectorAll('[style]')) {
      const m = (el.getAttribute('style') || '').match(/(?:^|;)\s*(?:min-)?width\s*:\s*(\d{3,})px/i);
      if (m && +m[1] > 360) issues.push(issue('warning', 'overflow_risk', `An element on "${page.title}" has a fixed width of ${m[1]}px and may overflow on phones.`, where));
    }
  }
  if (undefinedClasses.size) {
    const list = [...undefinedClasses.keys()].slice(0, 12);
    issues.push(issue(undefinedClasses.size > 12 ? 'warning' : 'info', 'classes_unstyled', `${undefinedClasses.size} class name(s) are used in pages but not defined in the design system: ${list.join(', ')}${undefinedClasses.size > 12 ? '…' : ''}.`));
  }
  const fixed = (doc.design?.css || '').match(/(?:^|[;{\s])width\s*:\s*(\d{4,})px/g);
  if (fixed) issues.push(issue('warning', 'overflow_risk', 'The design stylesheet sets very wide fixed widths, which can cause sideways scrolling.'));

  // ---- site-level -------------------------------------------------------------
  if (!pages.some(p => p.type === 'contact') && !pages.some(p => p.sections.some(s => /data-form=/.test(s.html)))) issues.push(issue('info', 'no_contact_form', 'The site has no contact form.'));
  if (doc.settings && !doc.settings.formRecipient && pages.some(p => p.sections.some(s => /data-form=/.test(s.html)))) issues.push(issue('warning', 'form_no_recipient', 'Contact forms are present but no notification email is set, so messages will only appear in the dashboard.'));
  for (const r of o.removed || []) if (r.tags?.length) issues.push(issue('info', 'sanitized', `Removed unsafe or unsupported elements from ${r.where}: ${[...new Set(r.tags)].join(', ')}.`));
  if (doc.meta?.generator?.engine === 'demo') issues.push(issue('info', 'demo_mode', 'Built in demo mode (no Anthropic key): layouts and copy come from templates. Add an API key for a custom-designed site.'));
  for (const m of doc.brief?.missing || []) issues.push(issue('info', 'missing_fact', `Missing: ${m.label}. ${m.impact}`));

  return finish(issues);
}

function finish(issues) {
  const summary = { errors: issues.filter(i => i.severity === 'error').length, warnings: issues.filter(i => i.severity === 'warning').length, info: issues.filter(i => i.severity === 'info').length };
  return { status: summary.errors ? 'failed' : summary.warnings ? 'warnings' : 'passed', summary, issues, checkedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// Auto-fix
// ---------------------------------------------------------------------------

function bestPageFor(href, pages) {
  const want = String(href || '').replace(/[#?].*$/, '').replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!want) return '/';
  const seg = want.split('/').pop();
  const byScore = pages.map(p => {
    const slug = p.slug.toLowerCase();
    let score = 0;
    if (slug === want) score = 100;
    else if (slug.split('/').pop() === seg) score = 80;
    else if (slug && (slug.includes(seg) || seg.includes(slug))) score = 50;
    else if (p.type === seg || (seg.startsWith(p.type) && p.type.length > 3)) score = 40;
    return { p, score };
  }).sort((a, b) => b.score - a.score)[0];
  if (byScore?.score >= 40) return pagePath(byScore.p);
  const contact = pages.find(p => p.type === 'contact');
  if (/contact|quote|book|call|touch|estimate|schedule/.test(want) && contact) return pagePath(contact);
  return '/';
}

function darken(hex, amount) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * (1 - amount)))));
  return '#' + ch.map(v => v.toString(16).padStart(2, '0')).join('');
}
function lighten(hex, amount) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v + (255 - v) * amount))));
  return '#' + ch.map(v => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Repair what can be repaired deterministically. Mutates and returns the doc
 * along with a list of what was changed.
 */
export function autoFix(doc, o = {}) {
  const fixes = [];
  if (isLegacyDoc(doc)) return { doc, fixes };
  const pages = livePages(doc);
  const validPaths = new Set(pages.map(p => pagePath(p)));
  const facts = o.facts || null;
  const allowedImages = new Set([...(facts?.photos || [])]);
  const contact = pages.find(p => p.type === 'contact');
  const name = doc.meta?.businessName || '';

  // tokens: push text colours until they are readable on the background
  const t = doc.design.tokens;
  const bgLight = (contrastRatio(t.colors.bg, '#000000') || 21) > (contrastRatio(t.colors.bg, '#ffffff') || 1);
  for (const key of ['text', 'muted']) {
    const need = key === 'text' ? 4.5 : 3;
    let val = t.colors[key], guard = 0;
    while ((contrastRatio(val, t.colors.bg) ?? 21) < need && guard++ < 12) val = bgLight ? darken(val, 0.15) : lighten(val, 0.15);
    if (val !== t.colors[key]) { fixes.push(`Adjusted the ${key === 'text' ? 'body' : 'secondary'} text colour for readable contrast.`); t.colors[key] = val; }
  }
  if ((contrastRatio(t.colors.accent, t.colors.onAccent) ?? 21) < 3) {
    t.colors.onAccent = (contrastRatio(t.colors.accent, '#000000') || 0) > (contrastRatio(t.colors.accent, '#ffffff') || 0) ? '#111111' : '#ffffff';
    fixes.push('Adjusted button text colour for readable contrast.');
  }

  const fixFields = (fields, where) => {
    for (const [k, f] of Object.entries(fields || {})) {
      if (f.type === 'link') {
        const h = (f.href || '').trim();
        if (!h || h === '#') { f.href = contact ? pagePath(contact) : '/'; fixes.push(`Pointed a link with no destination on ${where} to ${f.href}.`); }
        else if (!/^(https?:|mailto:|tel:|sms:|#)/i.test(h)) {
          const { path, hash } = pathOfHref(h);
          if (path && !path.startsWith('/assets/') && !validPaths.has(normPath(path))) {
            const to = bestPageFor(path, pages);
            f.href = to + (hash ? '#' + hash : '');
            fixes.push(`Repaired a broken link on ${where}: ${h} → ${f.href}.`);
          }
        }
      }
      if (f.type === 'image') {
        if (!(f.alt || '').trim()) { f.alt = name; fixes.push(`Added a description to an image on ${where}.`); }
      }
      if ((f.type === 'image' || f.type === 'bg') && facts && f.src && !/^data:/.test(f.src) && !allowedImages.has(f.src) && f.src !== doc.settings?.logo && f.src !== LOGO_TOKEN && !o.allowStock) {
        fields[k] = { ...f, __remove: true };
      }
    }
  };

  const fixHtml = (html, fields, where) => {
    const root = parseFragment(html);
    let changed = false;
    // remove images that were never supplied (and their now-empty wrappers)
    for (const [k, f] of Object.entries(fields)) {
      if (!f.__remove) continue;
      const el = root.querySelector(`[data-f="${k}"]`) || root.querySelector(`[data-f-bg="${k}"]`);
      if (el && f.type === 'image') {
        const parent = el.parentNode;
        el.remove();
        if (parent && parent !== root && !parent.text.trim() && !parent.querySelector('img,svg,iframe,video')) parent.setAttribute('aria-hidden', 'true');
      } else if (el) {
        el.removeAttribute('data-f-bg');
        el.setAttribute('style', (el.getAttribute('style') || '').replace(/background(-image)?\s*:[^;]*url\([^)]*\)[^;]*;?/gi, ''));
      }
      delete fields[k];
      fixes.push(`Removed an image on ${where} that was not supplied by the business.`);
      changed = true;
    }
    // unmarked links
    for (const a of root.querySelectorAll('a')) {
      if (a.getAttribute('data-f') != null || a.getAttribute('data-nav-item') != null) continue;
      const h = (a.getAttribute('href') || '').trim();
      if (!h || h === '#') { a.setAttribute('href', contact ? pagePath(contact) : '/'); changed = true; fixes.push(`Pointed a link with no destination on ${where} to ${a.getAttribute('href')}.`); }
      else if (!/^(https?:|mailto:|tel:|sms:|#)/i.test(h)) {
        const { path, hash } = pathOfHref(h);
        if (path && !path.startsWith('/assets/') && !validPaths.has(normPath(path))) { a.setAttribute('href', bestPageFor(path, pages) + (hash ? '#' + hash : '')); changed = true; fixes.push(`Repaired a broken link on ${where}: ${h}.`); }
      }
    }
    for (const form of root.querySelectorAll('form')) {
      if (form.getAttribute('data-form') == null) { form.setAttribute('data-form', 'contact'); changed = true; fixes.push(`Connected a form on ${where} to the platform form handler.`); }
      if (!form.querySelector('[data-form-status]')) { form.insertAdjacentHTML('beforeend', '<p class="w-form-status" data-form-status role="status" aria-live="polite"></p>'); changed = true; }
    }
    return changed ? root.toString() : html;
  };

  for (const k of ['header', 'footer']) {
    const c = doc.design[k];
    fixFields(c.fields, `the ${k}`);
    c.html = fixHtml(c.html, c.fields, `the ${k}`);
  }
  for (const page of pages) {
    let h1Seen = false;
    for (const s of page.sections) {
      const where = `"${page.title}"`;
      fixFields(s.fields, where);
      s.html = fixHtml(s.html, s.fields, where);
      // one h1 per page
      const root = parseFragment(s.html);
      let changed = false;
      for (const h of root.querySelectorAll('h1')) {
        if (!h1Seen) { h1Seen = true; continue; }
        h.tagName = 'h2'; changed = true;
      }
      if (changed) { s.html = root.toString().replace(/<(\/?)H2/g, '<$1h2'); fixes.push(`Demoted an extra main heading on ${where}.`); }
    }
    if (!h1Seen) {
      // promote the first heading of the page
      for (const s of page.sections) {
        if (s.hidden) continue;
        const root = parseFragment(s.html);
        const h = root.querySelector('h2') || root.querySelector('h3');
        if (h) { h.tagName = 'h1'; s.html = root.toString().replace(/<(\/?)H1/g, '<$1h1'); fixes.push(`Made the first heading on "${page.title}" the main heading.`); break; }
      }
    }
    // metadata
    const flat = page.sections.filter(s => !s.hidden).map(s => Object.values(s.fields).filter(f => f.type === 'text').map(f => textOf(f.html)).join(' ')).join(' ');
    if (!page.seo.title) {
      const loc = doc.brief?.business?.city;
      page.seo.title = (page.slug === '' ? `${name}${loc ? ' | ' + (doc.brief.business.type || '') + ' in ' + loc : ''}` : `${page.title} | ${name}`).slice(0, 70);
      fixes.push(`Wrote an SEO title for "${page.title}".`);
    }
    if (!page.seo.description && flat.trim()) {
      const firstPara = page.sections.flatMap(s => Object.values(s.fields)).filter(f => f.type === 'text').map(f => textOf(f.html)).find(x => x.length > 60) || flat;
      page.seo.description = firstPara.slice(0, 155).replace(/\s+\S*$/, '') + (firstPara.length > 155 ? '…' : '');
      fixes.push(`Wrote a meta description for "${page.title}".`);
    }
  }
  return { doc, fixes };
}
