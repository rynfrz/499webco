import { describe, it, expect, beforeEach } from 'vitest';
import { sql, saveSettings, getProject } from '@/lib/db';
import { startSiteBuild, runJob, approvePlan, retryJob, normalizeSitemap, startPartialJob } from '@/lib/gen/pipeline';
import { getJob, cancelJob, listJobs } from '@/lib/gen/jobs';
import { getSite, getSiteByProject, listVersions, publishSite, servePublished } from '@/lib/site/store';
import { validateDoc } from '@/lib/site/schema';
import { renderSite } from '@/lib/site/render';
import { freshDb, makeUser } from './helpers';
import { sampleProject } from './fixtures';
import { fakeStudio, designOutput, pageOutput } from './studio';

async function seedProject(over) {
  const p = sampleProject('p_' + Math.random().toString(36).slice(2, 8), over);
  const now = Date.now();
  await sql`INSERT INTO projects (id, owner_id, data, created_at, updated_at) VALUES (${p.id}, NULL, ${JSON.stringify(p)}::jsonb, ${now}, ${now})`;
  return p;
}

async function runToEnd(jobId, max = 12) {
  let v;
  for (let i = 0; i < max; i++) { v = await runJob(jobId); if (v.status !== 'running') break; }
  return v;
}

beforeEach(async () => { await freshDb(); globalThis.__wflNoRemote = true; });

describe('site build — demo mode (no API key)', () => {
  it('plans, waits for sitemap review, then builds a multipage site into the draft', async () => {
    const admin = await makeUser('admin');
    const project = await seedProject();
    const job = await startSiteBuild(project, {}, admin);
    let v = await runJob(job.id);
    expect(v.status).toBe('awaiting_review');
    expect(v.sitemap.map(p => p.type)).toEqual(['home', 'about', 'services', 'gallery', 'testimonials', 'faq', 'contact']);
    expect(v.brief.missing.map(m => m.key)).toContain('logo');
    expect(v.input.engine).toBe('demo');

    // The administrator removes a page and renames another before building.
    const edited = v.sitemap.filter(p => p.type !== 'gallery').map(p => (p.type === 'services' ? { ...p, title: 'What We Do', navLabel: 'What We Do', slug: 'what-we-do' } : p));
    await approvePlan(job.id, { sitemap: edited });
    v = await runToEnd(job.id);
    expect(v.status).toBe('done');
    expect(v.progress).toBe(100);
    expect(v.result.saved).toBe(true);
    expect(v.result.pages).toBe(6);

    const site = await getSiteByProject(project.id);
    expect(validateDoc(site.draft).ok).toBe(true);
    expect(site.draft.pages.map(p => p.slug)).toEqual(['', 'about', 'what-we-do', 'reviews', 'faq', 'contact']);
    expect(site.publishedVersionId).toBeNull();           // nothing is public until someone publishes
    expect(site.draft.direction.choices.palette).toBeTruthy(); // design direction stored with the site
    const p2 = await getProject(project.id);
    expect(p2.status).toBe('generated');
    expect(p2.siteEngine).toBe('v2');
    expect(v.qa.summary.errors).toBe(0);
    expect(v.steps.every(s => s.status === 'done')).toBe(true);
  });

  it('does not overwrite a paid project status and snapshots an existing draft', async () => {
    const admin = await makeUser('admin');
    const project = await seedProject({ status: 'paid' });
    const j1 = await startSiteBuild(project, { autoApprove: true }, admin);
    await runToEnd(j1.id);
    const j2 = await startSiteBuild(await getProject(project.id), { autoApprove: true }, admin);
    await runToEnd(j2.id);
    expect((await getProject(project.id)).status).toBe('paid');
    const site = await getSiteByProject(project.id);
    const versions = await listVersions(site.id);
    expect(versions.some(v => v.kind === 'snapshot' && v.label === 'Before regeneration')).toBe(true);
  });
});

describe('site build — with the model', () => {
  beforeEach(async () => { await saveSettings({ anthropicKey: 'sk-ant-test', aiPreset: 'balanced' }); });

  it('runs every stage with the assigned models and stores a cohesive multipage site', async () => {
    const admin = await makeUser('admin');
    const project = await seedProject();
    const studio = fakeStudio();
    const job = await startSiteBuild(project, {}, admin);
    let v = await runJob(job.id);
    expect(v.status).toBe('awaiting_review');
    expect(v.sitemap.map(p => p.slug)).toEqual(['', 'services', 'about', 'contact']);
    expect(v.brief.primaryAction.label).toBe('Get a free inspection');
    expect(v.estimate.pages).toBe(4);
    await approvePlan(job.id, {});
    v = await runToEnd(job.id);
    expect(v.status).toBe('done');

    // Model routing: Opus plans + designs, Sonnet builds pages.
    const models = studio.calls.map(c => c.model);
    expect(models.slice(0, 3)).toEqual(['claude-opus-4-8', 'claude-opus-4-8', 'claude-opus-4-8']);
    expect(models.slice(3)).toEqual(['claude-sonnet-4-6', 'claude-sonnet-4-6', 'claude-sonnet-4-6', 'claude-sonnet-4-6']);
    expect(studio.calls.every(c => c.max_tokens <= 64000)).toBe(true);
    expect(studio.seen).toMatchObject({ brief: 1, sitemap: 1, design: 1, page: 4 });
    // Pages share one cached context block
    const pageCalls = studio.calls.slice(3);
    expect(pageCalls[0].system[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(new Set(pageCalls.map(c => c.system[1].text)).size).toBe(1);

    const site = await getSiteByProject(project.id);
    const doc = site.draft;
    expect(doc.pages).toHaveLength(4);
    expect(doc.design.tokens.colors.accent).toBe('#b4421c');
    expect(doc.design.css).toContain('.rule-list');
    expect(doc.design.system.patterns).toContain('kicker');
    expect(doc.meta.generator.models.design.model).toBe('claude-opus-4-8'); // model config persisted with the site
    // Every page was built from the same design system and is editable
    for (const p of doc.pages) {
      expect(p.sections.length).toBeGreaterThanOrEqual(3);
      expect(Object.keys(p.sections[0].fields)).toEqual(expect.arrayContaining(['title', 'lead', 'cta', 'photo']));
      expect(p.seo.title).toBeTruthy();
    }
    const out = renderSite(doc, {});
    const home = out.files.find(f => f.path === 'index.html').content;
    expect(home).toMatch(/<li><a data-nav-item href="\/services\/">Services<\/a><\/li>/);
    expect(out.files.find(f => f.path === 'assets/site.css').content).toContain('.rule-list');

    expect(v.usage.calls).toBe(7);
    expect(v.usage.cost).toBeGreaterThan(0);
    expect(v.calls.map(c => c.task)).toEqual(['architecture', 'architecture', 'design', 'page', 'page', 'page', 'page']);
  });

  it('strips unsafe model output and reports it in QA', async () => {
    const project = await seedProject();
    fakeStudio({ page: (b, n, { u }) => n === 1 ? pageOutput('Home', { extra: '<script>fetch("/api/settings")</script><div onclick="x()">hi</div><iframe src="https://evil.example"></iframe><a href="/nope/">Broken</a><a href="#">Dead</a><img src="https://stock.example/x.jpg" alt="">' }) : undefined });
    const job = await startSiteBuild(project, { autoApprove: true }, null);
    const v = await runToEnd(job.id);
    expect(v.status).toBe('done');
    const doc = (await getSiteByProject(project.id)).draft;
    const all = JSON.stringify(doc);
    expect(all).not.toMatch(/<script|onclick|evil\.example|stock\.example/);
    expect(v.qa.issues.some(i => i.code === 'sanitized' && /script/.test(i.message))).toBe(true);
    expect(v.fixes.join(' ')).toMatch(/broken link/i);
    expect(v.fixes.join(' ')).toMatch(/not supplied by the business/i);
    expect(v.qa.issues.filter(i => i.code === 'link_broken' || i.code === 'link_dead')).toHaveLength(0);
  });

  it('asks the model to correct a rejected response, then fails the step cleanly if it stays bad', async () => {
    const project = await seedProject();
    let designCalls = 0;
    const studio = fakeStudio({ design: () => (++designCalls === 1 ? designOutput({ header: '<div class="w-container"><a href="/">No nav slot</a></div>' }) : undefined) });
    const job = await startSiteBuild(project, { autoApprove: true }, null);
    const v = await runToEnd(job.id);
    expect(v.status).toBe('done');
    expect(designCalls).toBe(2);
    expect(studio.calls[3].messages[0].content).toContain('a previous attempt was rejected');
    expect(v.notes.join(' ')).toMatch(/response rejected/);

    // Always-bad page output → the job stops with a clear error and can be retried.
    const p2 = await seedProject();
    let bad = true;
    fakeStudio({ page: () => (bad ? 'I cannot do that.' : undefined) });
    const j2 = await startSiteBuild(p2, { autoApprove: true }, null);
    let v2 = await runToEnd(j2.id, 20);
    expect(v2.status).toBe('error');
    expect(v2.error).toMatch(/Building "Home"/);
    expect((await getSiteByProject(p2.id)).draft.pages).toHaveLength(0);   // nothing half-written
    bad = false;
    await retryJob(j2.id);
    v2 = await runToEnd(j2.id);
    expect(v2.status).toBe('done');
    // Finished steps were not repeated
    expect(v2.steps.find(s => s.kind === 'design').attempts).toBe(1);
  });

  it('resumes across requests when the time budget runs out', async () => {
    const project = await seedProject();
    const studio = fakeStudio();
    const job = await startSiteBuild(project, { autoApprove: true }, null);
    // A tiny budget: each call can only prove there is not enough time for a model step.
    let v = await runJob(job.id, { budgetMs: 1000 });
    expect(v.status).toBe('running');
    expect(studio.calls).toHaveLength(0);
    expect(v.stage).toMatch(/continuing/);
    v = await runToEnd(job.id);
    expect(v.status).toBe('done');
    expect(studio.seen.page).toBe(4);
  });

  it('a second runner cannot run the same job at the same time', async () => {
    const project = await seedProject();
    fakeStudio({ brief: async () => { await new Promise(r => setTimeout(r, 150)); return undefined; } });
    const job = await startSiteBuild(project, { autoApprove: true }, null);
    const [a, b] = await Promise.all([runJob(job.id), runJob(job.id)]);
    const done = [a, b].filter(x => x.status === 'done');
    expect(done.length).toBeGreaterThanOrEqual(1);
    const rows = await sql`SELECT COUNT(*)::int AS n FROM ai_calls WHERE job_id = ${job.id} AND task = 'design'`;
    expect(rows[0].n).toBe(1);
  });

  it('can be cancelled', async () => {
    const project = await seedProject();
    fakeStudio();
    const job = await startSiteBuild(project, {}, null);
    await runJob(job.id);
    await cancelJob(job.id);
    const v = await runJob(job.id);
    expect(v.status).toBe('canceled');
    await expect(approvePlan(job.id, {})).rejects.toThrow();
  });

  it('honours a per-job model override and lists jobs with cost', async () => {
    const project = await seedProject();
    const studio = fakeStudio();
    const job = await startSiteBuild(project, { autoApprove: true, override: { model: 'claude-haiku-4-5-20251001' } }, null);
    await runToEnd(job.id);
    expect(new Set(studio.calls.map(c => c.model))).toEqual(new Set(['claude-haiku-4-5-20251001']));
    const list = await listJobs({});
    expect(list[0].usage.calls).toBe(7);
    expect(list[0].businessName).toBe('Summit Ridge Roofing');
  });
});

describe('partial regeneration', () => {
  beforeEach(async () => { await saveSettings({ anthropicKey: 'sk-ant-test' }); });

  async function built() {
    const project = await seedProject();
    const studio = fakeStudio();
    const job = await startSiteBuild(project, { autoApprove: true }, null);
    await runToEnd(job.id);
    return { project: await getProject(project.id), site: await getSiteByProject(project.id), studio };
  }

  it('revises one page without touching the others, and snapshots first', async () => {
    const { project, site } = await built();
    const before = site.draft;
    const about = before.pages.find(p => p.slug === 'about');
    const studio = fakeStudio({ revise: () => pageOutput('About').replace('Family-owned since 2009', 'Now with a darker hero') });
    const job = await startPartialJob('page_regen', project, site, { pageId: about.id, instruction: 'Make the hero darker' }, null);
    const v = await runToEnd(job.id);
    expect(v.status).toBe('done');
    expect(studio.calls).toHaveLength(1);                       // one call, not a whole-site rebuild
    const after = (await getSite(site.id)).draft;
    expect(JSON.stringify(after.pages.find(p => p.id === about.id))).toContain('Now with a darker hero');
    for (const p of before.pages.filter(x => x.id !== about.id)) expect(after.pages.find(x => x.id === p.id)).toEqual(p);
    expect(after.design).toEqual(before.design);
    expect((await listVersions(site.id)).some(x => x.kind === 'snapshot' && /Before revising "About"/.test(x.label))).toBe(true);
  });

  it('reworks a single section in place', async () => {
    const { project, site } = await built();
    const page = site.draft.pages[0];
    const target = page.sections[1];
    fakeStudio({ revise: () => `<w-section type="services" name="Fresh" class="fresh"><div class="w-container"><h2 data-f="h">A fresh take</h2></div></w-section><w-css>.p-home-fresh{color:red}</w-css>` });
    const job = await startPartialJob('section_regen', project, site, { pageId: page.id, sectionId: target.id, instruction: 'Shorter' }, null);
    const v = await runToEnd(job.id);
    expect(v.status).toBe('done');
    const after = (await getSite(site.id)).draft.pages[0];
    expect(after.sections[1].id).toBe(target.id);
    expect(after.sections[1].fields.h.html).toBe('A fresh take');
    expect(after.sections[0]).toEqual(page.sections[0]);
    expect(after.css).toContain('.p-home-fresh');
  });

  it('adds a new AI-built page as a draft that inherits the design system', async () => {
    const { project, site } = await built();
    const studio = fakeStudio();
    const job = await startPartialJob('page_add', project, site, { title: 'Commercial Roof Repair', type: 'service', instruction: 'Add a page for our commercial roof repair service.' }, null);
    const v = await runToEnd(job.id);
    expect(v.status).toBe('done');
    expect(v.result.path).toBe('/commercial-roof-repair/');
    const after = (await getSite(site.id)).draft;
    const added = after.pages.find(p => p.slug === 'commercial-roof-repair');
    expect(added.status).toBe('draft');
    expect(after.pages).toHaveLength(5);
    expect(after.design).toEqual(site.draft.design);            // same design system, untouched
    expect(studio.calls[0].system[1].text).toContain('.rule-list'); // the model saw the existing design CSS
    expect(studio.calls).toHaveLength(1);
    // Not public until published as part of the site
    const pub = await publishSite(site.id, {});
    expect(pub.pages.map(p => p.path)).not.toContain('/commercial-roof-repair/');
  });
});

describe('sitemap normalisation', () => {
  it('guarantees one home page, unique safe slugs and a page cap', () => {
    const out = normalizeSitemap([
      { title: 'Services', type: 'services', slug: 'Our Services!' },
      { title: 'Home', type: 'home', slug: 'whatever' },
      { title: 'Home again', type: 'home' },
      { title: 'Services', type: 'services', slug: 'our-services' },
      { title: '', type: 'about' },
      { title: 'Team', type: 'weird', slug: 'api' }
    ]);
    expect(out[0]).toMatchObject({ type: 'home', slug: '' });
    expect(out.map(p => p.slug)).toEqual(['', 'our-services', 'our-services-2', 'team']); // reserved address replaced
    expect(out.filter(p => p.slug === '')).toHaveLength(1);
    expect(out[3].type).toBe('standard');
    expect(normalizeSitemap(Array.from({ length: 40 }, (_, i) => ({ title: 'P' + i })))).toHaveLength(14);
  });
});
