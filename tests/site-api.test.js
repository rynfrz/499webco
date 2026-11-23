import { describe, it, expect, beforeEach } from 'vitest';
import { sql, getProject, saveSettings } from '@/lib/db';
import { freshDb, makeUser, signIn, signOut, jsonReq } from './helpers';
import { sampleProject } from './fixtures';
import { fakeStudio } from './studio';
import { POST as buildPOST } from '@/app/api/sites/build/route';
import { POST as runPOST } from '@/app/api/jobs/[id]/run/route';
import { POST as actionPOST } from '@/app/api/jobs/[id]/action/route';
import { GET as jobGET } from '@/app/api/jobs/[id]/route';
import { GET as jobsGET } from '@/app/api/jobs/route';
import { GET as siteGET, PATCH as sitePATCH } from '@/app/api/sites/[id]/route';
import { GET as renderGET } from '@/app/api/sites/[id]/render/route';
import { GET as draftPreviewGET } from '@/app/api/sites/[id]/preview/[[...path]]/route';
import { POST as sitePublishPOST } from '@/app/api/sites/[id]/publish/route';
import { GET as versionsGET, POST as versionsPOST } from '@/app/api/sites/[id]/versions/route';
import { POST as qaPOST } from '@/app/api/sites/[id]/qa/route';
import { POST as publishPOST } from '@/app/api/publish/route';
import { GET as previewGET } from '@/app/preview/[slug]/route';
import { GET as previewPathGET } from '@/app/preview/[slug]/[...path]/route';
import { GET as reviewGET } from '@/app/api/review/[token]/route';
import { POST as approvePOST } from '@/app/api/approve/route';
import { PATCH as projectPATCH, GET as projectGET, DELETE as projectDELETE } from '@/app/api/projects/[id]/route';
import { GET as projectsGET } from '@/app/api/projects/route';
import { GET as sitesGET } from '@/app/api/sites/route';
import { getSiteByProject, ensureSite, getSite, publishSite, rollbackTo, listVersions } from '@/lib/site/store';

async function seedProject(over) {
  const p = sampleProject('p_' + Math.random().toString(36).slice(2, 8), over);
  const now = Date.now();
  await sql`INSERT INTO projects (id, owner_id, data, created_at, updated_at) VALUES (${p.id}, NULL, ${JSON.stringify(p)}::jsonb, ${now}, ${now})`;
  return p;
}
const P = id => ({ params: { id } });

async function buildSite(project) {
  const res = await buildPOST(jsonReq('/api/sites/build', 'POST', { projectId: project.id, autoApprove: true }));
  const { job } = await res.json();
  let v = job;
  for (let i = 0; i < 12 && v.status === 'running'; i++) v = (await (await runPOST(jsonReq('/x', 'POST', {}), P(job.id))).json()).job;
  return { job: v, site: await getSiteByProject(project.id) };
}

let admin;
beforeEach(async () => {
  await freshDb();
  globalThis.__wflNoRemote = true;
  admin = await makeUser('admin');
  await signIn(admin);
});

describe('admin build → edit → publish → serve → rollback (demo mode)', () => {
  it('runs the whole lifecycle through the HTTP routes', async () => {
    const project = await seedProject();
    const { job, site } = await buildSite(project);
    expect(job.status).toBe('done');

    // editor model
    let model = (await (await siteGET(jsonReq('/x'), P(site.id))).json()).site;
    expect(model.pages).toHaveLength(7);
    expect(model.published).toBe(false);
    const home = model.pages[0];
    expect(home.sections[0].fields.title).toEqual({ type: 'text' });   // metadata only, no template markup

    // authenticated draft preview, multi-page
    const draftHome = await draftPreviewGET(jsonReq('/x'), { params: { id: site.id, path: ['draft'] } });
    expect(draftHome.status).toBe(200);
    expect(draftHome.headers.get('content-security-policy')).toContain("script-src 'self'");
    const draftHtml = await draftHome.text();
    expect(draftHtml).toContain(`/api/sites/${site.id}/preview/draft/about"`);
    const draftAbout = await draftPreviewGET(jsonReq('/x'), { params: { id: site.id, path: ['draft', 'about'] } });
    expect(await draftAbout.text()).toContain('About Summit Ridge Roofing');
    const css = await draftPreviewGET(jsonReq('/x'), { params: { id: site.id, path: ['draft', 'assets', 'site.css'] } });
    expect(css.headers.get('content-type')).toContain('text/css');

    // nothing public yet
    expect((await previewGET(jsonReq('/x'), { params: { slug: site.slug } })).status).toBe(404);

    // publish through the ORIGINAL publish route
    const pub = await (await publishPOST(jsonReq('/api/publish', 'POST', { projectId: project.id }))).json();
    expect(pub.publish.directUrl).toBe(`/preview/${site.slug}/`);
    expect(pub.pages).toBe(7);
    expect(pub.reviewUrl).toMatch(/\/review\/[0-9a-f]{32}$/);
    const p1 = await getProject(project.id);
    expect(p1.status).toBe('published');
    expect(p1.publish.slug).toBe(site.slug);

    // public multi-page serving
    const liveHome = await previewGET(jsonReq('/x'), { params: { slug: site.slug } });
    expect(liveHome.status).toBe(200);
    const liveHtml = await liveHome.text();
    expect(liveHtml).toContain(`href="/preview/${site.slug}/services"`);
    expect(liveHtml).toContain(`data-forms="http://localhost:3000/api/forms/${site.id}"`);
    const svc = await previewPathGET(jsonReq('/x'), { params: { slug: site.slug, path: ['services'] } });
    expect(await svc.text()).toContain('What we offer');
    expect((await previewPathGET(jsonReq('/x'), { params: { slug: site.slug, path: ['assets', 'site.js'] } })).headers.get('content-type')).toContain('javascript');
    const missing = await previewPathGET(jsonReq('/x'), { params: { slug: site.slug, path: ['nope'] } });
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain('find that page');
    expect((await previewPathGET(jsonReq('/x'), { params: { slug: site.slug, path: ['..', 'secret'] } })).status).toBe(404);

    // edit a headline in the draft: the published site does not change
    const v1 = (await getSite(site.id)).publishedVersionId;
    model = (await (await siteGET(jsonReq('/x'), P(site.id))).json()).site;
    const patch = await sitePATCH(jsonReq('/x', 'PATCH', { rev: model.rev, ops: [{ op: 'field.set', pageId: home.id, sectionId: home.sections[0].id, key: 'title', value: { html: 'A brand new headline' } }] }), P(site.id));
    expect(patch.status).toBe(200);
    const rev2 = (await patch.json()).rev;
    expect(rev2).toBe(model.rev + 1);
    expect(await (await previewGET(jsonReq('/x'), { params: { slug: site.slug } })).text()).not.toContain('A brand new headline');
    expect((await getSite(site.id)).draftDirty).toBe(true);
    // editor canvas reflects the draft and carries the bridge
    const canvas = await (await renderGET(jsonReq(`/x?page=${home.id}`), P(site.id))).json();
    expect(canvas.html).toContain('A brand new headline');
    expect(canvas.html).toContain('data-editor-role="staff"');
    expect(canvas.html).toContain('wfl-bar');

    // stale revision is rejected (two editors)
    const stale = await sitePATCH(jsonReq('/x', 'PATCH', { rev: model.rev, ops: [{ op: 'field.set', pageId: home.id, sectionId: home.sections[0].id, key: 'title', value: { html: 'Lost update' } }] }), P(site.id));
    expect(stale.status).toBe(409);

    // publish v2, then roll back to v1
    const pub2 = await (await sitePublishPOST(jsonReq('/x', 'POST', {}), P(site.id))).json();
    expect(pub2.previous).toBe(v1);
    expect(await (await previewGET(jsonReq('/x'), { params: { slug: site.slug } })).text()).toContain('A brand new headline');
    expect((await getSite(site.id)).draftDirty).toBe(false);
    const hist = await (await versionsGET(jsonReq('/x'), P(site.id))).json();
    expect(hist.versions.filter(v => v.kind === 'publish')).toHaveLength(2);
    expect(hist.events.map(e => e.type)).toEqual(expect.arrayContaining(['site.published', 'site.generated']));
    const rb = await versionsPOST(jsonReq('/x', 'POST', { action: 'rollback', versionId: v1 }), P(site.id));
    expect(rb.status).toBe(200);
    const after = await (await previewGET(jsonReq('/x'), { params: { slug: site.slug } })).text();
    expect(after).not.toContain('A brand new headline');
    expect((await getSite(site.id)).publishedVersionId).toBe(v1);
    // the rolled-back-from draft is kept as a restore point
    expect((await listVersions(site.id)).some(v => v.label === 'Before rollback')).toBe(true);

    // QA endpoint + lists
    const qa = await (await qaPOST(jsonReq('/x', 'POST', { fix: true }), P(site.id))).json();
    expect(qa.qa.summary.errors).toBe(0);
    expect((await (await sitesGET()).json()).sites[0]).toMatchObject({ businessName: 'Summit Ridge Roofing', published: true, pages: 7, legacy: false });
    expect((await (await jobsGET(jsonReq('/api/jobs'))).json()).jobs).toHaveLength(1);
    expect((await (await projectsGET()).json()).projects[0]).toMatchObject({ hasSite: true, engine: 'v2' });
  });

  it('a failed publish leaves the live site untouched', async () => {
    const project = await seedProject();
    const { site } = await buildSite(project);
    await publishPOST(jsonReq('/api/publish', 'POST', { projectId: project.id }));
    const v1 = (await getSite(site.id)).publishedVersionId;
    const before = await (await previewGET(jsonReq('/x'), { params: { slug: site.slug } })).text();
    // Corrupt the draft so it cannot validate (no pages).
    await sql`UPDATE sites SET draft = jsonb_set(draft, '{pages}', '[]'::jsonb) WHERE id = ${site.id}`;
    const res = await sitePublishPOST(jsonReq('/x', 'POST', {}), P(site.id));
    expect(res.status).toBe(400);
    expect((await getSite(site.id)).publishedVersionId).toBe(v1);
    expect(await (await previewGET(jsonReq('/x'), { params: { slug: site.slug } })).text()).toBe(before);
  });

  it('page address changes publish a working redirect', async () => {
    const project = await seedProject();
    const { site } = await buildSite(project);
    await publishPOST(jsonReq('/api/publish', 'POST', { projectId: project.id }));
    const model = (await (await siteGET(jsonReq('/x'), P(site.id))).json()).site;
    const services = model.pages.find(p => p.slug === 'services');
    await sitePATCH(jsonReq('/x', 'PATCH', { rev: model.rev, ops: [{ op: 'page.update', pageId: services.id, slug: 'what-we-do' }] }), P(site.id));
    await sitePublishPOST(jsonReq('/x', 'POST', {}), P(site.id));
    const old = await previewPathGET(jsonReq('/x'), { params: { slug: site.slug, path: ['services'] } });
    expect(old.status).toBe(308);
    expect(old.headers.get('location')).toBe(`/preview/${site.slug}/what-we-do`);
    expect((await previewPathGET(jsonReq('/x'), { params: { slug: site.slug, path: ['what-we-do'] } })).status).toBe(200);
  });
});

describe('existing (classic) projects keep working', () => {
  const LEGACY = '<!doctype html><html><head><title>Old</title><style>body{color:red}</style></head><body><header><a href="#a">A</a></header><section id="a"><h1>Classic site</h1><p>Hello</p></section><footer>bye</footer><script>console.log(1)</script></body></html>';

  it('classic publish, review and approve are unchanged', async () => {
    const project = await seedProject({ generatedHtml: LEGACY, status: 'generated' });
    const pub = await (await publishPOST(jsonReq('/api/publish', 'POST', { projectId: project.id }))).json();
    expect(pub.publish.directUrl).toBe('/preview/summit-ridge-roofing/');
    const html = await (await previewGET(jsonReq('/x'), { params: { slug: 'summit-ridge-roofing' } })).text();
    expect(html).toBe(LEGACY);
    const p = await getProject(project.id);
    signOut(); // the client is not signed in
    const review = await (await reviewGET(jsonReq('/x'), { params: { token: p.reviewToken } })).json();
    expect(review).toMatchObject({ hasSite: true, previewUrl: '/preview/summit-ridge-roofing/', approved: false });
    expect((await approvePOST(jsonReq('/x', 'POST', { token: p.reviewToken }))).status).toBe(200);
    expect((await getProject(project.id)).status).toBe('approved');
  });

  it('a classic site becomes a rollback-able "legacy" version when a site record is created', async () => {
    const project = await seedProject({ generatedHtml: LEGACY, status: 'published', publish: { slug: 'summit-ridge-roofing' } });
    await sql`INSERT INTO previews (slug, business_name, html, published_at) VALUES ('summit-ridge-roofing', 'Summit', ${LEGACY}, ${Date.now()})`;
    const site = await ensureSite(await getProject(project.id), { createdBy: admin.id });
    expect(site.status).toBe('legacy');
    expect(site.publishedVersionId).toBeTruthy();
    // still served byte-for-byte
    expect(await (await previewGET(jsonReq('/x'), { params: { slug: site.slug } })).text()).toBe(LEGACY);
    const versions = await listVersions(site.id);
    expect(versions[0]).toMatchObject({ kind: 'legacy', label: 'Original single-page site' });
    // editing is refused until it is converted or upgraded
    const res = await sitePATCH(jsonReq('/x', 'PATCH', { ops: [{ op: 'page.add', title: 'X' }] }), P(site.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Platform Conversion/);
  });

  it('a v2 site reaches the client review + approve flow', async () => {
    const project = await seedProject();
    await buildSite(project);
    await publishPOST(jsonReq('/api/publish', 'POST', { projectId: project.id }));
    const p = await getProject(project.id);
    expect(p.generatedHtml).toBeFalsy();
    signOut();
    const review = await (await reviewGET(jsonReq('/x'), { params: { token: p.reviewToken } })).json();
    expect(review.hasSite).toBe(true);
    expect((await approvePOST(jsonReq('/x', 'POST', { token: p.reviewToken }))).status).toBe(200);
  });
});

describe('project autosave cannot undo server-side changes', () => {
  it('keeps site linkage, payment and lifecycle status', async () => {
    const project = await seedProject({ status: 'draft' });
    const stale = structuredClone(project);          // an open browser tab
    await buildSite(project);
    await sql`UPDATE projects SET data = data || ${JSON.stringify({ status: 'paid', payment: { paidAt: 1, amount: 49900 } })}::jsonb WHERE id = ${project.id}`;
    stale.business.tagline = 'Edited in the stale tab';
    expect((await projectPATCH(jsonReq('/x', 'PATCH', stale), P(project.id))).status).toBe(200);
    const p = (await (await projectGET(jsonReq('/x'), P(project.id))).json()).project;
    expect(p.business.tagline).toBe('Edited in the stale tab');
    expect(p.status).toBe('paid');
    expect(p.payment.amount).toBe(49900);
    expect(p.siteEngine).toBe('v2');
    expect(p.siteId).toBeTruthy();
  });

  it('deleting a project removes its site data', async () => {
    const project = await seedProject();
    const { site } = await buildSite(project);
    await publishPOST(jsonReq('/api/publish', 'POST', { projectId: project.id }));
    await projectDELETE(jsonReq('/x', 'DELETE'), P(project.id));
    expect(await getSite(site.id)).toBeNull();
    expect((await sql`SELECT COUNT(*)::int AS n FROM site_files`)[0].n).toBe(0);
  });
});

describe('access control on studio routes', () => {
  it('rejects anonymous users and customer accounts', async () => {
    const project = await seedProject();
    const { site } = await buildSite(project);
    const customer = await makeUser('customer');
    for (const who of ['anon', 'customer']) {
      if (who === 'anon') signOut(); else await signIn(customer);
      const expected = who === 'anon' ? 401 : [403, 404];
      const check = async (res, label) => expect([].concat(expected), `${who} ${label}`).toContain(res.status);
      await check(await buildPOST(jsonReq('/x', 'POST', { projectId: project.id })), 'build');
      await check(await siteGET(jsonReq('/x'), P(site.id)), 'site');
      await check(await sitePATCH(jsonReq('/x', 'PATCH', { ops: [{ op: 'page.add', title: 'X' }] }), P(site.id)), 'edit');
      await check(await sitePublishPOST(jsonReq('/x', 'POST', {}), P(site.id)), 'publish');
      await check(await projectGET(jsonReq('/x'), P(project.id)), 'project');
      await check(await projectsGET(), 'projects');
      await check(await sitesGET(), 'sites');
      await check(await jobsGET(jsonReq('/api/jobs')), 'jobs');
      await check(await publishPOST(jsonReq('/x', 'POST', { projectId: project.id })), 'legacy publish');
      await check(await qaPOST(jsonReq('/x', 'POST', {}), P(site.id)), 'qa');
      const prev = await draftPreviewGET(jsonReq('/x'), { params: { id: site.id, path: ['draft'] } });
      expect([401, 404]).toContain(prev.status);
    }
  });
});
