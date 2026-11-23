import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sql, getProject, saveSettings, getSettings } from '@/lib/db';
import { freshDb, makeUser, signIn, signOut, jsonReq } from './helpers';
import { sampleProject } from './fixtures';
import { POST as leadPOST } from '@/app/api/lead/route';
import { GET as projectsGET, POST as projectsPOST } from '@/app/api/projects/route';
import { GET as settingsGET, PATCH as settingsPATCH } from '@/app/api/settings/route';
import { GET as aiGET, POST as aiPOST } from '@/app/api/ai/route';
import { GET as reviewGET } from '@/app/api/review/[token]/route';
import { POST as buildPOST } from '@/app/api/sites/build/route';
import { POST as runPOST } from '@/app/api/jobs/[id]/run/route';
import { POST as publishPOST } from '@/app/api/publish/route';
import { POST as launchPOST } from '@/app/api/launch/route';
import { POST as sitePublishPOST } from '@/app/api/sites/[id]/publish/route';
import { PATCH as sitePATCH, GET as siteGET } from '@/app/api/sites/[id]/route';
import { POST as versionsPOST } from '@/app/api/sites/[id]/versions/route';
import { GET as presetsGET, POST as presetsPOST } from '@/app/api/design/presets/route';
import { PATCH as presetPATCH, DELETE as presetDELETE } from '@/app/api/design/presets/[id]/route';
import { GET as cronGET } from '@/app/api/cron/jobs/route';
import { getSiteByProject, getSite } from '@/lib/site/store';
import { normalizeDirection } from '@/lib/design/direction';
import { mockAnthropic } from './helpers';

const P = id => ({ params: { id } });
let admin;
beforeEach(async () => { await freshDb(); globalThis.__wflNoRemote = true; admin = await makeUser('admin'); });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.CRON_SECRET; });

describe('the original lead flow still works', () => {
  it('a prospect submits the inquiry form without signing in and it appears as a lead', async () => {
    signOut();
    const bad = await leadPOST(jsonReq('/api/lead', 'POST', { name: 'No Email Co' }));
    expect(bad.status).toBe(400);
    const res = await leadPOST(jsonReq('/api/lead', 'POST', { name: 'Peachtree Bakery', email: 'hi@peachtree.test', type: 'Bakery / Dessert Shop', city: 'Buford', phone: '555-0100', currentUrl: 'old.example', notes: 'We need online ordering.' }));
    expect(await res.json()).toEqual({ ok: true });
    await signIn(admin);
    const list = (await (await projectsGET()).json()).projects;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: 'lead', business: { name: 'Peachtree Bakery', type: 'Bakery / Dessert Shop', city: 'Buford' }, hasSite: false });
    const p = await getProject(list[0].id);
    expect(p.reviewToken).toMatch(/^[0-9a-f]{32}$/);
    expect(p.lead.notes).toBe('We need online ordering.');
    expect(p.designSeed).toBeTruthy();                       // the classic seed is still created
    // the private review link works before a site exists
    signOut();
    const review = await (await reviewGET(jsonReq('/x'), { params: { token: p.reviewToken } })).json();
    expect(review).toMatchObject({ businessName: 'Peachtree Bakery', hasSite: false, approved: false, paid: false });
  });

  it('a lead can be taken straight through the multipage build', async () => {
    signOut();
    await leadPOST(jsonReq('/api/lead', 'POST', { name: 'Peachtree Bakery', email: 'hi@peachtree.test', type: 'Bakery / Dessert Shop', notes: 'Fresh bread daily.' }));
    await signIn(admin);
    const id = (await (await projectsGET()).json()).projects[0].id;
    const start = await (await buildPOST(jsonReq('/x', 'POST', { projectId: id, autoApprove: true }))).json();
    let v = start.job; for (let i = 0; i < 10 && v.status === 'running'; i++) v = (await (await runPOST(jsonReq('/x', 'POST', {}), P(v.id))).json()).job;
    expect(v.status).toBe('done');
    expect((await getProject(id)).status).toBe('generated');
  });
});

describe('settings and AI configuration', () => {
  it('admin saves the model configuration; designers see no secrets', async () => {
    await signIn(admin);
    const res = await settingsPATCH(jsonReq('/x', 'PATCH', { anthropicKey: 'sk-ant-real', aiPreset: 'custom', aiMaxOutputTokens: 999999, aiPageConcurrency: 99, aiTaskModels: { page: { model: 'claude-opus-4-8', effort: 'high', thinking: 'adaptive' }, bogus: { model: 'x' }, seo: { model: 'claude-haiku-4-5-20251001', effort: 'ludicrous' } }, aiPricing: { 'claude-opus-4-8': { input: '4', output: '20' }, bad: { input: 'x' } }, aiModelCatalog: { models: [{ id: 'injected' }] } }));
    expect(res.status).toBe(200);
    const s = await getSettings();
    expect(s.aiMaxOutputTokens).toBe(128000);
    expect(s.aiPageConcurrency).toBe(4);
    expect(s.aiTaskModels).toEqual({ page: { model: 'claude-opus-4-8', effort: 'high', thinking: 'adaptive' }, seo: { model: 'claude-haiku-4-5-20251001', thinking: 'off' } });
    expect(s.aiPricing).toEqual({ 'claude-opus-4-8': { input: 4, output: 20 } });
    expect(s.aiModelCatalog).toBeUndefined();
    const ai = (await (await aiGET()).json()).ai;
    expect(ai.models.map(m => m.id)).toEqual(['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']);
    expect(ai.preset).toBe('custom');
    expect(ai.models[0].pricing).toMatchObject({ input: 4, output: 20, custom: true });

    const designer = await makeUser('designer');
    await signIn(designer);
    const seen = await (await settingsGET()).json();
    expect(seen.redacted).toBe(true);
    expect(seen.settings.anthropicKey).toBe('••••set');
    expect((await settingsPATCH(jsonReq('/x', 'PATCH', { anthropicKey: 'stolen' }))).status).toBe(403);
    expect((await aiPOST()).status).toBe(403);
  });

  it('refreshes model capabilities from Anthropic and handles a retired model', async () => {
    await signIn(admin);
    await saveSettings({ anthropicKey: 'sk-ant-real' });
    mockAnthropic(() => ({ data: [
      { id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8', max_tokens: 128000, max_input_tokens: 1000000, capabilities: { thinking: { supported: true, types: { adaptive: { supported: true }, enabled: { supported: false } } }, effort: { supported: true, low: { supported: true }, medium: { supported: true }, high: { supported: true }, xhigh: { supported: true }, max: { supported: true } } } },
      { id: 'claude-haiku-4-5-20251001', display_name: 'Claude Haiku 4.5', max_tokens: 64000, capabilities: { thinking: { supported: true, types: { adaptive: { supported: false }, enabled: { supported: true } } } } }
    ], has_more: false }));
    const d = await (await aiPOST()).json();
    expect(d.discovered).toBe(2);
    const sonnet = d.ai.models.find(m => m.id === 'claude-sonnet-4-6');
    expect(sonnet.available).toBe(false);                   // not on this account any more
    expect(d.ai.catalogFetchedAt).toBeGreaterThan(0);
  });

  it('design presets can be saved, renamed, reused and deleted', async () => {
    await signIn(admin);
    const dir = normalizeDirection({ seed: 3, personalities: ['Editorial'], customPrompt: 'Warm neutrals.', locks: { palette: true } }, {});
    expect((await presetsPOST(jsonReq('/x', 'POST', { name: '', direction: dir }))).status).toBe(400);
    const made = await (await presetsPOST(jsonReq('/x', 'POST', { name: 'Warm editorial', direction: dir }))).json();
    expect(made.preset.config.seed).toBeUndefined();
    expect(made.preset.config.locks).toEqual({ palette: true });
    await presetPATCH(jsonReq('/x', 'PATCH', { name: 'Warm editorial v2' }), P(made.preset.id));
    const list = (await (await presetsGET()).json()).presets;
    expect(list[0]).toMatchObject({ name: 'Warm editorial v2' });
    expect(list[0].config.customPrompt).toBe('Warm neutrals.');
    await presetDELETE(jsonReq('/x', 'DELETE'), P(made.preset.id));
    expect((await (await presetsGET()).json()).presets).toHaveLength(0);
  });
});

describe('launch, live publishing and rollback (Vercel API simulated)', () => {
  function fakeVercel({ failDeploy = () => false } = {}) {
    const deployments = [];
    vi.stubGlobal('fetch', async (url, init = {}) => {
      const u = String(url);
      const j = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
      if (!u.startsWith('https://api.vercel.com')) return new Response('', { status: 200 });
      if (/\/v13\/deployments\?/.test(u) && init.method === 'POST') {
        if (failDeploy()) return j({ error: { message: 'deploy quota exceeded' } }, 402);
        const body = JSON.parse(init.body);
        deployments.push(body);
        return j({ id: 'dpl_' + deployments.length, url: `${body.name}-${deployments.length}.vercel.app`, readyState: 'READY' });
      }
      if (/\/v13\/deployments\/dpl_/.test(u)) return j({ id: u.match(/dpl_\d+/)[0], url: 'x.vercel.app', readyState: 'READY' });
      if (/\/v9\/projects\/[^/]+\/domains\//.test(u)) return j({ verified: true });
      if (/\/v6\/domains\//.test(u)) return j({ misconfigured: false });
      if (/\/domains/.test(u)) return j({ name: 'x' });
      return j({ id: 'prj_1', name: 'x' });
    });
    return deployments;
  }
  const filesOf = dep => Object.fromEntries(dep.files.map(f => [f.file, Buffer.from(f.data, 'base64').toString('utf8')]));

  async function built() {
    const p = sampleProject('p_' + Math.random().toString(36).slice(2, 8), { status: 'paid' });
    const now = Date.now();
    await sql`INSERT INTO projects (id, owner_id, data, created_at, updated_at) VALUES (${p.id}, NULL, ${JSON.stringify(p)}::jsonb, ${now}, ${now})`;
    const start = await (await buildPOST(jsonReq('/x', 'POST', { projectId: p.id, autoApprove: true }))).json();
    let v = start.job; for (let i = 0; i < 10 && v.status === 'running'; i++) v = (await (await runPOST(jsonReq('/x', 'POST', {}), P(v.id))).json()).job;
    return { id: p.id, site: await getSiteByProject(p.id) };
  }

  it('launches every page to the customer domain, republishes on edit, and rolls back', async () => {
    await signIn(admin);
    await saveSettings({ vercelToken: 'vt', previewDomain: '499web.co' });
    const { id, site } = await built();
    expect((await launchPOST(jsonReq('/x', 'POST', { projectId: id, domain: 'summitridge.test' }))).status).toBe(400);   // must be published first
    await publishPOST(jsonReq('/x', 'POST', { projectId: id }));
    const deployments = fakeVercel();

    const launch = await (await launchPOST(jsonReq('/x', 'POST', { projectId: id, domain: 'summitridge.test' }))).json();
    expect(launch.launch).toMatchObject({ domain: 'summitridge.test', projectName: 'wfl-summit-ridge-roofing' });
    const f1 = filesOf(deployments[0]);
    expect(Object.keys(f1)).toEqual(expect.arrayContaining(['index.html', 'about/index.html', 'services/index.html', 'contact/index.html', 'assets/site.css', 'assets/site.js', '404.html', 'sitemap.xml', 'robots.txt', 'vercel.json']));
    expect(f1['index.html']).toContain('href="/services/"');                         // root-relative on its own domain
    expect(f1['index.html']).toContain('<link rel="canonical" href="https://summitridge.test/">');
    expect(f1['index.html']).toContain('data-forms="https://499web.co/api/forms/' + site.id + '"');   // forms post back to the platform
    expect(f1['sitemap.xml']).toContain('https://summitridge.test/about/');
    expect(JSON.parse(f1['vercel.json']).trailingSlash).toBe(true);
    expect(Object.keys(f1)).not.toContain('_site.json');
    let p = await getProject(id);
    expect(p.status).toBe('launched');
    const v1 = (await getSite(site.id)).liveVersionId;
    expect(v1).toBe((await getSite(site.id)).publishedVersionId);

    // edit + publish → the live domain is redeployed with the change
    const model = (await (await siteGET(jsonReq('/x'), P(site.id))).json()).site;
    const home = model.pages[0];
    await sitePATCH(jsonReq('/x', 'PATCH', { rev: model.rev, ops: [{ op: 'field.set', pageId: home.id, sectionId: home.sections[0].id, key: 'title', value: { html: 'Now live with edits' } }, { op: 'page.update', pageId: model.pages.find(x => x.slug === 'services').id, slug: 'what-we-do' }] }), P(site.id));
    const pub = await (await sitePublishPOST(jsonReq('/x', 'POST', {}), P(site.id))).json();
    expect(pub.live).toEqual({ ok: true, url: 'https://summitridge.test' });
    const f2 = filesOf(deployments[1]);
    expect(f2['index.html']).toContain('Now live with edits');
    expect(JSON.parse(f2['vercel.json']).redirects).toContainEqual({ source: '/services', destination: '/what-we-do/', permanent: true });
    const v2 = (await getSite(site.id)).liveVersionId;
    expect(v2).not.toBe(v1);

    // rollback → the previous version is deployed again
    const rb = await (await versionsPOST(jsonReq('/x', 'POST', { action: 'rollback', versionId: v1 }), P(site.id))).json();
    expect(rb.live.ok).toBe(true);
    expect(filesOf(deployments[2])['index.html']).not.toContain('Now live with edits');
    expect((await getSite(site.id)).liveVersionId).toBe(v1);
  });

  it('a failed deployment never takes the live site down and is reported plainly', async () => {
    await signIn(admin);
    await saveSettings({ vercelToken: 'vt' });
    const { id, site } = await built();
    await publishPOST(jsonReq('/x', 'POST', { projectId: id }));
    let fail = false;
    const deployments = fakeVercel({ failDeploy: () => fail });
    await launchPOST(jsonReq('/x', 'POST', { projectId: id, domain: 'summitridge.test' }));
    const liveBefore = (await getSite(site.id)).liveVersionId;
    fail = true;
    const model = (await (await siteGET(jsonReq('/x'), P(site.id))).json()).site;
    await sitePATCH(jsonReq('/x', 'PATCH', { rev: model.rev, ops: [{ op: 'field.set', pageId: model.pages[0].id, sectionId: model.pages[0].sections[0].id, key: 'title', value: { html: 'Edit that fails to deploy' } }] }), P(site.id));
    const pub = await (await sitePublishPOST(jsonReq('/x', 'POST', {}), P(site.id))).json();
    expect(pub.live.ok).toBe(false);
    expect(pub.live.error).toMatch(/previous live version is still online/);
    expect(pub.live.error).not.toMatch(/quota|Vercel/);                              // no internals leaked to a customer
    expect(deployments).toHaveLength(1);                                              // nothing new went out
    const s = await getSite(site.id);
    expect(s.liveVersionId).toBe(liveBefore);                                        // live pointer unchanged
    expect(s.publishedVersionId).not.toBe(liveBefore);                               // preview has the new version
    const events = await sql`SELECT type FROM site_events WHERE site_id = ${site.id} AND type = 'deploy.failed'`;
    expect(events).toHaveLength(1);
  });
});

describe('scheduled job resume', () => {
  it('is disabled without a secret and resumes an abandoned job with one', async () => {
    await signIn(admin);
    const p = sampleProject('p_cron');
    const now = Date.now();
    await sql`INSERT INTO projects (id, owner_id, data, created_at, updated_at) VALUES (${p.id}, NULL, ${JSON.stringify(p)}::jsonb, ${now}, ${now})`;
    const start = await (await buildPOST(jsonReq('/x', 'POST', { projectId: p.id, autoApprove: true }))).json();
    await sql`UPDATE jobs SET updated_at = ${now - 600000} WHERE id = ${start.job.id}`;
    signOut();
    expect((await cronGET(jsonReq('/x'))).status).toBe(404);
    process.env.CRON_SECRET = 'cron-secret';
    expect((await cronGET(jsonReq('/x', 'GET', undefined, { authorization: 'Bearer wrong' }))).status).toBe(404);
    const res = await (await cronGET(jsonReq('/x', 'GET', undefined, { authorization: 'Bearer cron-secret' }))).json();
    expect(res).toMatchObject({ resumed: 1, job: { status: 'done' } });
    expect((await (await cronGET(jsonReq('/x', 'GET', undefined, { authorization: 'Bearer cron-secret' }))).json()).resumed).toBe(0);
  });
});
