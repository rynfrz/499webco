import { describe, it, expect, beforeEach } from 'vitest';
import { sql, getProject, saveSettings } from '@/lib/db';
import { freshDb, makeUser, signIn, jsonReq } from './helpers';
import { sampleProject } from './fixtures';
import { fakeStudio } from './studio';
import { convertLegacy, existingContentOf } from '@/lib/site/legacy';
import { legacyDoc, validateDoc } from '@/lib/site/schema';
import { renderSite } from '@/lib/site/render';
import { applyOps } from '@/lib/site/ops';
import { factsFromProject } from '@/lib/gen/brief';
import { ensureSite, getSite, getSiteByProject, listVersions, getVersion } from '@/lib/site/store';
import { POST as buildPOST } from '@/app/api/sites/build/route';
import { POST as runPOST } from '@/app/api/jobs/[id]/run/route';
import { POST as actionPOST } from '@/app/api/jobs/[id]/action/route';
import { GET as stagingGET, POST as stagingPOST } from '@/app/api/sites/[id]/staging/route';
import { GET as draftPreviewGET } from '@/app/api/sites/[id]/preview/[[...path]]/route';
import { POST as versionsPOST } from '@/app/api/sites/[id]/versions/route';
import { PATCH as sitePATCH, GET as siteGET } from '@/app/api/sites/[id]/route';
import { POST as publishPOST } from '@/app/api/publish/route';
import { GET as previewGET } from '@/app/preview/[slug]/route';
import { GET as previewPathGET } from '@/app/preview/[slug]/[...path]/route';

const LEGACY = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Summit Ridge Roofing — Roofing in Dacula</title>
<meta name="description" content="Family-owned roofing in Dacula, GA.">
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;800&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.example.test/extra.css">
<style>
:root{--bg:#101418;--accent:#ff7a18}
*{box-sizing:border-box;margin:0}
body{font-family:'Inter',sans-serif;background:var(--bg);color:#f3f6fb}
h1,h2{font-family:'Sora',sans-serif}
.site-header{position:sticky;top:0;display:flex;justify-content:space-between;padding:20px 6vw;background:#101418}
.hero{padding:14vh 6vw;background:linear-gradient(135deg,#ff7a18,#ffb800)}
.services{padding:9vh 6vw}.svc{background:#1a1e25;border-radius:16px;padding:26px}
.reveal{opacity:0;transition:.6s}.reveal.in{opacity:1}
</style></head>
<body class="theme-dark">
<header class="site-header" id="top"><a class="logo" href="#top">Summit Ridge Roofing</a><nav><a href="#services">Services</a><a href="#contact">Contact</a></nav><button class="menu" onclick="toggleMenu()">Menu</button></header>
<main>
<section class="hero" id="home"><h1>Roofs done right in Dacula</h1><p>Family-owned since 2009. Every job is led by an owner.</p><a class="cta" href="tel:4045550142">Call (404) 555-0142</a></section>
<section class="services reveal" id="services"><h2>What we do</h2><div class="grid"><div class="svc"><h3>Roof repair</h3><p>Leaks and storm damage fixed fast.</p></div><div class="svc"><h3>Roof replacement</h3><p>Full replacements for homes.</p></div></div><img src="https://img.example.test/a.jpg" alt="Finished roof"></section>
<section class="contact" id="contact"><h2>Visit or call</h2><p>120 Main St, Dacula, GA 30019</p><iframe src="https://www.google.com/maps?q=120%20Main%20St&output=embed"></iframe><iframe src="https://evil.example/track"></iframe></section>
</main>
<footer class="site-footer"><p>© 2024 Summit Ridge Roofing</p><p>Site by 499web.co</p></footer>
<script src="https://cdn.example.test/widget.js"></script>
<script>function toggleMenu(){document.body.classList.toggle('open')}
new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting&&e.target.classList.add('in'))).observe(document.querySelector('.reveal'));</script>
</body></html>`;

const P = id => ({ params: { id } });

async function seedLegacy(over = {}) {
  const p = sampleProject('p_' + Math.random().toString(36).slice(2, 8), { generatedHtml: LEGACY, status: 'paid', payment: { paidAt: 1, amount: 49900 }, ...over });
  const now = Date.now();
  await sql`INSERT INTO projects (id, owner_id, data, created_at, updated_at) VALUES (${p.id}, NULL, ${JSON.stringify(p)}::jsonb, ${now}, ${now})`;
  await publishPOST(jsonReq('/api/publish', 'POST', { projectId: p.id }));       // the classic publish path
  const project = await getProject(p.id);
  const site = await ensureSite(project, {});
  return { project, site };
}

async function runUpgrade(project, body) {
  const start = await (await buildPOST(jsonReq('/x', 'POST', { projectId: project.id, mode: 'upgrade', autoApprove: true, ...body }))).json();
  let v = start.job;
  for (let i = 0; i < 14 && v.status === 'running'; i++) v = (await (await runPOST(jsonReq('/x', 'POST', {}), P(v.id))).json()).job;
  return v;
}

let admin;
beforeEach(async () => { await freshDb(); globalThis.__wflNoRemote = true; admin = await makeUser('admin'); await signIn(admin); });

describe('Platform Conversion (no AI)', () => {
  it('turns a classic page into editable sections and keeps its look', () => {
    const { doc, report } = convertLegacy(LEGACY, { businessName: 'Summit Ridge Roofing' });
    expect(validateDoc(doc).ok).toBe(true);
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0].sections.map(s => s.type)).toEqual(['hero', 'services', 'contact']);
    expect(doc.pages[0].seo).toEqual({ title: 'Summit Ridge Roofing — Roofing in Dacula', description: 'Family-owned roofing in Dacula, GA.', noindex: false });
    expect(doc.design.css).toContain('.hero{padding:14vh 6vw');           // original stylesheet kept
    expect(doc.settings).toMatchObject({ foundation: 'primitives', bodyClass: 'theme-dark' });
    expect(doc.settings.extraFonts).toContain('fonts.googleapis.com/css2?family=Sora');
    expect(doc.settings.legacyScript).toContain('toggleMenu');
    expect(report.editableFields).toBeGreaterThan(10);
    // every limitation is reported rather than hidden
    const lim = report.limitations.join(' | ');
    expect(lim).toMatch(/external stylesheet was not carried over/i);
    expect(lim).toMatch(/external script was removed/i);
    expect(lim).toMatch(/Inline event handlers/i);
    expect(lim).toMatch(/embedded frame .* was removed/i);
    expect(lim).toMatch(/navigation is static/i);

    const html = renderSite(doc, {}).files.find(f => f.path === 'index.html').content;
    // original elements, ids and classes survive un-wrapped
    expect(html).toMatch(/<header class="site-header" id="top"[^>]*data-chrome="header"/);
    expect(html).toMatch(/<section class="hero" id="home" data-section="/);
    expect(html).toContain('<body class="page-home type-home theme-dark">');
    expect(html).toContain('google.com/maps');
    expect(html).not.toContain('evil.example');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('cdn.example.test/widget.js');
    expect(html).toContain('function toggleMenu()');                        // the original inline behaviour is kept
    const css = renderSite(doc, {}).files.find(f => f.path === 'assets/site.css').content;
    expect(css).not.toContain('text-wrap:balance');                         // the platform's element baseline is not imposed on it
    expect(css).toContain('.w-btn{');                                       // but platform blocks can still be added later
  });

  it('converted content is editable through the normal operations', () => {
    const { doc } = convertLegacy(LEGACY, { businessName: 'Summit Ridge Roofing' });
    const hero = doc.pages[0].sections[0];
    const titleKey = Object.keys(hero.fields).find(k => hero.fields[k].html === 'Roofs done right in Dacula');
    const ctaKey = Object.keys(hero.fields).find(k => hero.fields[k].type === 'link');
    const facts = factsFromProject(sampleProject('x'));
    applyOps(doc, [
      { op: 'field.set', pageId: doc.pages[0].id, sectionId: hero.id, key: titleKey, value: { html: 'Edited headline' } },
      { op: 'field.set', pageId: doc.pages[0].id, sectionId: hero.id, key: ctaKey, value: { href: 'tel:+14045550000', html: 'Call today' } },
      { op: 'section.move', pageId: doc.pages[0].id, sectionId: doc.pages[0].sections[2].id, dir: 'up' }
    ], { role: 'owner', facts });
    const html = renderSite(doc, {}).files.find(f => f.path === 'index.html').content;
    expect(html).toContain('<h1 data-f="' + titleKey + '">Edited headline</h1>');
    expect(html).toContain('href="tel:+14045550000"');
    expect(html.indexOf('id="contact"')).toBeLessThan(html.indexOf('id="services"'));
    expect(() => applyOps(doc, [{ op: 'section.options', pageId: doc.pages[0].id, sectionId: hero.id, options: { tone: 'dark' } }], { role: 'owner', facts })).toThrow(/not available/);
  });

  it('stages the conversion, leaves the live site alone, then approves, publishes and can roll back to the original', async () => {
    const { project, site } = await seedLegacy();
    const liveBefore = await (await previewGET(jsonReq('/x'), { params: { slug: site.slug } })).text();
    expect(liveBefore).toBe(LEGACY);
    const legacyVersion = site.publishedVersionId;

    const job = await runUpgrade(project, { upgradeType: 'convert' });
    expect(job.status).toBe('done');
    expect(job.result).toMatchObject({ staged: true, converted: true });
    expect(job.usage.calls).toBe(0);                                         // no model calls for a conversion
    // nothing public changed, and the draft is still the classic page
    expect(await (await previewGET(jsonReq('/x'), { params: { slug: site.slug } })).text()).toBe(LEGACY);
    let s = await getSite(site.id);
    expect(s.draft.format).toBe('legacy-html');
    expect(s.stagingVersionId).toBeTruthy();
    const staging = await (await stagingGET(jsonReq('/x'), P(site.id))).json();
    expect(staging.staging.meta.report.limitations.length).toBeGreaterThan(3);
    const stagedHtml = await (await draftPreviewGET(jsonReq('/x'), { params: { id: site.id, path: ['staging'] } })).text();
    expect(stagedHtml).toContain('Roofs done right in Dacula');

    // approve → becomes the draft; still not public
    await stagingPOST(jsonReq('/x', 'POST', { action: 'approve' }), P(site.id));
    s = await getSite(site.id);
    expect(s.draft.format).toBe('structured');
    expect(s.publishedVersionId).toBe(legacyVersion);
    expect(await (await previewGET(jsonReq('/x'), { params: { slug: site.slug } })).text()).toBe(LEGACY);
    expect((await listVersions(site.id)).some(v => v.kind === 'snapshot' && v.label === 'Before upgrade')).toBe(true);

    // publish → the converted site is served; customer records untouched
    const pub = await (await publishPOST(jsonReq('/x', 'POST', { projectId: project.id }))).json();
    expect(pub.pages).toBe(1);
    const liveAfter = await (await previewGET(jsonReq('/x'), { params: { slug: site.slug } })).text();
    expect(liveAfter).toContain('data-section=');
    const p = await getProject(project.id);
    expect(p.status).toBe('paid');
    expect(p.payment.amount).toBe(49900);
    expect(p.publish.slug).toBe(site.slug);                                  // same public address

    // rollback → the original classic page, byte for byte
    await versionsPOST(jsonReq('/x', 'POST', { action: 'rollback', versionId: legacyVersion }), P(site.id));
    expect(await (await previewGET(jsonReq('/x'), { params: { slug: site.slug } })).text()).toBe(LEGACY);
    expect((await getSite(site.id)).draft.format).toBe('legacy-html');
  });

  it('a staged upgrade can be discarded without any effect', async () => {
    const { project, site } = await seedLegacy();
    await runUpgrade(project, { upgradeType: 'convert' });
    await stagingPOST(jsonReq('/x', 'POST', { action: 'discard' }), P(site.id));
    const s = await getSite(site.id);
    expect(s.stagingVersionId).toBeNull();
    expect(s.draft.format).toBe('legacy-html');
    expect(await (await previewGET(jsonReq('/x'), { params: { slug: site.slug } })).text()).toBe(LEGACY);
    expect((await stagingPOST(jsonReq('/x', 'POST', { action: 'approve' }), P(site.id))).status).toBe(400);
  });

  it('requires an upgrade type', async () => {
    const { project } = await seedLegacy();
    expect((await buildPOST(jsonReq('/x', 'POST', { projectId: project.id, mode: 'upgrade' }))).status).toBe(400);
  });
});

describe('AI upgrades of an existing site', () => {
  beforeEach(async () => { await saveSettings({ anthropicKey: 'sk-ant-test' }); });

  it('reads what the existing site says', () => {
    const ex = existingContentOf(legacyDoc(LEGACY));
    expect(ex.legacy).toBe(true);
    expect(ex.pages[0].sections.map(s => s.name)).toEqual(['Roofs done right in Dacula', 'What we do', 'Visit or call']);
    expect(ex.identity.colors).toContain('#101418');
    expect(ex.identity.fonts).toEqual(expect.arrayContaining(['Sora', 'Inter']));
  });

  it('Multipage Conversion: expands one page into several, reusing the existing content, staged for review', async () => {
    const { project, site } = await seedLegacy();
    const studio = fakeStudio();
    const job = await runUpgrade(project, { upgradeType: 'multipage' });
    expect(job.status).toBe('done');
    expect(job.result.staged).toBe(true);
    expect(job.steps.map(s => s.kind)).toEqual(['analyze', 'brief', 'sitemap', 'design', 'page', 'page', 'page', 'page', 'seo', 'qa', 'finalize']);
    const prompts = studio.calls.map(c => c.messages[0].content);
    expect(prompts[0]).toContain('THE EXISTING WEBSITE');                    // brief sees the current content
    expect(prompts[0]).toContain('Leaks and storm damage fixed fast');
    expect(prompts[1]).toContain('MULTIPAGE CONVERSION');
    expect(prompts[2]).toContain('MULTIPAGE CONVERSION');
    expect(prompts[2]).toContain('#101418');                                 // current identity passed to the designer
    expect(prompts[3]).toContain('EXISTING SITE CONTENT');
    expect(studio.calls[2].model).toBe('claude-opus-4-8');                   // the "redesign" task model
    // staged only
    expect(await (await previewGET(jsonReq('/x'), { params: { slug: site.slug } })).text()).toBe(LEGACY);
    const staged = await getVersion((await getSite(site.id)).stagingVersionId);
    expect(staged.doc.pages.map(p => p.slug)).toEqual(['', 'services', 'about', 'contact']);
    expect(staged.doc.meta.upgradedFrom).toBe('multipage');
    expect(staged.meta.upgradeType).toBe('multipage');

    await stagingPOST(jsonReq('/x', 'POST', { action: 'approve', publish: true }), P(site.id));
    expect((await previewPathGET(jsonReq('/x'), { params: { slug: site.slug, path: ['services'] } })).status).toBe(200);
    expect((await getProject(project.id)).siteEngine).toBe('v2');
  });

  it('Visual Refresh keeps the page structure and tells the model to keep the copy', async () => {
    const { project, site } = await seedLegacy();
    const studio = fakeStudio();
    const job = await runUpgrade(project, { upgradeType: 'refresh' });
    expect(job.status).toBe('done');
    expect(studio.seen.sitemap).toBe(0);                                     // structure is not re-planned
    expect(studio.seen.page).toBe(1);
    const pagePrompt = studio.calls.find(c => /Build the "Home" page/.test(c.messages[0].content)).messages[0].content;
    expect(pagePrompt).toContain('VISUAL REFRESH');
    expect(pagePrompt).toContain('Use the existing copy verbatim');
    expect(pagePrompt).toContain('Family-owned since 2009');
    const staged = await getVersion((await getSite(site.id)).stagingVersionId);
    expect(staged.doc.pages.map(p => p.slug)).toEqual(['']);
  });

  it('refreshing a structured multipage site preserves every page address', async () => {
    const p = sampleProject('p_struct');
    const now = Date.now();
    await sql`INSERT INTO projects (id, owner_id, data, created_at, updated_at) VALUES (${p.id}, NULL, ${JSON.stringify(p)}::jsonb, ${now}, ${now})`;
    fakeStudio();
    const first = await (await buildPOST(jsonReq('/x', 'POST', { projectId: p.id, autoApprove: true }))).json();
    let v = first.job; for (let i = 0; i < 12 && v.status === 'running'; i++) v = (await (await runPOST(jsonReq('/x', 'POST', {}), P(v.id))).json()).job;
    await publishPOST(jsonReq('/x', 'POST', { projectId: p.id }));
    const site = await getSiteByProject(p.id);
    const before = site.draft.pages.map(x => [x.id, x.slug]);
    const published = (await getSite(site.id)).publishedVersionId;

    const studio = fakeStudio();
    const job = await runUpgrade(await getProject(p.id), { upgradeType: 'redesign' });
    expect(job.status).toBe('done');
    expect(studio.calls.some(c => /FULL REDESIGN/.test(c.messages[0].content))).toBe(true);
    const s = await getSite(site.id);
    expect(s.publishedVersionId).toBe(published);                            // production untouched by a finished job
    expect(s.draft.pages.map(x => [x.id, x.slug])).toEqual(before);
    const job2 = await runUpgrade(await getProject(p.id), { upgradeType: 'refresh' });
    expect(job2.status).toBe('done');
    const staged = await getVersion((await getSite(site.id)).stagingVersionId);
    expect(staged.doc.pages.map(x => x.slug)).toEqual(before.map(b => b[1]));
  });
});
