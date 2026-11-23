import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { sql, getProject, saveSettings } from '@/lib/db';
import { freshDb, makeUser, signIn, signOut, jsonReq } from './helpers';
import { sampleProject } from './fixtures';
import { inviteCustomer, redeemToken, requestPasswordReset, inviteInfo, validPassword, listMembers, revokeMember } from '@/lib/customers';
import { startSiteBuild, runJob } from '@/lib/gen/pipeline';
import { getSiteByProject, getSite, publishSite } from '@/lib/site/store';
import { currentUser } from '@/lib/auth';
import { GET as siteGET, PATCH as sitePATCH } from '@/app/api/sites/[id]/route';
import { GET as renderGET } from '@/app/api/sites/[id]/render/route';
import { GET as draftPreviewGET } from '@/app/api/sites/[id]/preview/[[...path]]/route';
import { POST as sitePublishPOST } from '@/app/api/sites/[id]/publish/route';
import { GET as versionsGET, POST as versionsPOST } from '@/app/api/sites/[id]/versions/route';
import { GET as mediaGET, POST as mediaPOST } from '@/app/api/sites/[id]/media/route';
import { GET as messagesGET } from '@/app/api/sites/[id]/messages/route';
import { GET as overviewGET } from '@/app/api/sites/[id]/overview/route';
import { POST as regenPOST } from '@/app/api/sites/[id]/regen/route';
import { POST as qaPOST } from '@/app/api/sites/[id]/qa/route';
import { POST as stagingPOST } from '@/app/api/sites/[id]/staging/route';
import { GET as sectionGET } from '@/app/api/sites/[id]/section/route';
import { GET as jobGET } from '@/app/api/jobs/[id]/route';
import { POST as jobRunPOST } from '@/app/api/jobs/[id]/run/route';
import { POST as jobActionPOST } from '@/app/api/jobs/[id]/action/route';
import { GET as meGET } from '@/app/api/customer/me/route';
import { GET as custProjectGET, PATCH as custProjectPATCH } from '@/app/api/customer/projects/[id]/route';
import { GET as supportGET, POST as supportPOST } from '@/app/api/customer/support/route';
import { GET as staffSupportGET, POST as staffSupportPOST } from '@/app/api/support/route';
import { GET as custAdminGET, POST as custAdminPOST } from '@/app/api/customer/admin/route';
import { GET as inviteGET, POST as invitePOST } from '@/app/api/customer/invite/[token]/route';
import { POST as resetRequestPOST } from '@/app/api/customer/reset/route';
import { POST as resetPOST } from '@/app/api/customer/reset/[token]/route';
import { POST as loginPOST } from '@/app/api/auth/login/route';
import { PATCH as accountPATCH } from '@/app/api/account/route';
import { POST as formPOST, OPTIONS as formOPTIONS } from '@/app/api/forms/[siteId]/route';
import { POST as beaconPOST } from '@/app/api/t/[siteId]/route';
import { POST as webhookPOST } from '@/app/api/stripe/webhook/route';
import { GET as projectsGET } from '@/app/api/projects/route';
import { GET as settingsGET } from '@/app/api/settings/route';
import { GET as usersGET } from '@/app/api/users/route';
import { POST as buildPOST } from '@/app/api/sites/build/route';
import { GET as aiGET } from '@/app/api/ai/route';

const P = id => ({ params: { id } });
const tokenOf = link => link.split('/').pop();
const PASSWORD = 'correct-horse-battery';

async function seedSite(name) {
  const p = sampleProject('p_' + Math.random().toString(36).slice(2, 8), { status: 'paid' });
  p.business.name = name;
  p.business.email = `${name.toLowerCase().replace(/\W+/g, '')}@example.test`;
  const now = Date.now();
  await sql`INSERT INTO projects (id, owner_id, data, created_at, updated_at) VALUES (${p.id}, NULL, ${JSON.stringify(p)}::jsonb, ${now}, ${now})`;
  const job = await startSiteBuild(p, { autoApprove: true }, null);
  let v; for (let i = 0; i < 10; i++) { v = await runJob(job.id); if (v.status !== 'running') break; }
  const site = await getSiteByProject(p.id);
  await publishSite(site.id, {});
  return { project: await getProject(p.id), site: await getSite(site.id) };
}

/** Invite + accept, returning a signed-in customer for a project. */
async function customerFor(project, email, role = 'owner') {
  const inv = await inviteCustomer(project.id, { email, role, origin: 'http://localhost:3000' });
  const userId = await redeemToken(tokenOf(inv.link), 'invite', { password: PASSWORD, fullName: 'Pat Owner' });
  return { id: userId, email };
}

let admin;
beforeEach(async () => { await freshDb(); globalThis.__wflNoRemote = true; admin = await makeUser('admin'); });

describe('customer accounts', () => {
  it('invite → set password → signed in, linked to the existing project', async () => {
    const { project } = await seedSite('Alpha Roofing');
    await signIn(admin);
    const res = await (await custAdminPOST(jsonReq('/x', 'POST', { projectId: project.id, action: 'invite', email: 'Owner@Alpha.test' }))).json();
    expect(res.link).toMatch(/\/welcome\/[\w-]{40,}$/);
    signOut();

    const token = tokenOf(res.link);
    const info = await (await inviteGET(jsonReq('/x'), { params: { token } })).json();
    expect(info).toEqual({ email: 'owner@alpha.test', businessName: 'Alpha Roofing' });
    expect((await invitePOST(jsonReq('/x', 'POST', { password: 'short' }), { params: { token } })).status).toBe(400);
    const ok = await invitePOST(jsonReq('/x', 'POST', { password: PASSWORD, fullName: 'Pat Owner' }), { params: { token } });
    expect(ok.status).toBe(200);
    const me = await currentUser();
    expect(me).toMatchObject({ email: 'owner@alpha.test', role: 'customer', full_name: 'Pat Owner' });
    // single use
    expect((await invitePOST(jsonReq('/x', 'POST', { password: PASSWORD }), { params: { token } })).status).toBe(400);
    expect(await inviteInfo(token)).toBeNull();
    // the same identity is recorded on the original lead/project record
    const p = await getProject(project.id);
    expect(p.customer).toMatchObject({ userId: me.id, email: 'owner@alpha.test' });
    expect(p.customer.acceptedAt).toBeTruthy();
    const web = await (await meGET()).json();
    expect(web.websites).toHaveLength(1);
    expect(web.websites[0]).toMatchObject({ projectId: project.id, name: 'Alpha Roofing', role: 'owner' });
  });

  it('expired and forged invite links are rejected', async () => {
    const { project } = await seedSite('Alpha Roofing');
    const inv = await inviteCustomer(project.id, { email: 'a@alpha.test', origin: '' });
    await sql`UPDATE auth_tokens SET expires_at = ${Date.now() - 1000}`;
    await expect(redeemToken(tokenOf(inv.link), 'invite', { password: PASSWORD })).rejects.toMatchObject({ status: 400 });
    await expect(redeemToken('x'.repeat(43), 'invite', { password: PASSWORD })).rejects.toMatchObject({ status: 400 });
    // an invite token cannot be used as a reset token
    const inv2 = await inviteCustomer(project.id, { email: 'a@alpha.test', origin: '' });
    await expect(redeemToken(tokenOf(inv2.link), 'reset', { password: PASSWORD })).rejects.toMatchObject({ status: 400 });
    // tokens are stored hashed
    const rows = await sql`SELECT token_hash FROM auth_tokens`;
    expect(rows[0].token_hash).not.toBe(tokenOf(inv2.link));
    expect(rows[0].token_hash).toBe(crypto.createHash('sha256').update(tokenOf(inv2.link)).digest('hex'));
  });

  it('a studio address cannot be turned into a customer, and weak passwords are refused', async () => {
    const { project } = await seedSite('Alpha Roofing');
    await expect(inviteCustomer(project.id, { email: admin.email, origin: '' })).rejects.toMatchObject({ status: 409 });
    await expect(inviteCustomer(project.id, { email: 'not-an-email', origin: '' })).rejects.toMatchObject({ status: 400 });
    expect(validPassword('aaaaaaaaaaaa')).toBeTruthy();
    expect(validPassword('short')).toBeTruthy();
    expect(validPassword(PASSWORD)).toBeNull();
  });

  it('password reset works and never reveals whether an address has an account', async () => {
    const { project } = await seedSite('Alpha Roofing');
    const c = await customerFor(project, 'owner@alpha.test');
    signOut();
    const a = await resetRequestPOST(jsonReq('/x', 'POST', { email: 'owner@alpha.test' }));
    const b = await resetRequestPOST(jsonReq('/x', 'POST', { email: 'nobody@nowhere.test' }));
    expect(await a.json()).toEqual(await b.json());
    expect(a.status).toBe(b.status);
    const rows = await sql`SELECT purpose FROM auth_tokens WHERE user_id = ${c.id}`;
    expect(rows.map(r => r.purpose)).toEqual(['reset']);
    // staff can generate a reset link; the customer uses it to choose a new password
    await signIn(admin);
    const r = await (await custAdminPOST(jsonReq('/x', 'POST', { projectId: project.id, action: 'resend', userId: c.id }))).json();
    signOut();
    expect((await resetPOST(jsonReq('/x', 'POST', { password: 'a-brand-new-passphrase' }), { params: { token: tokenOf(r.link) } })).status).toBe(200);
    signOut();
    expect((await loginPOST(jsonReq('/x', 'POST', { identifier: 'owner@alpha.test', password: PASSWORD }))).status).toBe(401);
    const login = await loginPOST(jsonReq('/x', 'POST', { identifier: 'owner@alpha.test', password: 'a-brand-new-passphrase' }));
    expect(await login.json()).toMatchObject({ ok: true, role: 'customer', next: '/dashboard' });
  });

  it('sign-in attempts are rate limited', async () => {
    const { project } = await seedSite('Alpha Roofing');
    await customerFor(project, 'owner@alpha.test');
    signOut();
    let last;
    for (let i = 0; i < 12; i++) last = await loginPOST(jsonReq('/x', 'POST', { identifier: 'owner@alpha.test', password: 'wrong-' + i }));
    expect(last.status).toBe(429);
  });

  it('a purchase invites the customer automatically (Stripe webhook)', async () => {
    const { project } = await seedSite('Alpha Roofing');
    await sql`UPDATE projects SET data = data - 'payment' || '{"status":"approved"}'::jsonb WHERE id = ${project.id}`;
    await saveSettings({ stripeWebhookSecret: 'whsec_test' });
    const body = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', amount_total: 49900, metadata: { projectId: project.id }, customer_details: { email: 'buyer@alpha.test' } } } });
    const t = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', 'whsec_test').update(`${t}.${body}`).digest('hex');
    const res = await webhookPOST(new Request('http://localhost:3000/api/stripe/webhook', { method: 'POST', body, headers: { 'stripe-signature': `t=${t},v1=${sig}` } }));
    expect(res.status).toBe(200);
    const p = await getProject(project.id);
    expect(p.status).toBe('paid');
    expect(p.payment.amount).toBe(49900);
    expect(p.customer.email).toBe('buyer@alpha.test');
    expect((await listMembers(project.id))[0]).toMatchObject({ email: 'buyer@alpha.test', role: 'owner', active: false });
    // a bad signature changes nothing
    const bad = await webhookPOST(new Request('http://localhost:3000/api/stripe/webhook', { method: 'POST', body, headers: { 'stripe-signature': `t=${t},v1=deadbeef` } }));
    expect(bad.status).toBe(400);
  });
});

describe('tenant isolation', () => {
  it('a customer can use their own site and nothing of anyone else’s', async () => {
    const A = await seedSite('Alpha Roofing');
    const B = await seedSite('Bravo Plumbing');
    const alice = await customerFor(A.project, 'alice@alpha.test');
    await signIn(alice);

    // own site: read, edit content, publish, history
    const own = await (await siteGET(jsonReq('/x'), P(A.site.id))).json();
    expect(own.role).toBe('owner');
    expect(own.site.design).toBeUndefined();               // staff-only detail is not sent
    const home = own.site.pages[0];
    const edit = await sitePATCH(jsonReq('/x', 'PATCH', { rev: own.site.rev, ops: [{ op: 'field.set', pageId: home.id, sectionId: home.sections[0].id, key: 'title', value: { html: 'Alice was here' } }] }), P(A.site.id));
    expect(edit.status).toBe(200);
    expect((await sitePublishPOST(jsonReq('/x', 'POST', {}), P(A.site.id))).status).toBe(200);
    expect((await renderGET(jsonReq('/x'), P(A.site.id))).status).toBe(200);
    expect((await overviewGET(jsonReq('/x'), P(A.site.id))).status).toBe(200);
    expect((await versionsGET(jsonReq('/x'), P(A.site.id))).status).toBe(200);
    expect((await draftPreviewGET(jsonReq('/x'), { params: { id: A.site.id, path: ['draft'] } })).status).toBe(200);

    // someone else's site: every route answers "not found" (ids cannot be probed)
    const other = B.site.id;
    const attempts = {
      read: await siteGET(jsonReq('/x'), P(other)),
      edit: await sitePATCH(jsonReq('/x', 'PATCH', { ops: [{ op: 'page.add', title: 'Hacked' }] }), P(other)),
      publish: await sitePublishPOST(jsonReq('/x', 'POST', {}), P(other)),
      render: await renderGET(jsonReq('/x'), P(other)),
      preview: await draftPreviewGET(jsonReq('/x'), { params: { id: other, path: ['draft'] } }),
      versions: await versionsGET(jsonReq('/x'), P(other)),
      rollback: await versionsPOST(jsonReq('/x', 'POST', { action: 'rollback', versionId: B.site.publishedVersionId }), P(other)),
      media: await mediaGET(jsonReq('/x'), P(other)),
      messages: await messagesGET(jsonReq('/x'), P(other)),
      overview: await overviewGET(jsonReq('/x'), P(other)),
      regen: await regenPOST(jsonReq('/x', 'POST', { kind: 'add', title: 'X', instruction: 'x' }), P(other)),
      project: await custProjectGET(jsonReq('/x'), P(B.project.id)),
      projectEdit: await custProjectPATCH(jsonReq('/x', 'PATCH', { name: 'Hacked' }), P(B.project.id)),
      support: await supportPOST(jsonReq('/x', 'POST', { projectId: B.project.id, subject: 'x', body: 'y' })),
      supportList: await supportGET(jsonReq(`/x?projectId=${B.project.id}`))
    };
    for (const [name, res] of Object.entries(attempts)) expect(res.status, name).toBe(404);
    // a version id from another site cannot be smuggled through the customer's own site
    const cross = await versionsPOST(jsonReq('/x', 'POST', { action: 'rollback', versionId: B.site.publishedVersionId }), P(A.site.id));
    expect(cross.status).toBe(404);
    const crossPrev = await draftPreviewGET(jsonReq('/x'), { params: { id: A.site.id, path: [B.site.publishedVersionId] } });
    expect(crossPrev.status).toBe(404);
    // B's data is untouched
    expect((await getSite(other)).draftRev).toBe(B.site.draftRev);
    expect((await getProject(B.project.id)).business.name).toBe('Bravo Plumbing');
  });

  it('customers are locked out of every studio route', async () => {
    const A = await seedSite('Alpha Roofing');
    const alice = await customerFor(A.project, 'alice@alpha.test');
    await signIn(alice);
    const studio = {
      projects: await projectsGET(),
      settings: await settingsGET(),
      users: await usersGET(jsonReq('/x')),
      build: await buildPOST(jsonReq('/x', 'POST', { projectId: A.project.id })),
      ai: await aiGET(),
      custAdmin: await custAdminGET(jsonReq(`/x?projectId=${A.project.id}`)),
      invite: await custAdminPOST(jsonReq('/x', 'POST', { projectId: A.project.id, action: 'invite', email: 'x@y.test' })),
      staffSupport: await staffSupportGET(),
      qa: await qaPOST(jsonReq('/x', 'POST', {}), P(A.site.id)),
      staging: await stagingPOST(jsonReq('/x', 'POST', { action: 'approve' }), P(A.site.id)),
      section: await sectionGET(jsonReq('/x'), P(A.site.id))
    };
    for (const [name, res] of Object.entries(studio)) expect(res.status, name).toBe(403);
    // and on their own site, the design system and raw markup are off limits
    const own = await (await siteGET(jsonReq('/x'), P(A.site.id))).json();
    const home = own.site.pages[0];
    for (const op of [{ op: 'design.css', css: 'body{display:none}' }, { op: 'section.html', pageId: home.id, sectionId: home.sections[0].id, html: '<script>x</script>' }, { op: 'design.tokens', tokens: { colors: { bg: '#000' } } }]) {
      const res = await sitePATCH(jsonReq('/x', 'PATCH', { rev: own.site.rev, ops: [op] }), P(A.site.id));
      expect(res.status, op.op).toBe(403);
    }
    // only "add a page" AI jobs are open to customers, and only for their own site
    expect((await regenPOST(jsonReq('/x', 'POST', { kind: 'section', pageId: home.id, sectionId: home.sections[0].id }), P(A.site.id))).status).toBe(403);
    expect((await regenPOST(jsonReq('/x', 'POST', { kind: 'page', pageId: home.id, instruction: 'x' }), P(A.site.id))).status).toBe(403);
  });

  it('a customer can add an AI/template page to their own site and only sees progress', async () => {
    const A = await seedSite('Alpha Roofing');
    const B = await seedSite('Bravo Plumbing');
    const alice = await customerFor(A.project, 'alice@alpha.test');
    const bob = await customerFor(B.project, 'bob@bravo.test');
    await signIn(alice);
    const start = await (await regenPOST(jsonReq('/x', 'POST', { kind: 'add', title: 'Commercial Roof Repair', type: 'service', instruction: 'Add a page for our commercial roof repair service.' }), P(A.site.id))).json();
    expect(start.job.id).toBeTruthy();
    const run = await (await jobRunPOST(jsonReq('/x', 'POST', {}), P(start.job.id))).json();
    expect(run.job.status).toBe('done');
    expect(run.job).not.toHaveProperty('log');
    expect(run.job).not.toHaveProperty('calls');
    const draft = (await getSite(A.site.id)).draft;
    expect(draft.pages.find(p => p.slug === 'commercial-roof-repair')).toMatchObject({ status: 'draft', createdBy: 'customer' });
    expect((await jobActionPOST(jsonReq('/x', 'POST', { action: 'cancel' }), P(start.job.id))).status).toBe(403);
    // another customer cannot see or drive this job
    await signIn(bob);
    expect((await jobGET(jsonReq('/x'), P(start.job.id))).status).toBe(404);
    expect((await jobRunPOST(jsonReq('/x', 'POST', {}), P(start.job.id))).status).toBe(404);
  });

  it('editors can edit but only owners change business details; removed access stops immediately', async () => {
    const A = await seedSite('Alpha Roofing');
    const owner = await customerFor(A.project, 'owner@alpha.test');
    const editor = await customerFor(A.project, 'editor@alpha.test', 'editor');
    expect((await listMembers(A.project.id)).map(m => m.role)).toEqual(['owner', 'editor']);
    await signIn(editor);
    expect((await (await siteGET(jsonReq('/x'), P(A.site.id))).json()).role).toBe('editor');
    expect((await custProjectPATCH(jsonReq('/x', 'PATCH', { phone: '555' }), P(A.project.id))).status).toBe(403);
    await signIn(owner);
    const upd = await (await custProjectPATCH(jsonReq('/x', 'PATCH', { phone: '(404) 555-0199', status: 'launched', siteId: 'other' }), P(A.project.id))).json();
    expect(upd.project.business.phone).toBe('(404) 555-0199');
    const p = await getProject(A.project.id);
    expect(p.status).toBe('paid');                          // only whitelisted business fields can change
    expect(p.siteId).toBe(A.site.id);
    await revokeMember(A.project.id, editor.id);
    await signIn(editor);
    expect((await siteGET(jsonReq('/x'), P(A.site.id))).status).toBe(404);
  });

  it('customers can update their profile and password through the shared account route', async () => {
    const A = await seedSite('Alpha Roofing');
    const alice = await customerFor(A.project, 'alice@alpha.test');
    await signIn(alice);
    expect((await accountPATCH(jsonReq('/x', 'PATCH', { fullName: 'Alice A.', currentPassword: 'wrong', newPassword: 'another-long-passphrase' }))).status).toBe(403);
    expect((await accountPATCH(jsonReq('/x', 'PATCH', { currentPassword: PASSWORD, newPassword: 'tooshort1' }))).status).toBe(400);
    expect((await accountPATCH(jsonReq('/x', 'PATCH', { fullName: 'Alice A.', currentPassword: PASSWORD, newPassword: 'another-long-passphrase' }))).status).toBe(200);
    expect((await currentUser()).full_name).toBe('Alice A.');
  });
});

describe('website forms and visitor counts', () => {
  it('stores real submissions, drops spam, validates input and allows cross-origin posts', async () => {
    const A = await seedSite('Alpha Roofing');
    signOut();
    const post = (body, ip = '1.1.1.1') => formPOST(jsonReq('/x', 'POST', body, { 'x-forwarded-for': ip }), { params: { siteId: A.site.id } });
    const ok = await post({ form: 'contact', page: '/contact/', fields: { name: 'Sam', email: 'sam@example.test', message: 'Need a roof <script>alert(1)</script>' } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('access-control-allow-origin')).toBe('*');
    expect((await formOPTIONS()).status).toBe(204);
    expect((await post({ fields: { name: 'Bot', email: 'b@x.test', company_website: 'http://spam' } }, '2.2.2.2')).status).toBe(200); // honeypot: accepted, discarded
    expect((await post({ fields: { email: 'not-an-email', message: 'hi' } }, '3.3.3.3')).status).toBe(400);
    expect((await post({ fields: {} }, '4.4.4.4')).status).toBe(400);
    expect((await formPOST(jsonReq('/x', 'POST', { fields: { name: 'x', message: 'y' } }), { params: { siteId: 'nope' } })).status).toBe(404);
    const rows = await sql`SELECT data, form_key, page, delivery FROM form_submissions`;
    expect(rows).toHaveLength(1);
    expect(rows[0].data.message).toContain('<script>');     // stored as plain data, escaped wherever it is shown
    expect(rows[0].delivery.email).toBe('not_configured');

    // the owner sees it; another site's owner does not
    const alice = await customerFor(A.project, 'alice@alpha.test');
    await signIn(alice);
    const inbox = await (await messagesGET(jsonReq('/x'), P(A.site.id))).json();
    expect(inbox.messages).toHaveLength(1);
    expect(inbox.messages[0]).not.toHaveProperty('delivery');
    const overview = await (await overviewGET(jsonReq('/x'), P(A.site.id))).json();
    expect(overview.health.forms).toMatchObject({ total: 1, last30: 1 });
    expect(overview.site.pages.length).toBeGreaterThan(3);
  });

  it('rate limits form posts per visitor', async () => {
    const A = await seedSite('Alpha Roofing');
    let last;
    for (let i = 0; i < 10; i++) last = await formPOST(jsonReq('/x', 'POST', { fields: { name: 'S', message: 'm' + i } }, { 'x-forwarded-for': '9.9.9.9' }), { params: { siteId: A.site.id } });
    expect(last.status).toBe(429);
  });

  it('counts page views anonymously and ignores bots and unknown sites', async () => {
    const A = await seedSite('Alpha Roofing');
    const hit = (p, ua = 'Mozilla/5.0', id = A.site.id) => beaconPOST(new Request('http://localhost:3000/api/t/x', { method: 'POST', body: JSON.stringify({ p }), headers: { 'user-agent': ua } }), { params: { siteId: id } });
    await hit('/'); await hit('/'); await hit('/services/?utm=1#x'); await hit('/', 'Googlebot/2.1'); await hit('/', 'Mozilla/5.0', 'unknown-site');
    const rows = await sql`SELECT path, views FROM site_pageviews ORDER BY path`;
    expect(rows).toEqual([{ path: '/', views: 2 }, { path: '/services/', views: 1 }]);
  });
});

describe('support requests', () => {
  it('customer files a request; staff reply and close it', async () => {
    const A = await seedSite('Alpha Roofing');
    const alice = await customerFor(A.project, 'alice@alpha.test');
    await signIn(alice);
    expect((await supportPOST(jsonReq('/x', 'POST', { projectId: A.project.id, subject: '', body: '' }))).status).toBe(400);
    const made = await (await supportPOST(jsonReq('/x', 'POST', { projectId: A.project.id, subject: 'Change my hours', body: 'We now open at 8.' }))).json();
    await signIn(admin);
    const list = await (await staffSupportGET()).json();
    expect(list.requests[0]).toMatchObject({ subject: 'Change my hours', business: 'Alpha Roofing', status: 'open' });
    await staffSupportPOST(jsonReq('/x', 'POST', { id: made.id, reply: 'Done!', status: 'closed' }));
    await signIn(alice);
    const mine = await (await supportGET(jsonReq(`/x?projectId=${A.project.id}`))).json();
    expect(mine.requests[0]).toMatchObject({ status: 'closed', reply: 'Done!' });
  });
});
