// HTML / CSS safety + the editable-field system.
//
// Everything a model (or a customer's browser) hands us is untrusted. This
// module is the single gate it passes through:
//
//   sanitizeHtml()   allowlisted tags, no scripts, no event handlers, safe URLs
//   sanitizeCss()    no @import / expression / javascript: / unsafe url()
//   sanitizeInline() the tiny subset allowed inside an editable text field
//
// Editable content is separated from its template with `data-f="key"` markers:
//
//   extractFields(html) → { html (template), fields: { key: {type, …} } }
//   applyFields(html, fields) → html with the current content injected
//
// so customers change *content* (fields) while the *template* (markup, classes,
// layout) stays intact.
import { parse } from 'node-html-parser';

const PARSE_OPTS = { comment: false, blockTextElements: { script: true, style: true, pre: true, noscript: true } };

const HTML_TAGS = `a abbr address article aside b blockquote br button caption cite code col colgroup dd del details dfn div dl dt em
figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr i img input ins kbd label legend li main mark menu nav ol optgroup option
p picture pre q s samp section select small source span strong sub summary sup table tbody td textarea tfoot th thead time tr u ul var
video wbr fieldset iframe`.split(/\s+/);
const SVG_TAGS = `svg g path circle ellipse line polyline polygon rect text tspan defs lineargradient radialgradient stop clippath mask
pattern use symbol title desc`.split(/\s+/);
const ALLOWED = new Set([...HTML_TAGS, ...SVG_TAGS]);
// Removed together with their content.
const DROP = new Set(['script', 'style', 'object', 'embed', 'link', 'meta', 'base', 'head', 'noscript', 'template', 'applet', 'frame', 'frameset', 'math', 'foreignobject', 'animate', 'set', 'animatetransform', 'animatemotion', 'audio', 'canvas', 'dialog', 'slot', 'portal']);
const URL_ATTRS = new Set(['href', 'src', 'poster', 'cite', 'xlink:href', 'background', 'data-src']);
const BLOCKED_ATTRS = new Set(['srcdoc', 'formaction', 'action', 'method', 'ping', 'integrity', 'nonce', 'is', 'contenteditable', 'autofocus', 'http-equiv', 'sandbox', 'csp']);

// Hosts an <iframe> may point at (embeds the platform knows how to trust).
const IFRAME_HOSTS = [
  'www.google.com', 'maps.google.com', 'www.youtube-nocookie.com', 'www.youtube.com', 'player.vimeo.com',
  'calendly.com', 'cal.com', 'app.cal.com', 'form.jotform.com', 'api.mapbox.com', 'app.squareup.com', 'square.site', 'book.squareup.com'
];

export const LOGO_TOKEN = '{{LOGO_SRC}}';

// Control characters, zero-width space and line/paragraph separators (written with
// escapes so the source file itself stays plain ASCII).
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f\\u200b\\u2028\\u2029]', 'g');

export function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function escapeAttr(s = '') { return escapeHtml(s); }

/**
 * Return a safe URL or '' when it must be dropped.
 * kinds: 'link' (navigation), 'media' (img/video/source), 'frame' (iframe src)
 */
export function safeUrl(raw, kind = 'link') {
  if (raw == null) return '';
  let v = String(raw).replace(CONTROL_CHARS, '').trim();
  if (!v) return '';
  if (v === LOGO_TOKEN) return kind === 'frame' ? '' : v;
  if (v.startsWith('//')) v = 'https:' + v;
  const scheme = (v.match(/^([a-zA-Z][a-zA-Z0-9+.\-]*):/) || [])[1]?.toLowerCase();
  if (!scheme) {
    // relative, root-relative, hash, or query — fine for links and media
    if (kind === 'frame') return '';
    return v;
  }
  if (kind === 'frame') {
    if (scheme !== 'https') return '';
    try { const u = new URL(v); return IFRAME_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h)) ? u.toString() : ''; } catch { return ''; }
  }
  if (scheme === 'https' || scheme === 'http') { try { return new URL(v).toString(); } catch { return ''; } }
  if (kind === 'link' && (scheme === 'mailto' || scheme === 'tel' || scheme === 'sms')) return v;
  if (kind === 'media' && scheme === 'data' && /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);/i.test(v)) return v;
  return '';
}

function safeSrcset(v) {
  return String(v).split(',').map(part => {
    const [u, d] = part.trim().split(/\s+/, 2);
    const s = safeUrl(u, 'media');
    return s ? (d ? `${s} ${d}` : s) : '';
  }).filter(Boolean).join(', ');
}

const CSS_BAD = /expression\s*\(|javascript\s*:|vbscript\s*:|-moz-binding|behavior\s*:|@import|@charset|@namespace|<\/?[a-z!]|-->|\\(?=[0-9a-f]{1,6})/gi;

function cleanCssUrls(css) {
  return css.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (m, q, u) => {
    const v = u.trim();
    if (v.startsWith('#')) return `url(${v})`;
    if (/^data:(image\/(png|jpe?g|gif|webp|avif|svg\+xml)|font\/(woff2?|ttf|otf))[;,]/i.test(v)) return `url("${v.replace(/"/g, '%22')}")`;
    if (v === LOGO_TOKEN) return `url("${v}")`;
    if (/^https:\/\//i.test(v)) { try { return `url("${new URL(v).toString().replace(/"/g, '%22')}")`; } catch { return 'none'; } }
    return 'none';
  });
}

/** Sanitise a stylesheet. Returns safe CSS (possibly with unsafe parts removed). */
export function sanitizeCss(css = '', { maxLength = 400000 } = {}) {
  let out = String(css).slice(0, maxLength);
  out = out.replace(/\/\*[\s\S]*?\*\//g, '');      // comments can hide payloads
  out = out.replace(/@(import|charset|namespace)\b[^;{}]*;?/gi, '');   // whole statements, not just the keyword
  out = out.replace(CSS_BAD, '');
  out = cleanCssUrls(out);
  return out.trim();
}

/** Sanitise an inline style attribute value. */
export function sanitizeStyleAttr(style = '') {
  let out = String(style).slice(0, 2000).replace(/\/\*[\s\S]*?\*\//g, '').replace(CSS_BAD, '');
  out = cleanCssUrls(out).replace(/[{}]/g, '');
  return out.trim();
}

function tagOf(el) { return (el.rawTagName || '').toLowerCase(); }

function cleanAttributes(el, tag) {
  const raw = el.rawAttributes || {};
  for (const name of Object.keys(raw)) {
    const lower = name.toLowerCase();
    let value = el.getAttribute(name);
    if (lower.startsWith('on') || BLOCKED_ATTRS.has(lower) || /[^a-z0-9_:\-.]/i.test(name)) { el.removeAttribute(name); continue; }
    if (URL_ATTRS.has(lower)) {
      const kind = tag === 'iframe' ? 'frame' : (tag === 'a' || lower === 'cite') ? 'link' : (lower === 'href' && SVG_TAGS.includes(tag)) || lower === 'xlink:href' ? 'svgref' : 'media';
      let safe;
      if (kind === 'svgref') safe = String(value || '').trim().startsWith('#') ? String(value).trim() : '';
      else safe = safeUrl(value, kind);
      if (!safe) { el.removeAttribute(name); continue; }
      if (safe !== value) el.setAttribute(name, safe);
      continue;
    }
    if (lower === 'srcset' || lower === 'imagesrcset') {
      const s = safeSrcset(value || '');
      if (s) el.setAttribute(name, s); else el.removeAttribute(name);
      continue;
    }
    if (lower === 'style') {
      const s = sanitizeStyleAttr(value || '');
      if (s) el.setAttribute(name, s); else el.removeAttribute(name);
      continue;
    }
    if (lower === 'target') { if (value !== '_blank') el.removeAttribute(name); continue; }
  }
  if (tag === 'a' && el.getAttribute('target') === '_blank') el.setAttribute('rel', 'noopener noreferrer');
  if (tag === 'iframe') {
    if (!el.getAttribute('src')) return false;
    el.setAttribute('loading', 'lazy');
    el.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    if (!el.getAttribute('title')) el.setAttribute('title', 'Embedded content');
  }
  if (tag === 'img') {
    if (!el.getAttribute('src')) return false;
    if (el.getAttribute('alt') == null) el.setAttribute('alt', '');
    if (!el.getAttribute('loading')) el.setAttribute('loading', 'lazy');
    el.setAttribute('decoding', 'async');
  }
  if (tag === 'input') {
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    if (!['text', 'email', 'tel', 'number', 'url', 'date', 'time', 'checkbox', 'radio', 'hidden', 'submit', 'search'].includes(t)) el.setAttribute('type', 'text');
  }
  if (tag === 'button') {
    const t = (el.getAttribute('type') || '').toLowerCase();
    if (!['button', 'submit', 'reset'].includes(t)) el.setAttribute('type', 'button');
  }
  return true;
}

function walk(node, stats) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 8) { child.remove(); continue; }
    if (child.nodeType !== 1) continue;
    const tag = tagOf(child);
    if (!tag || DROP.has(tag)) { stats.removed.push(tag || 'unknown'); child.remove(); continue; }
    if (!ALLOWED.has(tag)) {
      // Unknown wrapper: keep its (sanitised) children, drop the element itself.
      walk(child, stats);
      stats.unwrapped.push(tag);
      child.replaceWith(...child.childNodes);
      continue;
    }
    if (!cleanAttributes(child, tag)) { stats.removed.push(tag); child.remove(); continue; }
    walk(child, stats);
  }
}

/**
 * Sanitise an HTML fragment. Returns { html, removed, unwrapped }.
 * `removed` lists dropped element types so QA can report them.
 */
export function sanitizeHtml(html = '', { maxLength = 600000 } = {}) {
  const root = parse(String(html).slice(0, maxLength), PARSE_OPTS);
  const stats = { removed: [], unwrapped: [] };
  walk(root, stats);
  return { html: root.toString(), removed: stats.removed, unwrapped: stats.unwrapped };
}

const INLINE_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'br', 'span', 'small', 'sup', 'sub', 'mark', 'a', 's', ...SVG_TAGS]);

function walkInline(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 8) { child.remove(); continue; }
    if (child.nodeType !== 1) continue;
    const tag = tagOf(child);
    if (!tag || DROP.has(tag)) { child.remove(); continue; }
    walkInline(child);
    if (!INLINE_TAGS.has(tag)) { child.replaceWith(...child.childNodes); continue; }
    if (!cleanAttributes(child, tag)) { child.remove(); continue; }
    if (SVG_TAGS.includes(tag)) continue; // already cleaned by cleanAttributes
    for (const name of Object.keys(child.rawAttributes || {})) {
      const lower = name.toLowerCase();
      const keep = lower === 'class' || (tag === 'a' && ['href', 'target', 'rel'].includes(lower));
      if (!keep) child.removeAttribute(name);
    }
  }
}

/** The subset allowed inside an editable text field (what a customer can type). */
export function sanitizeInline(html = '', { maxLength = 20000 } = {}) {
  // Block elements typed by a browser editor (div/p) become line breaks.
  const pre = String(html).slice(0, maxLength).replace(/<\/(div|p|li|h[1-6])\s*>/gi, '<br>');
  const root = parse(pre, PARSE_OPTS);
  walkInline(root);
  let out = root.toString();
  out = out.replace(/(<br\s*\/?>\s*)+$/i, '').replace(/&nbsp;/g, ' ');
  return out.trim();
}

export function textOf(html = '') {
  return parse(String(html), PARSE_OPTS).text.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Editable fields
// ---------------------------------------------------------------------------

const KEY_RE = /[^a-z0-9_\-]/g;
function cleanKey(k) { return String(k || '').toLowerCase().replace(KEY_RE, '-').replace(/^-+|-+$/g, '').slice(0, 48); }

function bgUrlOf(style = '') {
  const m = String(style).match(/background(?:-image)?\s*:[^;]*url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
  return m ? m[1] : '';
}
function setBgUrl(style = '', url) {
  const decl = `background-image:url("${String(url).replace(/"/g, '%22')}")`;
  const rest = String(style).split(';').map(s => s.trim()).filter(s => s && !/^background-image\s*:/i.test(s));
  return [...rest, decl].join(';');
}

/**
 * Read editable fields out of sanitised section HTML.
 * Elements opt in with data-f="key" (text / link / image by tag) or
 * data-f-bg="key" (a CSS background image). Keys are made unique per section.
 */
export function extractFields(html) {
  const root = parse(html, PARSE_OPTS);
  const fields = {};
  const used = new Set();
  const uniq = base => {
    let k = cleanKey(base) || 'field', n = 2;
    const stem = k;
    while (used.has(k)) k = `${stem}-${n++}`;
    used.add(k);
    return k;
  };
  for (const el of root.querySelectorAll('[data-f]')) {
    const tag = tagOf(el);
    const key = uniq(el.getAttribute('data-f'));
    el.setAttribute('data-f', key);
    const nested = el.querySelectorAll('[data-f], [data-f-bg]').length > 0;
    if (tag === 'img') {
      fields[key] = { type: 'image', src: el.getAttribute('src') || '', alt: el.getAttribute('alt') || '' };
    } else if (tag === 'a') {
      fields[key] = nested
        ? { type: 'link', href: el.getAttribute('href') || '', html: null }
        : { type: 'link', href: el.getAttribute('href') || '', html: sanitizeInline(el.innerHTML) };
    } else if (nested || ['input', 'select', 'textarea', 'iframe', 'video', 'svg', 'form', 'table', 'ul', 'ol'].includes(tag)) {
      // Containers are not text fields; their children carry the content.
      el.removeAttribute('data-f'); used.delete(key);
    } else {
      fields[key] = { type: 'text', html: sanitizeInline(el.innerHTML) };
    }
  }
  for (const el of root.querySelectorAll('[data-f-bg]')) {
    const key = uniq(el.getAttribute('data-f-bg'));
    el.setAttribute('data-f-bg', key);
    fields[key] = { type: 'bg', src: safeUrl(bgUrlOf(el.getAttribute('style') || ''), 'media') };
  }
  return { html: root.toString(), fields };
}

/** Inject current field values into a section template. */
export function applyFields(html, fields = {}) {
  if (!fields || !Object.keys(fields).length) return html;
  const root = parse(html, PARSE_OPTS);
  for (const el of root.querySelectorAll('[data-f]')) {
    const f = fields[el.getAttribute('data-f')];
    if (!f) continue;
    if (f.type === 'image') {
      if (f.src) el.setAttribute('src', f.src);
      el.setAttribute('alt', f.alt || '');
    } else if (f.type === 'link') {
      if (f.href != null) el.setAttribute('href', f.href || '#');
      if (f.html != null) el.set_content(f.html);
    } else if (f.type === 'text') {
      el.set_content(f.html || '');
    }
  }
  for (const el of root.querySelectorAll('[data-f-bg]')) {
    const f = fields[el.getAttribute('data-f-bg')];
    if (f?.src) el.setAttribute('style', setBgUrl(el.getAttribute('style') || '', f.src));
  }
  return root.toString();
}

/** Validate + sanitise one field value coming from an editor. Throws on a bad type. */
export function cleanFieldValue(existing, incoming) {
  if (!existing) throw new Error('Unknown field');
  const v = incoming || {};
  if (existing.type === 'text') return { type: 'text', html: sanitizeInline(v.html ?? '') };
  if (existing.type === 'image') {
    const src = safeUrl(v.src ?? existing.src, 'media');
    if (!src) throw new Error('That image address is not allowed');
    return { type: 'image', src, alt: String(v.alt ?? existing.alt ?? '').slice(0, 300) };
  }
  if (existing.type === 'bg') {
    const src = safeUrl(v.src ?? existing.src, 'media');
    if (!src) throw new Error('That image address is not allowed');
    return { type: 'bg', src };
  }
  if (existing.type === 'link') {
    const href = v.href != null ? safeUrl(v.href, 'link') : existing.href;
    if (v.href != null && v.href !== '' && !href) throw new Error('That link address is not allowed');
    return { type: 'link', href: href || '#', html: existing.html == null ? null : sanitizeInline(v.html ?? existing.html) };
  }
  throw new Error('Unknown field type');
}

// ---------------------------------------------------------------------------
// Repeating items (cards, list rows): marked with data-item inside a section.
// ---------------------------------------------------------------------------

export function listItems(html) {
  const root = parse(html, PARSE_OPTS);
  return root.querySelectorAll('[data-item]').map((el, i) => ({ index: i, text: el.text.replace(/\s+/g, ' ').trim().slice(0, 80) }));
}

/**
 * Structural edit of a repeating item. op: 'duplicate' | 'remove' | 'up' | 'down'.
 * Returns the new { html, fields } (duplicated items get fresh field keys).
 */
export function editItem(html, fields, index, op) {
  const root = parse(html, PARSE_OPTS);
  const items = root.querySelectorAll('[data-item]');
  const el = items[index];
  if (!el) throw new Error('Item not found');
  const siblings = items.filter(x => x.parentNode === el.parentNode);
  const pos = siblings.indexOf(el);
  const next = { ...fields };
  if (op === 'remove') {
    if (siblings.length <= 1) throw new Error('A list needs at least one item');
    for (const f of [el, ...el.querySelectorAll('[data-f], [data-f-bg]')]) {
      const k = f.getAttribute?.('data-f') || f.getAttribute?.('data-f-bg');
      if (k) delete next[k];
    }
    el.remove();
  } else if (op === 'duplicate') {
    if (siblings.length >= 24) throw new Error('This list is full');
    const clone = parse(el.toString(), PARSE_OPTS).firstChild;
    const used = new Set(Object.keys(next));
    for (const f of [clone, ...clone.querySelectorAll('[data-f], [data-f-bg]')]) {
      for (const attr of ['data-f', 'data-f-bg']) {
        const k = f.getAttribute?.(attr);
        if (!k) continue;
        let nk = k.replace(/-\d+$/, ''), n = 2;
        const stem = nk;
        nk = `${stem}-${n}`;
        while (used.has(nk)) nk = `${stem}-${++n}`;
        used.add(nk);
        f.setAttribute(attr, nk);
        if (next[k]) next[nk] = JSON.parse(JSON.stringify(next[k]));
      }
    }
    el.after(clone);
  } else if (op === 'up' || op === 'down') {
    const other = siblings[pos + (op === 'up' ? -1 : 1)];
    if (!other) return { html, fields };
    if (op === 'up') other.before(el); else other.after(el);
  } else {
    throw new Error('Unknown item operation');
  }
  return { html: root.toString(), fields: next };
}

// ---------------------------------------------------------------------------
// Document-level helpers used by the renderer and QA
// ---------------------------------------------------------------------------

export function parseFragment(html) { return parse(html, PARSE_OPTS); }

/** Rewrite root-relative links ("/about/") to live under `base`. */
export function rebaseLinks(html, base) {
  if (!base || base === '/') return html;
  const root = parse(html, PARSE_OPTS);
  for (const a of root.querySelectorAll('a[href]')) {
    const h = a.getAttribute('href');
    if (h && h.startsWith('/') && !h.startsWith('//')) a.setAttribute('href', base + h.slice(1));
  }
  return root.toString();
}

// ---------------------------------------------------------------------------
// Auto-annotation: guarantee editability even when markup arrives without
// data-f markers (a model forgot some, or a classic site is being converted).
// ---------------------------------------------------------------------------

const TEXT_HOSTS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote', 'figcaption', 'dt', 'dd', 'td', 'th', 'summary', 'label', 'small', 'span', 'strong', 'em', 'cite', 'time', 'address', 'legend', 'caption']);
const INLINE_ONLY = new Set(['b', 'strong', 'i', 'em', 'u', 'br', 'span', 'small', 'sup', 'sub', 'mark', 'a', 's', 'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'ellipse', 'use', 'defs', 'title']);

function onlyInlineChildren(el) {
  for (const c of el.childNodes) {
    if (c.nodeType !== 1) continue;
    const t = tagOf(c);
    if (!INLINE_ONLY.has(t)) return false;
    if (!onlyInlineChildren(c)) return false;
  }
  return true;
}
function hasOwnText(el) {
  return el.childNodes.some(c => c.nodeType === 3 && c.rawText.trim().length > 0) || (el.childNodes.length > 0 && el.text.trim().length > 0 && onlyInlineChildren(el));
}
function insideSkipped(el, root) {
  for (let n = el.parentNode; n && n !== root; n = n.parentNode) {
    if (n.nodeType !== 1) continue;
    const t = tagOf(n);
    if (n.getAttribute('data-f') != null && t !== 'a') return true;       // already inside a text field
    if (n.getAttribute('data-nav') != null || n.getAttribute('data-no-edit') != null) return true;
    if (t === 'svg' || t === 'select' || t === 'textarea' || t === 'button' && false) return true;
  }
  return false;
}

/**
 * Add data-f markers to un-marked headings, paragraphs, list items, links,
 * buttons and images. Returns { html, added }.
 */
export function autoAnnotate(html, prefix = 'f') {
  const root = parse(html, PARSE_OPTS);
  const used = new Set(root.querySelectorAll('[data-f]').map(e => e.getAttribute('data-f')));
  for (const e of root.querySelectorAll('[data-f-bg]')) used.add(e.getAttribute('data-f-bg'));
  let n = 0, added = 0;
  const next = stem => { let k; do { k = `${stem}${++n}`; } while (used.has(k)); used.add(k); return k; };
  const visit = el => {
    for (const child of el.childNodes) {
      if (child.nodeType !== 1) continue;
      const tag = tagOf(child);
      if (tag === 'svg' || tag === 'iframe' || tag === 'select' || tag === 'textarea' || tag === 'input' || tag === 'video') continue;
      if (child.getAttribute('data-nav') != null || child.getAttribute('data-no-edit') != null) continue;
      const marked = child.getAttribute('data-f') != null;
      if (marked && tag !== 'a') continue;                      // an existing text field owns its subtree
      if (!marked) {
        if (tag === 'img') {
          if (child.getAttribute('src') !== LOGO_TOKEN) { child.setAttribute('data-f', next(prefix + 'img')); added++; }
          continue;
        }
        if (tag === 'a' || tag === 'button') {
          const isNavItem = child.getAttribute('data-nav-item') != null || child.getAttribute('data-nav-toggle') != null;
          if (!isNavItem && (tag === 'a' || hasOwnText(child))) {
            if (onlyInlineChildren(child) && child.text.trim()) { child.setAttribute('data-f', next(prefix + (tag === 'a' ? 'link' : 'btn'))); added++; continue; }
            if (tag === 'a') { child.setAttribute('data-f', next(prefix + 'link')); added++; }
          } else continue;
        } else if (TEXT_HOSTS.has(tag) && child.text.trim() && onlyInlineChildren(child)) {
          // A text host whose only content is a link/button is left to that element.
          const els = child.childNodes.filter(c => c.nodeType === 1);
          const soleLink = els.length === 1 && tagOf(els[0]) === 'a' && child.childNodes.every(c => c.nodeType === 1 || !c.rawText.trim());
          if (!soleLink) { child.setAttribute('data-f', next(prefix + 't')); added++; continue; }
        } else if (tag === 'div' && child.childNodes.length && child.childNodes.every(c => c.nodeType === 3) && child.text.trim()) {
          child.setAttribute('data-f', next(prefix + 't')); added++; continue;
        }
      }
      visit(child);
    }
  };
  visit(root);
  return { html: root.toString(), added };
}
