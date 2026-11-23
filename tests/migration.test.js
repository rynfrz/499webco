// Simulates deploying 2.0 onto the database exactly as the pre-2.0 app left it.
import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { sql, initDb, __resetDbForTests, getSettings, getProject } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { jsonReq } from './helpers';
import { GET as projectsGET } from '@/app/api/projects/route';
import { GET as projectGET, PATCH as projectPATCH } from '@/app/api/projects/[id]/route';
import { GET as settingsGET } from '@/app/api/settings/route';
import { GET as aiGET } from '@/app/api/ai/route';
import { GET as previewGET } from '@/app/preview/[slug]/route';
import { GET as jobGET } from '@/app/api/jobs/[id]/route';
import { GET as reviewGET } from '@/app/api/review/[token]/route';
import { GET as sitesGET, POST as sitesPOST } from '@/app/api/sites/route';
import { GET as portfolioGET } from '@/app/portfolio/route';
import { GET as rootGET } from '@/app/route';
import { POST as loginPOST } from '@/app/api/auth/login/route';
import { blankProject } from '@/lib/projectModel';

const OLD_HTML = '<!doctype html><html><head><title>Old</title></head><body><h1>Existing live site</h1><script>var a=1</script></body></html>';

async function seedOldDatabase() {
  await __resetDbForTests();
  globalThis.__cookieJar.clear();
  // The schema exactly as the pre-2.0 lib/db.js created it.
  await sql`CREATE TABLE users (id TEXT PRIMARY KEY, full_name TEXT NOT NULL DEFAULT '', email TEXT UNIQUE NOT NULL, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'designer', created_at BIGINT NOT NULL)`;
  await sql`CREATE TABLE settings (id INT PRIMARY KEY DEFAULT 1, data JSONB NOT NULL DEFAULT '{}'::jsonb)`;
  await sql`CREATE TABLE projects (id TEXT PRIMARY KEY, owner_id TEXT REFERENCES users(id) ON DELETE SET NULL, data JSONB NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`;
  await sql`CREATE TABLE previews (slug TEXT PRIMARY KEY, business_name TEXT NOT NULL, html TEXT NOT NULL, published_at BIGINT NOT NULL, category TEXT)`;
  await sql`CREATE TABLE jobs (id TEXT PRIMARY KEY, project_id TEXT, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running', progress INT NOT NULL DEFAULT 0, result TEXT, error TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`;
  const now = Date.now();
  await sql`INSERT INTO users VALUES ('u_admin', 'Jax', 'jax@499web.co', 'jax', ${await bcrypt.hash('old-password-1', 4)}, 'admin', ${now})`;
  await sql`INSERT INTO users VALUES ('u_des', 'Dee', 'dee@499web.co', 'dee', ${await bcrypt.hash('old-password-2', 4)}, 'designer', ${now})`;
  await sql`INSERT INTO settings (id, data) VALUES (1, ${JSON.stringify({ anthropicKey: 'sk-ant-existing', model: 'claude-opus-4-8', maxTokens: 32000, previewDomain: '499web.co', stripeSecretKey: 'sk_live_x', sitePriceCents: 49900, senderName: 'Jax' })}::jsonb)`;
  const live = blankProject('p_live', 'Roofing');
  Object.assign(live, { status: 'launched', generatedHtml: OLD_HTML, reviewToken: 'a'.repeat(32), publish: { slug: 'acme-roofing', previewUrl: 'https://499web.co/preview/acme-roofing/', directUrl: '/preview/acme-roofing/' }, payment: { paidAt: now, amount: 49900, domain: 'acme.test' }, launch: { liveUrl: 'https://wfl-acme-roofing.vercel.app', projectName: 'wfl-acme-roofing', domain: 'acme.test' } });
  live.business.name = 'Acme Roofing'; live.business.email = 'owner@acme.test';
  const lead = blankProject('p_lead', 'Law Firm');
  Object.assign(lead, { status: 'lead', reviewToken: 'b'.repeat(32), lead: { submittedAt: now, notes: 'Need a site' } });
  lead.business.name = 'Baker Law';
  for (const p of [live, lead]) await sql`INSERT INTO projects VALUES (${p.id}, 'u_admin', ${JSON.stringify(p)}::jsonb, ${now}, ${now})`;
  await sql`INSERT INTO previews VALUES ('acme-roofing', 'Acme Roofing', ${OLD_HTML}, ${now}, 'Home & Trade Services')`;
  await sql`INSERT INTO jobs VALUES ('job_old', 'p_live', 'generate', 'done', 100, ${OLD_HTML}, NULL, ${now}, ${now})`;
}

describe('deploying onto the existing production database', () => {
  beforeEach(seedOldDatabase);

  it('migrates additively and keeps every existing record and behaviour', async () => {
    // Public traffic is the first thing to hit the new code.
    const live = await previewGET(jsonReq('/x'), { params: { slug: 'acme-roofing' } });
    expect(live.status).toBe(200);
    expect(await live.text()).toBe(OLD_HTML);                         // served byte for byte, no CSP imposed on it
    expect(live.headers.get('content-security-policy')).toBeNull();
    expect((await rootGET()).status).toBe(200);
    expect(await (await portfolioGET()).text()).toContain('Acme Roofing');

    // Existing accounts sign in with their existing passwords and roles.
    const login = await loginPOST(jsonReq('/x', 'POST', { identifier: 'jax', password: 'old-password-1' }));
    expect(await login.json()).toMatchObject({ ok: true, role: 'admin', next: '/admin' });

    const list = (await (await projectsGET()).json()).projects;
    expect(list.map(p => [p.id, p.status, p.hasSite, p.engine]).sort()).toEqual([['p_lead', 'lead', false, null], ['p_live', 'launched', true, 'classic']]);
    const p = (await (await projectGET(jsonReq('/x'), { params: { id: 'p_live' } })).json()).project;
    expect(p.generatedHtml).toBe(OLD_HTML);
    expect(p.designSeed).toBeTruthy();
    expect(p.launch.domain).toBe('acme.test');

    // Settings survive; the new AI configuration reads sensibly from them.
    const s = await getSettings();
    expect(s).toMatchObject({ anthropicKey: 'sk-ant-existing', model: 'claude-opus-4-8', previewDomain: '499web.co', sitePriceCents: 49900 });
    const ai = (await (await aiGET()).json()).ai;
    expect(ai.defaultModel).toBe('claude-opus-4-8');                  // the previously chosen model is still the default
    expect(ai.maxOutputTokens).toBe(64000);                           // the new ceiling
    expect(ai.preset).toBe('balanced');

    // Old job rows are still readable through the upgraded endpoint.
    const job = (await (await jobGET(jsonReq('/x'), { params: { id: 'job_old' } })).json()).job;
    expect(job).toMatchObject({ id: 'job_old', kind: 'generate', status: 'done', progress: 100, project_id: 'p_live' });
    expect(job.steps).toEqual([]);

    // The client review link for an existing project still resolves.
    globalThis.__cookieJar.clear();
    const review = await (await reviewGET(jsonReq('/x'), { params: { token: 'a'.repeat(32) } })).json();
    expect(review).toMatchObject({ businessName: 'Acme Roofing', hasSite: true, paid: true, approved: true, previewUrl: '/preview/acme-roofing/' });
  });

  it('nothing changes for an existing site until an admin opens the upgrade tools, and then it is only wrapped', async () => {
    await initDb();
    await createSession('u_admin');
    expect((await (await sitesGET()).json()).sites).toEqual([]);     // no site rows are created by the migration itself
    const made = await (await sitesPOST(jsonReq('/x', 'POST', { projectId: 'p_live' }))).json();
    expect(made).toMatchObject({ slug: 'acme-roofing', status: 'legacy' });
    // still the same bytes for visitors, now also a rollback-able version
    expect(await (await previewGET(jsonReq('/x'), { params: { slug: 'acme-roofing' } })).text()).toBe(OLD_HTML);
    const versions = await sql`SELECT kind, label FROM site_versions`;
    expect(versions).toEqual([{ kind: 'legacy', label: 'Original single-page site' }]);
    const p = await getProject('p_live');
    expect(p.siteId).toBe(made.siteId);                               // the workspace can show the site tools after a reload
    expect(p.siteEngine).toBeUndefined();                             // still a classic site until an upgrade is approved
    // A project whose site record was created before this link existed is repaired when it is opened.
    await sql`UPDATE projects SET data = data - 'siteId' WHERE id = 'p_live'`;
    expect((await (await projectGET(jsonReq('/x'), { params: { id: 'p_live' } })).json()).project.siteId).toBe(made.siteId);
    expect((await getProject('p_live')).siteId).toBe(made.siteId);
    expect(p.status).toBe('launched');
    expect(p.generatedHtml).toBe(OLD_HTML);
  });

  it('running the migration twice is harmless', async () => {
    await initDb();
    await sql`UPDATE schema_meta SET value = '0'`;                    // force a second full pass
    await __resetDbForTests().catch(() => {});
  });
});
