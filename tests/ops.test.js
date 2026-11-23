import { describe, it, expect } from 'vitest';
import { applyOps, OpError } from '@/lib/site/ops';
import { factsFromProject } from '@/lib/gen/brief';
import { proposeSitemap } from '@/lib/site/templates';
import { buildDemoSite } from '@/lib/gen/demo';
import { normalizeDirection } from '@/lib/design/direction';
import { sanitizeDoc } from '@/lib/site/clean';
import { validateDoc, legacyDoc, livePages } from '@/lib/site/schema';
import { renderSite } from '@/lib/site/render';
import { sampleProject } from './fixtures';

function setup() {
  const facts = factsFromProject(sampleProject('p1'));
  const doc = buildDemoSite({ facts, direction: normalizeDirection({ seed: 9 }, {}), sitemap: proposeSitemap(facts) });
  return { facts, doc, staff: { role: 'staff', facts }, owner: { role: 'owner', facts } };
}
const run = (doc, ctx, ...ops) => applyOps(doc, ops, ctx);

describe('content edits', () => {
  it('changes text, links and images through fields only', () => {
    const { doc, owner } = setup();
    const home = doc.pages[0], hero = home.sections[0];
    const before = hero.html;
    run(doc, owner,
      { op: 'field.set', pageId: home.id, sectionId: hero.id, key: 'title', value: { html: 'Roofs done <em>properly</em><script>x()</script>' } },
      { op: 'field.set', pageId: home.id, sectionId: hero.id, key: 'cta', value: { href: '/contact/', html: 'Book an inspection' } },
      { op: 'field.set', pageId: home.id, sectionId: hero.id, key: 'image', value: { src: 'https://img.example.test/new.jpg', alt: 'New roof' } },
      { op: 'field.set', pageId: 'header', key: 'navcta', value: { href: 'tel:+14045550199', html: 'Call us' } });
    expect(hero.html).toBe(before);                                  // template untouched
    expect(hero.fields.title.html).toBe('Roofs done <em>properly</em>');
    const html = renderSite(sanitizeDoc(doc), {}).files.find(f => f.path === 'index.html').content;
    expect(html).toContain('Roofs done <em>properly</em>');
    expect(html).toContain('Book an inspection');
    expect(html).toContain('https://img.example.test/new.jpg');
    expect(html).toContain('href="tel:+14045550199"');
    expect(html).not.toContain('x()');
  });

  it('rejects unsafe values and unknown fields', () => {
    const { doc, owner } = setup();
    const home = doc.pages[0], hero = home.sections[0];
    expect(() => run(doc, owner, { op: 'field.set', pageId: home.id, sectionId: hero.id, key: 'cta', value: { href: 'javascript:alert(1)' } })).toThrow(OpError);
    expect(() => run(doc, owner, { op: 'field.set', pageId: home.id, sectionId: hero.id, key: 'nope', value: { html: 'x' } })).toThrow(/no longer exists/);
    expect(() => run(doc, owner, { op: 'field.set', pageId: 'missing', sectionId: hero.id, key: 'title', value: { html: 'x' } })).toThrow();
  });
});

describe('sections', () => {
  it('reorders, hides, restyles, adds, duplicates and removes', () => {
    const { doc, owner } = setup();
    const home = doc.pages[0];
    const ids = home.sections.map(s => s.id);
    run(doc, owner, { op: 'section.move', pageId: home.id, sectionId: ids[1], dir: 'down' });
    expect(home.sections.map(s => s.id).slice(0, 3)).toEqual([ids[0], ids[2], ids[1]]);
    run(doc, owner, { op: 'section.hide', pageId: home.id, sectionId: ids[1], hidden: true }, { op: 'section.options', pageId: home.id, sectionId: ids[2], options: { tone: 'dark', spacing: 'tight' } });
    expect(home.sections.find(s => s.id === ids[1]).hidden).toBe(true);
    expect(home.sections.find(s => s.id === ids[2]).options).toMatchObject({ tone: 'dark', spacing: 'tight' });
    const r = run(doc, owner, { op: 'section.add', pageId: home.id, template: 'faq', afterSectionId: ids[0] });
    expect(home.sections[1].id).toBe(r.results[0].sectionId);
    expect(home.sections[1].type).toBe('faq');
    run(doc, owner, { op: 'section.duplicate', pageId: home.id, sectionId: ids[0] });
    expect(home.sections[1].fields).toEqual(home.sections[0].fields);
    const n = home.sections.length;
    run(doc, owner, { op: 'section.remove', pageId: home.id, sectionId: home.sections[1].id });
    expect(home.sections).toHaveLength(n - 1);
    expect(() => run(doc, owner, { op: 'section.options', pageId: home.id, sectionId: ids[0], options: { tone: 'rainbow' } })).toThrow();
    expect(() => run(doc, owner, { op: 'section.add', pageId: home.id, template: '../../etc' })).toThrow();
    expect(validateDoc(sanitizeDoc(doc)).ok).toBe(true);
  });

  it('keeps at least one visible section and edits repeating items', () => {
    const { doc, owner } = setup();
    const contact = doc.pages.find(p => p.type === 'contact');
    for (const s of contact.sections.slice(1)) run(doc, owner, { op: 'section.hide', pageId: contact.id, sectionId: s.id, hidden: true });
    expect(() => run(doc, owner, { op: 'section.hide', pageId: contact.id, sectionId: contact.sections[0].id, hidden: true })).toThrow(/at least one/);
    const home = doc.pages[0];
    const cards = home.sections.find(s => s.type === 'services');
    const count = Object.keys(cards.fields).length;
    run(doc, owner, { op: 'item.edit', pageId: home.id, sectionId: cards.id, index: 0, action: 'duplicate' });
    expect(Object.keys(cards.fields).length).toBeGreaterThan(count);
  });
});

describe('pages', () => {
  it('adds a template page as a draft that matches the site and is not public yet', () => {
    const { doc, owner } = setup();
    const r = run(doc, owner, { op: 'page.add', type: 'service', title: 'Commercial Roof Repair' });
    const page = doc.pages.find(p => p.id === r.results[0].pageId);
    expect(page).toMatchObject({ slug: 'commercial-roof-repair', status: 'draft', createdBy: 'customer', type: 'service' });
    expect(page.sections.length).toBeGreaterThan(1);
    const clean = sanitizeDoc(doc);
    expect(renderSite(clean, {}).files.some(f => f.path === 'commercial-roof-repair/index.html')).toBe(false);
    run(clean, owner, { op: 'page.update', pageId: page.id, status: 'published' });
    const out = renderSite(clean, {});
    const html = out.files.find(f => f.path === 'commercial-roof-repair/index.html').content;
    expect(html).toContain('assets/site.css');                        // same stylesheet
    expect(html).toContain('data-chrome="header"');                   // same header + footer
    expect(out.files.find(f => f.path === 'index.html').content).toContain('href="/commercial-roof-repair/"'); // now in the nav
    // duplicate titles get a distinct address
    const r2 = run(clean, owner, { op: 'page.add', type: 'service', title: 'Commercial Roof Repair' });
    expect(r2.results[0].path).toBe('/commercial-roof-repair-2/');
  });

  it('renaming a published address rewrites links and leaves a redirect', () => {
    const { doc, owner } = setup();
    const services = doc.pages.find(p => p.slug === 'services');
    const r = run(doc, owner, { op: 'page.update', pageId: services.id, slug: 'What We Do', title: 'What We Do', navLabel: 'What we do', seo: { title: 'What we do', description: 'All our services.' }, inNav: true });
    expect(services.slug).toBe('what-we-do');
    expect(r.results[0].linksUpdated).toBeGreaterThan(0);
    expect(doc.redirects).toContainEqual({ from: '/services/', to: '/what-we-do/' });
    const all = renderSite(sanitizeDoc(doc), {}).files.filter(f => f.path.endsWith('.html')).map(f => f.content).join('');
    expect(all).not.toContain('href="/services/"');
    // a second rename chains the old redirect to the newest address
    run(doc, owner, { op: 'page.update', pageId: services.id, slug: 'services-new' });
    expect(doc.redirects).toContainEqual({ from: '/services/', to: '/services-new/' });
    expect(doc.redirects).toContainEqual({ from: '/what-we-do/', to: '/services-new/' });
    const about = doc.pages.find(p => p.slug === 'about');
    expect(() => run(doc, owner, { op: 'page.update', pageId: about.id, slug: 'contact' })).toThrow(/already uses/);
    expect(() => run(doc, owner, { op: 'page.update', pageId: doc.pages[0].id, slug: 'home' })).toThrow(/home page/);
    expect(() => run(doc, owner, { op: 'page.update', pageId: about.id, slug: 'api' })).toThrow(/reserved/);
  });

  it('archives with a way back, reorders, and protects the home page', () => {
    const { doc, owner } = setup();
    const faq = doc.pages.find(p => p.slug === 'faq');
    run(doc, owner, { op: 'page.archive', pageId: faq.id });
    expect(livePages(doc).some(p => p.id === faq.id)).toBe(false);
    expect(() => run(doc, owner, { op: 'page.archive', pageId: doc.pages[0].id })).toThrow();
    run(doc, owner, { op: 'page.restore', pageId: faq.id });
    expect(faq).toMatchObject({ status: 'draft', slug: 'faq' });
    expect(() => run(doc, owner, { op: 'page.delete', pageId: faq.id })).toThrow(/Archive the page first/);
    run(doc, owner, { op: 'page.archive', pageId: faq.id }, { op: 'page.delete', pageId: faq.id });
    expect(doc.pages.some(p => p.id === faq.id)).toBe(false);
    const order = livePages(doc).map(p => p.id);
    run(doc, owner, { op: 'page.move', pageId: order[2], dir: 'up' });
    expect(livePages(doc).map(p => p.id).slice(0, 3)).toEqual([order[0], order[2], order[1]]);
  });
});

describe('permissions', () => {
  it('lets customers adjust brand colours but not the design system or raw markup', () => {
    const { doc, owner, staff } = setup();
    const home = doc.pages[0];
    run(doc, owner, { op: 'brand.colors', accent: '#0a7d5a' });
    expect(doc.design.tokens.colors.accent).toBe('#0a7d5a');
    run(doc, owner, { op: 'brand.colors', accent: 'red;}body{display:none' });
    expect(doc.design.tokens.colors.accent).not.toContain('display');
    for (const op of [
      { op: 'design.css', css: 'body{display:none}' },
      { op: 'design.tokens', tokens: { fonts: { head: 'Comic Neue' } } },
      { op: 'section.html', pageId: home.id, sectionId: home.sections[0].id, html: '<p>hi</p>' },
      { op: 'chrome.html', which: 'header', html: '<p>x</p>' },
      { op: 'page.css', pageId: home.id, css: '*{}' },
      { op: 'settings.update', logo: 'https://x.example/l.png' },
      { op: 'redirect.add', from: '/a/', to: '/b/' },
      { op: 'made.up' }
    ]) expect(() => run(doc, owner, op), op.op).toThrow();
    // staff can, and it is still sanitised
    run(doc, staff, { op: 'design.css', css: '.x{color:red} @import url(evil.css);' }, { op: 'section.html', pageId: home.id, sectionId: home.sections[0].id, html: '<div class="w-container"><h1>New hero</h1><script>bad()</script></div>' });
    expect(doc.design.css).toBe('.x{color:red}');
    expect(home.sections[0].html).not.toContain('script');
    expect(Object.values(home.sections[0].fields)[0].html).toBe('New hero');
  });

  it('locked sections can only be removed by staff', () => {
    const { doc, owner, staff } = setup();
    const home = doc.pages[0];
    run(doc, staff, { op: 'section.lock', pageId: home.id, sectionId: home.sections[1].id, locked: true });
    expect(() => run(doc, owner, { op: 'section.remove', pageId: home.id, sectionId: home.sections[1].id })).toThrow(/locked/);
    run(doc, staff, { op: 'section.remove', pageId: home.id, sectionId: home.sections[1].id });
  });

  it('refuses to edit a classic single-page site and bounds batch size', () => {
    const { owner, doc } = setup();
    expect(() => applyOps(legacyDoc('<html></html>'), [{ op: 'page.add', title: 'X' }], owner)).toThrow(/Platform Conversion/);
    expect(() => applyOps(doc, [], owner)).toThrow();
    expect(() => applyOps(doc, Array.from({ length: 201 }, () => ({ op: 'page.move', pageId: 'x' })), owner)).toThrow(/Too many/);
  });
});
