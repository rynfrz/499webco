import { describe, it, expect } from 'vitest';
import { factsFromProject, missingFacts, basicBrief, primaryAction } from '@/lib/gen/brief';
import { proposeSitemap, buildTemplatePage, PAGE_TEMPLATES } from '@/lib/site/templates';
import { buildDemoSite, designFromDirection } from '@/lib/gen/demo';
import { defaultDirection, normalizeDirection, rerollDirection, describeDirection, DIMENSION_KEYS, directionPromptBlock, presetConfigFrom, applyPreset } from '@/lib/design/direction';
import { renderSite, renderPageHtml, buildSiteCss, contentSecurityPolicy } from '@/lib/site/render';
import { validateDoc, normalizeDoc, cleanSlug, rewriteInternalLinks, legacyDoc, outline } from '@/lib/site/schema';
import { sanitizeDoc } from '@/lib/site/clean';
import { normalizeTokens, contrastRatio, fontsHref, RUNTIME_JS, FOUNDATION_CSS } from '@/lib/site/foundation';
import { EDITOR_SCRIPT, EDITOR_CSS } from '@/lib/site/editorBridge';
import { parseFragment } from '@/lib/site/html';
import { sampleProject } from './fixtures';

function demo(over) {
  const project = sampleProject('p1', over);
  const facts = factsFromProject(project);
  const direction = normalizeDirection({ seed: 42 }, { businessType: facts.type, hasPhotos: true });
  const sitemap = proposeSitemap(facts);
  return { facts, direction, sitemap, doc: buildDemoSite({ facts, direction, sitemap }) };
}

describe('design direction engine', () => {
  it('resolves every dimension deterministically from a seed', () => {
    const a = normalizeDirection({ seed: 7 }, { businessType: 'Roofing' });
    const b = normalizeDirection({ seed: 7 }, { businessType: 'Roofing' });
    expect(a.choices).toEqual(b.choices);
    expect(Object.keys(a.choices).sort()).toEqual([...DIMENSION_KEYS].sort());
    expect(a.industry).toBe('Construction');
  });

  it('re-rolls unlocked dimensions and keeps locked ones', () => {
    const base = normalizeDirection({ seed: 1, locks: { typePairing: true, palette: true } }, {});
    let changed = 0;
    for (let i = 0; i < 12; i++) {
      const next = rerollDirection(base, {}, { seed: 1000 + i });
      expect(next.choices.typePairing).toBe(base.choices.typePairing);
      expect(next.choices.palette).toBe(base.choices.palette);
      if (next.choices.layout !== base.choices.layout || next.choices.motif !== base.choices.motif) changed++;
    }
    expect(changed).toBeGreaterThan(6);
  });

  it('honours preferences: dark mode, no animation, typography personality', () => {
    for (let s = 1; s <= 25; s++) {
      const d = normalizeDirection({ seed: s, prefs: { mode: 'dark', animation: 'none', typePersonality: 'slab' } }, {});
      const desc = Object.fromEntries(describeDirection(d).map(x => [x.key, x.id]));
      expect(['midnight-gold', 'carbon-lime', 'espresso-cream', 'ink-ember', 'deep-teal-rose']).toContain(desc.palette);
      expect(desc.interaction).toBe('static-precise');
      expect(['zilla-work', 'roboto-slab-roboto']).toContain(desc.typePairing);
    }
  });

  it('produces varied sites across seeds', () => {
    const combos = new Set();
    for (let s = 1; s <= 40; s++) combos.add(JSON.stringify(normalizeDirection({ seed: s }, { businessType: 'Roofing' }).choices));
    expect(combos.size).toBeGreaterThan(35);
  });

  it('puts the custom design prompt and structured choices into the prompt block', () => {
    const d = normalizeDirection({ seed: 3, customPrompt: 'Editorial typography, warm neutrals, avoid generic SaaS styling.', personalities: ['Editorial', 'Organic', 'NotARealOne'] }, {});
    expect(d.personalities).toEqual(['Editorial', 'Organic']);
    const block = directionPromptBlock(d, { logoColors: ['#112233'] });
    expect(block).toContain('avoid generic SaaS styling');
    expect(block).toContain('Typography pairing');
    expect(block).toContain('#112233');
  });

  it('saves and re-applies presets, keeping only locked properties when asked', () => {
    const d = normalizeDirection({ seed: 5, personalities: ['Luxury'], locks: { palette: true } }, {});
    const cfg = presetConfigFrom(d);
    expect(cfg.seed).toBeUndefined();
    const same = applyPreset(cfg, {}, { presetId: 'x', presetName: 'Lux' });
    expect(same.choices).toEqual(d.choices);
    const loose = applyPreset(cfg, {}, { keepChoices: false });
    expect(loose.choices.palette).toBe(d.choices.palette);
    expect(loose.presetName).toBeNull();
  });
});

describe('business facts', () => {
  it('reports missing facts instead of inventing them', () => {
    const p = sampleProject('p2');
    p.business.reviews = []; p.business.photos = []; p.business.phone = '';
    const f = factsFromProject(p);
    const keys = missingFacts(f).map(m => m.key);
    expect(keys).toEqual(expect.arrayContaining(['phone', 'reviews', 'photos', 'logo']));
    expect(basicBrief(f).missing.length).toBeGreaterThan(0);
    expect(primaryAction(f).kind).toBe('contact');
  });
});

describe('sitemap proposal', () => {
  it('proposes a genuinely multipage site from real material', () => {
    const { sitemap } = demo();
    expect(sitemap.map(p => p.type)).toEqual(['home', 'about', 'services', 'gallery', 'testimonials', 'faq', 'contact']);
    expect(sitemap[0].slug).toBe('');
  });
  it('does not create pages there is no material for, and respects a page limit', () => {
    const p = sampleProject('p3');
    p.business.reviews = []; p.business.photos = []; p.business.services = []; p.questionnaire.pages = [];
    expect(proposeSitemap(factsFromProject(p)).map(x => x.type)).toEqual(['home', 'about', 'contact']);
    const q = sampleProject('p4'); q.briefInput = { desiredPageCount: 4 };
    expect(proposeSitemap(factsFromProject(q))).toHaveLength(4);
  });
});

describe('rendering', () => {
  it('builds a valid multipage document whose pages share one design system', () => {
    const { doc } = demo();
    expect(validateDoc(doc)).toEqual({ ok: true, errors: [] });
    expect(doc.pages.length).toBe(7);
    const out = renderSite(doc, { base: '/', origin: 'https://499web.co', siteId: 's1' });
    const paths = out.files.map(f => f.path);
    expect(paths).toEqual(expect.arrayContaining(['index.html', 'about/index.html', 'services/index.html', 'contact/index.html', 'assets/site.css', 'assets/site.js', '404.html', '_site.json']));
    const htmlFiles = out.files.filter(f => f.path.endsWith('.html'));
    for (const f of htmlFiles) {
      expect(f.content).toContain('assets/site.css');       // one shared stylesheet
      expect(f.content).toContain('data-chrome="header"');   // shared header
      expect(f.content).toContain('data-chrome="footer"');
      expect(f.content).not.toMatch(/<script(?![^>]*(src="\/assets\/site\.js|application\/ld\+json))/); // only the runtime + JSON-LD
    }
    const css = out.files.find(f => f.path === 'assets/site.css').content;
    expect(css).toContain('--c-accent:');
    expect(css).toContain('@layer foundation');
  });

  it('keeps navigation in sync with the pages and marks the current page', () => {
    const { doc } = demo();
    const about = doc.pages.find(p => p.slug === 'about');
    const html = renderPageHtml(doc, about, { base: '/' });
    for (const p of doc.pages) expect(html).toContain(`href="${p.slug ? '/' + p.slug + '/' : '/'}"`);
    expect(html).toMatch(/href="\/about\/"[^>]*aria-current="page"/);
    // hide one page from the nav
    doc.pages.find(p => p.slug === 'faq').inNav = false;
    const html2 = renderPageHtml(doc, about, { base: '/' });
    expect(html2.match(/<nav class="w-nav"[\s\S]*?<\/nav>/)[0]).not.toContain('/faq/');
  });

  it('rebases every internal link for the preview channel', () => {
    const { doc } = demo();
    const html = renderSite(doc, { base: '/preview/summit-ridge-roofing/' }).files.find(f => f.path === 'index.html').content;
    expect(html).toContain('href="/preview/summit-ridge-roofing/services/"');
    expect(html).toContain('href="/preview/summit-ridge-roofing/assets/site.css');
    expect(html).not.toMatch(/href="\/(about|services|contact)\/"/);
    expect(html).toContain('href="tel:4045550142"');
  });

  it('uses real facts and never fabricates reviews', () => {
    const { doc } = demo();
    const all = renderSite(doc, {}).files.map(f => f.content).join('\n');
    expect(all).toContain('They fixed our leak the same day');
    const p = sampleProject('p5'); p.business.reviews = [];
    const f = factsFromProject(p);
    const d2 = buildDemoSite({ facts: f, direction: defaultDirection('Roofing'), sitemap: proposeSitemap(f) });
    const all2 = renderSite(d2, {}).files.map(x => x.content).join('\n');
    expect(all2).not.toMatch(/Local customer|Verified customer|★/);
    expect(d2.pages.some(pg => pg.type === 'testimonials')).toBe(false);
  });

  it('wires forms and analytics to the platform and adds a honeypot', () => {
    const { doc } = demo();
    const contact = renderPageHtml(doc, doc.pages.find(p => p.type === 'contact'), { base: '/', origin: 'https://499web.co', siteId: 'site_1', track: true });
    expect(contact).toContain('data-forms="https://499web.co/api/forms/site_1"');
    expect(contact).toContain('data-track="https://499web.co/api/t/site_1"');
    expect(contact).toContain('name="company_website"');
    expect(contact).toContain('data-form="contact"');
  });

  it('hidden sections and draft pages stay out of published output', () => {
    const { doc } = demo();
    const home = doc.pages[0];
    home.sections[1].hidden = true;
    doc.pages.find(p => p.slug === 'faq').status = 'draft';
    const out = renderSite(doc, {});
    expect(out.files.find(f => f.path === 'index.html').content).not.toContain(`id="${home.sections[1].id}"`);
    expect(out.files.some(f => f.path === 'faq/index.html')).toBe(false);
    expect(out.files.find(f => f.path === 'index.html').content).not.toContain('/faq/');
    const draft = renderSite(doc, { includeDrafts: true, editMode: true });
    expect(draft.files.some(f => f.path === 'faq/index.html')).toBe(true);
    expect(draft.files.find(f => f.path === 'index.html').content).toContain('data-hidden="1"');
  });

  it('writes sitemap.xml, robots.txt and redirects for a live domain', () => {
    const { doc } = demo();
    doc.redirects = [{ from: '/old-services/', to: '/services/' }];
    const out = renderSite(doc, { canonicalOrigin: 'https://summitridge.test' });
    expect(out.files.find(f => f.path === 'sitemap.xml').content).toContain('<loc>https://summitridge.test/services/</loc>');
    expect(out.files.find(f => f.path === 'robots.txt').content).toContain('Sitemap: https://summitridge.test/sitemap.xml');
    expect(JSON.parse(out.files.find(f => f.path === '_site.json').content).redirects).toHaveLength(1);
    expect(out.files.find(f => f.path === 'index.html').content).toContain('<link rel="canonical" href="https://summitridge.test/">');
  });

  it('renders a legacy single-page site unchanged', () => {
    const out = renderSite(legacyDoc('<!doctype html><html><body>old</body></html>'), {});
    expect(out.legacy).toBe(true);
    expect(out.files).toHaveLength(1);
    expect(out.files[0].content).toContain('old');
    expect(outline(legacyDoc('x')).legacy).toBe(true);
  });

  it('escapes business data everywhere (no HTML injection through facts)', () => {
    const p = sampleProject('p6');
    p.business.name = 'Bob\'s <script>alert(1)</script> "Roofing"';
    p.business.tagline = '<img src=x onerror=alert(1)>';
    const f = factsFromProject(p);
    const d = buildDemoSite({ facts: f, direction: defaultDirection('Roofing'), sitemap: proposeSitemap(f) });
    const all = renderSite(d, {}).files.filter(x => x.path.endsWith('.html')).map(x => x.content).join('\n');
    // Parse the output: the injected text must never become an element or a handler.
    const root = parseFragment(all);
    expect(root.querySelectorAll('script').filter(s => !/site\.js/.test(s.getAttribute('src') || '') && s.getAttribute('type') !== 'application/ld+json')).toHaveLength(0);
    expect(root.querySelectorAll('img').filter(i => i.getAttribute('onerror') != null || i.getAttribute('src') === 'x')).toHaveLength(0);
    expect(all).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('sanitizeDoc is idempotent and strips anything unsafe added later', () => {
    const { doc } = demo();
    const once = sanitizeDoc(doc);
    expect(sanitizeDoc(once)).toEqual(once);
    once.pages[0].sections[0].html += '<script>bad()</script><a href="javascript:x">y</a>';
    once.design.css += '@import url(https://evil.example/x.css);';
    const clean = sanitizeDoc(once);
    expect(JSON.stringify(clean)).not.toMatch(/bad\(\)|javascript:x|@import/);
  });
});

describe('tokens', () => {
  it('rejects invalid token values and keeps buttons readable', () => {
    const t = normalizeTokens({ colors: { accent: 'red; } body{display:none', bg: '#fff', onAccent: '#ffffff' }, fonts: { head: 'Bad"Font;}' }, radius: { base: 'calc(1px)' } });
    expect(t.colors.accent).toBe('#1f4fe0');
    expect(t.fonts.head).toBe('Fraunces');
    expect(t.radius.base).toBe('10px');
    const y = normalizeTokens({ colors: { accent: '#ffe600', onAccent: '#ffffff' } });
    expect(contrastRatio(y.colors.accent, y.colors.onAccent)).toBeGreaterThan(3);
    expect(fontsHref(y)).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?family=Fraunces/);
  });
  it('derives distinct design CSS from different directions', () => {
    const a = designFromDirection(normalizeDirection({ seed: 1 }, {}));
    const b = designFromDirection(normalizeDirection({ seed: 2 }, {}));
    expect(a.css === b.css && JSON.stringify(a.tokens) === JSON.stringify(b.tokens)).toBe(false);
  });
});

describe('slugs and links', () => {
  it('validates page addresses', () => {
    expect(cleanSlug('Commercial Roof Repair!')).toBe('commercial-roof-repair');
    expect(cleanSlug('services/Roof Repair')).toBe('services/roof-repair');
    expect(() => cleanSlug('assets')).toThrow();
    expect(() => cleanSlug('   ')).toThrow();
    expect(() => cleanSlug('a/b/c')).toThrow();
  });
  it('rewrites internal links when a page address changes', () => {
    const { doc } = demo();
    const n = rewriteInternalLinks(doc, '/services/', '/what-we-do/');
    expect(n).toBeGreaterThan(0);
    const all = JSON.stringify(doc.pages.map(p => p.sections.map(s => s.fields)));
    expect(all).not.toContain('"/services/"');
  });
  it('builds a content security policy without inline script permission', () => {
    const csp = contentSecurityPolicy({ scriptHosts: ['https://assets.calendly.com'] });
    expect(csp).toContain("script-src 'self' https://assets.calendly.com");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("default-src 'none'");
  });
});

describe('shipped scripts and styles', () => {
  it('the site runtime and the editor bridge are valid JavaScript', () => {
    expect(() => new Function(RUNTIME_JS)).not.toThrow();
    expect(() => new Function(EDITOR_SCRIPT)).not.toThrow();
  });
  it('the runtime only loads third-party tools from fixed hosts with validated ids', () => {
    const hosts = [...RUNTIME_JS.matchAll(/https:\/\/[a-z0-9.\-]+/g)].map(m => m[0]);
    expect(new Set(hosts)).toEqual(new Set(['https://www.googletagmanager.com', 'https://connect.facebook.net', 'https://embed.tawk.to', 'https://client.crisp.chat']));
    expect(RUNTIME_JS).not.toMatch(/eval\(|new Function|innerHTML\s*=/);
  });
  it('stylesheets have balanced braces', () => {
    for (const css of [FOUNDATION_CSS, EDITOR_CSS]) expect((css.match(/{/g) || []).length).toBe((css.match(/}/g) || []).length);
  });
});
