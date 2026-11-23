// Deterministic renderer: SiteDoc → static files.
//
// The same function produces the public preview, the live deployment, the
// admin draft preview and the visual editor's canvas, so what a customer edits
// is exactly what gets published.
import { applyFields, escapeHtml as esc, parseFragment, sanitizeCss, LOGO_TOKEN } from './html.js';
import { FOUNDATION_CSS, FOUNDATION_PRIMITIVES_CSS, RUNTIME_JS, tokensCss, fontsHref, sectionOptionClasses, normalizeTokens } from './foundation.js';
import { isLegacyDoc, livePages, navPages, pagePath, homePage } from './schema.js';

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** The single stylesheet for a site: foundation layer, tokens, design CSS, page CSS. */
export function buildSiteCss(doc) {
  const foundation = doc.settings?.foundation === 'primitives' ? FOUNDATION_PRIMITIVES_CSS : FOUNDATION_CSS;
  const parts = [foundation, tokensCss(doc.design?.tokens), sanitizeCss(doc.design?.css || '')];
  for (const p of livePages(doc)) if (p.css) parts.push(sanitizeCss(p.css));
  return parts.filter(Boolean).join('\n');
}

function fillNav(root, doc, page, ctx) {
  const pages = navPages(doc).filter(p => ctx.includeDrafts || p.status === 'published');
  for (const container of root.querySelectorAll('[data-nav]')) {
    const item = container.querySelector('[data-nav-item]');
    if (!item) {
      container.set_content(pages.map(p => `<a href="${esc(pagePath(p))}"${p.id === page?.id ? ' aria-current="page" class="is-active"' : ''}>${esc(p.navLabel)}</a>`).join(''));
      continue;
    }
    // The repeating unit is the direct child of the container that holds the item.
    let unit = item;
    while (unit.parentNode && unit.parentNode !== container) unit = unit.parentNode;
    const template = unit.toString();
    const html = pages.map(p => {
      const frag = parseFragment(template);
      const a = frag.querySelector('[data-nav-item]');
      a.setAttribute('href', pagePath(p));
      const label = a.querySelector('[data-nav-label]') || a;
      label.set_content(esc(p.navLabel));
      if (p.id === page?.id) {
        a.setAttribute('aria-current', 'page');
        a.setAttribute('class', ((a.getAttribute('class') || '') + ' is-active').trim());
      } else a.removeAttribute('aria-current');
      return frag.toString();
    }).join('');
    for (const child of [...container.childNodes]) {
      if (child.nodeType === 1 && (child === unit || child.querySelector?.('[data-nav-item]') || child.getAttribute?.('data-nav-item') != null)) child.remove();
    }
    container.insertAdjacentHTML('afterbegin', html);
  }
}

/** Add attributes to the root element of a fragment (used for un-wrapped classic sections). */
function tagRoot(root, attrs) {
  const el = root.childNodes.find(n => n.nodeType === 1);
  if (!el) return root.toString();
  for (const [k, v] of Object.entries(attrs)) if (v != null && el.getAttribute(k) == null) el.setAttribute(k, v);
  return root.toString();
}

function renderChrome(kind, doc, page, ctx) {
  const chrome = doc.design?.[kind] || { html: '', fields: {} };
  const root = parseFragment(applyFields(chrome.html || '', chrome.fields));
  fillNav(root, doc, page, ctx);
  const logo = doc.settings?.logo;
  if (!logo) {
    for (const img of root.querySelectorAll('img')) {
      if (img.getAttribute('src') === LOGO_TOKEN) img.replaceWith(parseFragment(`<span class="w-brand-text">${esc(doc.meta?.businessName || '')}</span>`));
    }
  }
  if (chrome.raw) return tagRoot(root, { 'data-chrome': kind, ...(kind === 'header' ? { 'data-header': '' } : {}) });
  const cls = [kind === 'header' ? 'w-header' : 'w-footer', chrome.className].filter(Boolean).join(' ');
  const tag = kind === 'header' ? 'header' : 'footer';
  const attrs = kind === 'header' ? ' data-header' : '';
  return `<${tag} class="${esc(cls)}"${attrs} data-chrome="${kind}">${root.toString()}</${tag}>`;
}

function renderSection(sec, ctx) {
  if (sec.hidden && !ctx.editMode) return '';
  let inner;
  if (sec.integration) {
    inner = ctx.renderIntegration ? ctx.renderIntegration(sec) : '';
    if (!inner) {
      if (!ctx.editMode) return '';
      inner = `<div class="w-container"><div class="w-card" style="text-align:center"><p class="w-muted" style="margin:0">${esc(sec.name)} — connect this integration to show it on your site.</p></div></div>`;
    }
  } else {
    inner = applyFields(sec.html, sec.fields);
  }
  if (sec.raw) {
    return tagRoot(parseFragment(inner), { 'data-section': sec.id, ...(ctx.editMode ? { 'data-section-name': sec.name, 'data-raw': '1', ...(sec.hidden ? { 'data-hidden': '1' } : {}) } : {}) });
  }
  const cls = ['w-section', 's-' + sec.type, sec.className, ...sectionOptionClasses(sec.options)].filter(Boolean).join(' ');
  const edit = ctx.editMode ? ` data-section-name="${esc(sec.name)}"${sec.hidden ? ' data-hidden="1"' : ''}${sec.integration ? ' data-integration="1"' : ''}${sec.locked ? ' data-locked="1"' : ''}` : '';
  return `<section id="${esc(sec.id)}" class="${esc(cls)}" data-section="${esc(sec.id)}"${edit}>${inner}</section>`;
}

function jsonLd(doc, ctx) {
  const b = doc.brief?.business || {};
  if (!b.name && !doc.meta?.businessName) return '';
  const data = { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: b.name || doc.meta.businessName };
  if (b.phone) data.telephone = b.phone;
  if (b.email) data.email = b.email;
  if (b.address) data.address = b.address;
  if (b.description) data.description = String(b.description).slice(0, 300);
  if (ctx.canonicalOrigin) data.url = ctx.canonicalOrigin + '/';
  // "<" is escaped so the JSON can never close its own script element.
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

function pageTitle(doc, page) {
  if (page.seo?.title) return page.seo.title;
  const name = doc.meta?.businessName || '';
  return page.slug === '' ? name : `${page.title} | ${name}`;
}

/** Render one page to a complete HTML document. */
export function renderPageHtml(doc, page, ctx = {}) {
  const base = ctx.base || '/';
  const tokens = normalizeTokens(doc.design?.tokens);
  const header = renderChrome('header', doc, page, ctx);
  const footer = renderChrome('footer', doc, page, ctx);
  const sections = page.sections.map(s => renderSection(s, ctx)).join('\n');

  // One parse of the assembled body: rebase links, harden forms, swap the logo token.
  const root = parseFragment(`${header}<main id="main">${sections}</main>${footer}`);
  for (const a of root.querySelectorAll('a[href]')) {
    const h = a.getAttribute('href');
    if (base !== '/' && h && h.startsWith('/') && !h.startsWith('//')) {
      let next = base + h.slice(1);
      // The platform's own preview URLs have no trailing slash (avoids a redirect per click).
      if (ctx.stripTrailingSlash) next = next.replace(/\/(?=[?#]|$)/, '');
      a.setAttribute('href', next);
    }
  }
  for (const form of root.querySelectorAll('form[data-form]')) {
    form.insertAdjacentHTML('beforeend', '<input class="w-hp" type="text" name="company_website" tabindex="-1" autocomplete="off" aria-hidden="true">');
  }
  let body = root.toString();
  if (doc.settings?.logo) body = body.split(LOGO_TOKEN).join(esc(doc.settings.logo));

  const title = pageTitle(doc, page);
  const desc = page.seo?.description || doc.brief?.summary || '';
  const path = pagePath(page);
  const canonical = ctx.canonicalOrigin ? ctx.canonicalOrigin + path : '';
  const noindex = ctx.noindex || page.seo?.noindex;
  const favicon = doc.settings?.favicon || doc.settings?.logo || '';
  const css = ctx.inlineAssets ? `<style>${buildSiteCss(doc).replace(/<\/style/gi, '')}</style>` : `<link rel="stylesheet" href="${esc(base)}assets/site.css?v=${ctx.assetVersion || '1'}">`;
  const head = ctx.integrations?.head?.join('\n') || '';
  const bodyEnd = ctx.integrations?.bodyEnd?.join('\n') || '';
  const legacyScript = doc.settings?.legacyScript && !ctx.editMode ? `<script>${doc.settings.legacyScript.replace(/<\/script/gi, '<\\/script')}</script>` : '';
  const runtime = ctx.editMode ? '' : (ctx.inlineAssets ? `<script>${RUNTIME_JS}</script>` : `<script src="${esc(base)}assets/site.js?v=${ctx.assetVersion || '1'}" defer></script>`);
  const htmlAttrs = [
    `lang="${esc(doc.meta?.lang || 'en')}"`,
    `data-motion="${esc(tokens.motion)}"`,
    ctx.origin && ctx.siteId && !ctx.editMode ? `data-forms="${esc(ctx.origin)}/api/forms/${esc(ctx.siteId)}"` : '',
    ctx.origin && ctx.siteId && ctx.track ? `data-track="${esc(ctx.origin)}/api/t/${esc(ctx.siteId)}"` : '',
    `data-page="${esc(path)}"`,
    ...Object.entries(ctx.integrations?.attrs || {}).filter(([k, v]) => /^data-[a-z]+$/.test(k) && /^[\w\-/.]{1,80}$/.test(String(v))).map(([k, v]) => `${k}="${esc(v)}"`)
  ].filter(Boolean).join(' ');

  return `<!doctype html>
<html ${htmlAttrs}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${desc ? `<meta name="description" content="${esc(String(desc).slice(0, 320))}">` : ''}
${noindex ? '<meta name="robots" content="noindex">' : ''}
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta property="og:title" content="${esc(title)}">
${desc ? `<meta property="og:description" content="${esc(String(desc).slice(0, 320))}">` : ''}
<meta property="og:type" content="website">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ''}
${favicon ? `<link rel="icon" href="${esc(favicon)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${doc.settings?.foundation === 'primitives' ? '' : `<link rel="stylesheet" href="${esc(fontsHref(tokens))}">`}
${doc.settings?.extraFonts && /^https:\/\/fonts\.googleapis\.com\/css2?\?[\w\-+:;,@&=.%]+$/.test(doc.settings.extraFonts) ? `<link rel="stylesheet" href="${esc(doc.settings.extraFonts)}">` : ''}
${css}
${page.slug === '' ? jsonLd(doc, ctx) : ''}
${head}
${ctx.editorHead || ''}
</head>
<body class="page-${esc(page.slug ? page.slug.replace(/\//g, '-') : 'home')} type-${esc(page.type)}${doc.settings?.bodyClass ? ' ' + esc(doc.settings.bodyClass) : ''}">
<a class="w-skip" href="#main">Skip to content</a>
${body}
${bodyEnd}
${runtime}
${legacyScript}
${ctx.editorScript || ''}
</body>
</html>`;
}

function notFoundHtml(doc, ctx) {
  const page = { id: '_404', slug: '404', title: 'Page not found', type: 'standard', seo: { title: 'Page not found', noindex: true }, sections: [{
    id: 'nf', type: 'notfound', name: 'Not found', className: '', options: { align: 'center' }, fields: {},
    html: `<div class="w-container"><p class="w-eyebrow">404</p><h1 class="w-h1">We couldn't find that page</h1><p class="w-lead">It may have moved. Head back to the home page to find what you need.</p><div class="w-actions"><a class="w-btn w-btn--primary" href="/">Back to home</a></div></div>`
  }] };
  return renderPageHtml(doc, page, { ...ctx, noindex: true });
}

/**
 * Render a whole site.
 * @returns {{ files: Array<{path, content, contentType}>, pages: Array<{id, path, file}>, legacy: boolean }}
 */
export function renderSite(doc, ctx = {}) {
  if (isLegacyDoc(doc)) {
    return { legacy: true, pages: [{ id: 'legacy', path: '/', file: 'index.html' }], files: [{ path: 'index.html', content: doc.html, contentType: 'text/html; charset=utf-8' }] };
  }
  const css = buildSiteCss(doc);
  const assetVersion = hash(css + RUNTIME_JS);
  const c = { ...ctx, assetVersion };
  const files = [];
  const pages = [];
  const list = livePages(doc).filter(p => c.includeDrafts || p.status === 'published');
  for (const page of list) {
    const file = page.slug ? `${page.slug}/index.html` : 'index.html';
    files.push({ path: file, content: renderPageHtml(doc, page, c), contentType: 'text/html; charset=utf-8' });
    pages.push({ id: page.id, path: pagePath(page), file });
  }
  if (!c.inlineAssets) {
    files.push({ path: 'assets/site.css', content: css, contentType: 'text/css; charset=utf-8' });
    files.push({ path: 'assets/site.js', content: RUNTIME_JS, contentType: 'text/javascript; charset=utf-8' });
  }
  files.push({ path: '404.html', content: notFoundHtml(doc, c), contentType: 'text/html; charset=utf-8' });
  const origin = c.canonicalOrigin || '';
  if (origin) {
    const urls = list.filter(p => !p.seo?.noindex).map(p => `<url><loc>${esc(origin + pagePath(p))}</loc></url>`).join('');
    files.push({ path: 'sitemap.xml', content: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, contentType: 'application/xml; charset=utf-8' });
    files.push({ path: 'robots.txt', content: c.noindex ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`, contentType: 'text/plain; charset=utf-8' });
  }
  files.push({ path: '_site.json', content: JSON.stringify({ redirects: doc.redirects || [], pages: pages.map(p => p.path) }), contentType: 'application/json' });
  return { legacy: false, files, pages };
}

/** vercel.json for a deployed site (trailing slashes + approved redirects). */
export function vercelConfig(doc) {
  return JSON.stringify({
    cleanUrls: false,
    trailingSlash: true,
    redirects: (doc.redirects || []).map(r => ({ source: r.from.replace(/\/$/, '') || '/', destination: r.to, permanent: true })),
    headers: [{ source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }]
  }, null, 2);
}

/**
 * Content-Security-Policy for a rendered (structured) page. Scripts may only
 * come from the site itself plus hosts declared by connected integrations.
 */
export function contentSecurityPolicy({ scriptHosts = [], frameHosts = [], connectHosts = [], relaxed = false, legacyScript = false } = {}) {
  if (legacyScript) return ''; // converted classic sites keep their original inline script
  const uniq = a => [...new Set(a)].join(' ');
  // A live-chat widget pulls styles, frames and sockets from many of its own
  // hosts. For sites that switch one on, https sources are allowed, but inline
  // script and eval stay blocked.
  if (relaxed) {
    return [
      `default-src 'none'`, `script-src 'self' https:`, `style-src 'self' 'unsafe-inline' https:`, `font-src https: data:`, `img-src https: data: blob:`,
      `media-src https:`, `frame-src https:`, `connect-src 'self' https: wss:`, `form-action 'self'`, `base-uri 'none'`
    ].join('; ');
  }
  return [
    `default-src 'none'`,
    `script-src 'self' ${uniq(scriptHosts)}`.trim(),
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src https://fonts.gstatic.com data:`,
    `img-src https: data:`,
    `media-src https:`,
    `frame-src https://www.google.com https://maps.google.com https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://calendly.com https://cal.com https://app.cal.com https://form.jotform.com ${uniq(frameHosts)}`.trim(),
    `connect-src 'self' https: ${uniq(connectHosts)}`.trim(),
    `form-action 'self'`,
    `base-uri 'none'`
  ].join('; ');
}

export { homePage };
