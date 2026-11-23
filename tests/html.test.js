import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeCss, sanitizeInline, safeUrl, extractFields, applyFields, cleanFieldValue, editItem, listItems, rebaseLinks, sanitizeStyleAttr } from '@/lib/site/html';

describe('sanitizeHtml', () => {
  it('removes scripts, event handlers and dangerous URLs', () => {
    const { html, removed } = sanitizeHtml(`<div onclick="steal()" class="a"><script>alert(1)</script><a href="javascript:alert(1)">x</a><a href="/about/" target="_blank">ok</a><img src="x" onerror="alert(1)"><iframe src="https://evil.example/"></iframe><style>body{}</style></div>`);
    expect(html).not.toMatch(/script|onclick|onerror|javascript:|evil\.example|<style/i);
    expect(html).toContain('href="/about/"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(removed).toContain('script');
    expect(removed).toContain('iframe');
  });

  it('keeps allowed embeds, forms and inline SVG (case preserved)', () => {
    const { html } = sanitizeHtml(`<iframe src="https://www.google.com/maps?q=x&output=embed"></iframe><form action="https://evil.example" data-form="contact"><input type="file" name="a"><button>Send</button></form><svg viewBox="0 0 10 10"><linearGradient id="g"></linearGradient><path d="M0 0" onload="x()"/></svg>`);
    expect(html).toContain('google.com/maps');
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain('evil.example');
    expect(html).toContain('type="text"');
    expect(html).toContain('viewBox="0 0 10 10"');
    expect(html).toContain('linearGradient');
    expect(html).not.toContain('onload');
  });

  it('unwraps unknown elements but keeps their content', () => {
    const { html, unwrapped } = sanitizeHtml('<marquee><b>hi</b></marquee><custom-el>there</custom-el>');
    expect(html).toBe('<b>hi</b>there');
    expect(unwrapped).toEqual(expect.arrayContaining(['marquee', 'custom-el']));
  });

  it('drops data: and other schemes except safe image data URLs', () => {
    expect(safeUrl('data:text/html;base64,AAAA', 'media')).toBe('');
    expect(safeUrl('data:image/png;base64,AAAA', 'media')).toContain('data:image/png');
    expect(safeUrl('JaVaScRiPt:alert(1)')).toBe('');
    expect(safeUrl(' java\nscript:alert(1)')).toBe('');
    expect(safeUrl('tel:+14045551212')).toBe('tel:+14045551212');
    expect(safeUrl('//cdn.example.com/a.png', 'media')).toBe('https://cdn.example.com/a.png');
    expect(safeUrl('https://evil.example/', 'frame')).toBe('');
  });
});

describe('sanitizeCss', () => {
  it('strips imports, expressions, markup breakouts and unsafe urls', () => {
    const css = sanitizeCss(`@import url("https://evil.example/x.css"); .a{color:red;background:url(javascript:alert(1))} .b{width:expression(alert(1))} </style><script>x</script> .c{background:url("https://ok.example/i.png")} .d > .e{behavior:url(x.htc)}`);
    expect(css).not.toMatch(/@import|expression|javascript|<\/style|<script|behavior/i);
    expect(css).toContain('https://ok.example/i.png');
    expect(css).toContain('.d > .e');
  });
  it('sanitises inline style attributes', () => {
    expect(sanitizeStyleAttr('color:red; background:url(javascript:x)')).not.toMatch(/javascript/);
  });
});

describe('editable fields', () => {
  const tpl = `<div><h2 data-f="title">Old <em>title</em></h2><p data-f="title">dup key</p><a class="btn" data-f="cta" href="/contact/">Call</a><img data-f="photo" src="https://x.example/a.jpg" alt="A"><div data-f-bg="hero" style="background-image:url('https://x.example/bg.jpg');color:red"></div><a data-f="card" href="/s/"><span data-f="cardtitle">Card</span></a></div>`;

  it('extracts typed fields with unique keys', () => {
    const { html, fields } = extractFields(sanitizeHtml(tpl).html);
    expect(fields.title).toEqual({ type: 'text', html: 'Old <em>title</em>' });
    expect(fields['title-2'].html).toBe('dup key');
    expect(fields.cta).toEqual({ type: 'link', href: '/contact/', html: 'Call' });
    expect(fields.photo).toEqual({ type: 'image', src: 'https://x.example/a.jpg', alt: 'A' });
    expect(fields.hero).toEqual({ type: 'bg', src: 'https://x.example/bg.jpg' });
    expect(fields.card).toEqual({ type: 'link', href: '/s/', html: null }); // wrapper link: destination only
    expect(html).toContain('data-f="title-2"');
  });

  it('applies edited values back into the template', () => {
    const { html, fields } = extractFields(sanitizeHtml(tpl).html);
    fields.title = cleanFieldValue(fields.title, { html: 'New <b>bold</b><script>x</script>' });
    fields.cta = cleanFieldValue(fields.cta, { href: 'tel:+15551234567', html: 'Call now' });
    fields.photo = cleanFieldValue(fields.photo, { src: 'https://x.example/b.jpg', alt: 'B' });
    fields.hero = cleanFieldValue(fields.hero, { src: 'https://x.example/bg2.jpg' });
    const out = applyFields(html, fields);
    expect(out).toContain('New <b>bold</b>');
    expect(out).not.toContain('script');
    expect(out).toContain('href="tel:+15551234567"');
    expect(out).toContain('src="https://x.example/b.jpg"');
    expect(out).toContain('bg2.jpg');
    expect(out).toContain('color:red');
    expect(out).toContain('class="btn"'); // template untouched
  });

  it('rejects unsafe field values', () => {
    const { fields } = extractFields(sanitizeHtml(tpl).html);
    expect(() => cleanFieldValue(fields.cta, { href: 'javascript:alert(1)' })).toThrow();
    expect(() => cleanFieldValue(fields.photo, { src: 'javascript:alert(1)' })).toThrow();
    expect(() => cleanFieldValue(undefined, {})).toThrow();
  });

  it('inline sanitiser keeps only inline formatting', () => {
    expect(sanitizeInline('<div>Line one</div><div>Line <strong style="color:red" onclick="x()">two</strong></div><img src=x onerror=y>')).toBe('Line one<br>Line <strong>two</strong>');
    expect(sanitizeInline('<a href="javascript:x">bad</a><a href="/ok/">ok</a>')).toBe('<a>bad</a><a href="/ok/">ok</a>');
  });
});

describe('repeating items', () => {
  const html = `<ul><li data-item><h3 data-f="s1">One</h3></li><li data-item><h3 data-f="s2">Two</h3></li></ul>`;
  const fields = { s1: { type: 'text', html: 'One' }, s2: { type: 'text', html: 'Two' } };
  it('duplicates, reorders and removes items with fresh field keys', () => {
    expect(listItems(html).map(i => i.text)).toEqual(['One', 'Two']);
    const dup = editItem(html, fields, 0, 'duplicate');
    expect(Object.keys(dup.fields).sort()).toEqual(['s1', 's1-2', 's2']);
    expect(listItems(dup.html)).toHaveLength(3);
    const moved = editItem(html, fields, 0, 'down');
    expect(listItems(applyFields(moved.html, moved.fields)).map(i => i.text)).toEqual(['Two', 'One']);
    const removed = editItem(html, fields, 1, 'remove');
    expect(removed.fields.s2).toBeUndefined();
    expect(() => editItem(removed.html, removed.fields, 0, 'remove')).toThrow();
  });
});

describe('rebaseLinks', () => {
  it('moves root-relative links under a base path', () => {
    const out = rebaseLinks('<a href="/about/">a</a><a href="https://x.example/">b</a><a href="#top">c</a>', '/preview/acme/');
    expect(out).toContain('href="/preview/acme/about/"');
    expect(out).toContain('href="https://x.example/"');
    expect(out).toContain('href="#top"');
  });
});
