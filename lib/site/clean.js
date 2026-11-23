// Ingestion + whole-document sanitising.
//
// Every write path (generation, admin edits, customer edits, upgrades,
// restores) passes the document through sanitizeDoc() before it is stored, and
// model output is turned into sections with ingestSection().
import { sanitizeHtml, sanitizeCss, sanitizeInline, extractFields, safeUrl, autoAnnotate } from './html.js';
import { normalizeDoc, normalizeSection, isLegacyDoc } from './schema.js';

export function cleanFields(fields = {}) {
  const out = {};
  for (const [key, f] of Object.entries(fields || {})) {
    if (!f || typeof f !== 'object' || !/^[a-z0-9_\-]{1,48}$/.test(key)) continue;
    if (f.type === 'text') out[key] = { type: 'text', html: sanitizeInline(f.html || '') };
    else if (f.type === 'image') out[key] = { type: 'image', src: safeUrl(f.src, 'media'), alt: String(f.alt || '').slice(0, 300) };
    else if (f.type === 'bg') out[key] = { type: 'bg', src: safeUrl(f.src, 'media') };
    else if (f.type === 'link') out[key] = { type: 'link', href: safeUrl(f.href, 'link') || '#', html: f.html == null ? null : sanitizeInline(f.html) };
  }
  return out;
}

/**
 * Turn raw section markup (from a model, a layout, or a conversion) into a
 * stored section: sanitised template + extracted editable fields.
 * Returns { section, removed } where `removed` lists stripped element types.
 */
export function ingestSection({ type = 'content', name = '', className = '', html = '', options, id, integration } = {}) {
  const clean = sanitizeHtml(html);
  // Anything a visitor can read should be editable, marked or not.
  const { html: template, fields } = extractFields(autoAnnotate(clean.html).html);
  const section = normalizeSection({ id, type, name: name || type, className, html: template, fields: cleanFields(fields), options, integration });
  return { section, removed: clean.removed };
}

/** Same for the header / footer templates. */
export function ingestChrome(html = '', className = '') {
  const clean = sanitizeHtml(html);
  const { html: template, fields } = extractFields(autoAnnotate(clean.html, 'c').html);
  return { chrome: { html: template, fields: cleanFields(fields), className: String(className || '').slice(0, 120) }, removed: clean.removed };
}

/** Defensive re-sanitise of a whole document (idempotent). */
export function sanitizeDoc(input) {
  if (isLegacyDoc(input)) return input;
  const doc = normalizeDoc(input);
  doc.design.css = sanitizeCss(doc.design.css);
  for (const k of ['header', 'footer']) {
    doc.design[k].html = sanitizeHtml(doc.design[k].html).html;
    doc.design[k].fields = cleanFields(doc.design[k].fields);
  }
  for (const p of doc.pages) {
    p.css = sanitizeCss(p.css);
    for (const s of p.sections) {
      s.html = sanitizeHtml(s.html).html;
      s.fields = cleanFields(s.fields);
    }
  }
  if (doc.settings.logo && !safeUrl(doc.settings.logo, 'media')) doc.settings.logo = '';
  if (doc.settings.favicon && !safeUrl(doc.settings.favicon, 'media')) doc.settings.favicon = '';
  return doc;
}
