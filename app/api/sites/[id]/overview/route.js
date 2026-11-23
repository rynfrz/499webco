// Everything the customer dashboard shows about one website: status, address,
// pages, and website health (domain, SSL, forms, visitors, integrations).
import { sql, initDb, getProject, getSettings } from '@/lib/db';
import { siteAccess } from '@/lib/access';
import { outline, isLegacyDoc } from '@/lib/site/schema';
import { checkDomain } from '@/lib/deploy';
import { formStats } from '@/lib/forms';
import { listInstances } from '@/lib/integrations/store';
import { getProvider } from '@/lib/integrations/registry';
import { handle, json, platformOrigin } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function sslStatus(domain) {
  // A successful HTTPS response from the domain is the honest test of both DNS and the certificate.
  try {
    const res = await fetch(`https://${domain}/`, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(6000) });
    return { ok: res.status < 500, checked: true };
  } catch (e) {
    return { ok: false, checked: true, error: /certificate|SSL|TLS/i.test(String(e.cause?.code || e.message)) ? 'certificate' : 'unreachable' };
  }
}

export const GET = handle(async (req, { params }) => {
  const { site, role } = await siteAccess(params.id);
  await initDb();
  const project = await getProject(site.projectId);
  const settings = await getSettings();
  const origin = await platformOrigin(req);
  const legacy = isLegacyDoc(site.draft);
  const domain = project?.launch?.domain || '';
  const previewUrl = site.publishedVersionId ? `${origin}/preview/${site.slug}` : null;

  // --- domain + SSL -----------------------------------------------------------
  let domainStatus = { state: 'none', label: 'No custom domain yet' };
  let ssl = { state: 'none', label: 'Not applicable yet' };
  if (domain) {
    domainStatus = { state: 'pending', label: 'Waiting for DNS', records: project.launch?.records || [] };
    try {
      if (settings.vercelToken && project.launch?.projectName && (settings.provider || 'vercel') === 'vercel') {
        const st = await Promise.race([checkDomain({ ...settings, provider: 'vercel' }, { projectName: project.launch.projectName, domain }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 7000))]);
        domainStatus = st.verified ? { state: 'ok', label: 'Connected' } : { state: 'pending', label: st.ownershipVerified ? 'Waiting for DNS to point here' : 'Waiting for domain verification', records: st.records };
      }
    } catch { domainStatus = { ...domainStatus, state: 'unknown', label: 'Could not check right now' }; }
    const s = await sslStatus(domain);
    ssl = s.ok ? { state: 'ok', label: 'Secure (HTTPS is working)' } : { state: domainStatus.state === 'ok' ? 'error' : 'pending', label: s.error === 'certificate' ? 'Certificate is being issued' : 'Not reachable over HTTPS yet' };
  } else if (previewUrl) {
    ssl = { state: 'ok', label: 'Secure (served over HTTPS)' };
  }

  // --- forms ------------------------------------------------------------------
  const stats = await formStats(site.id);
  const hasForm = !legacy && (site.draft.pages || []).some(p => p.status !== 'archived' && p.sections.some(s => /data-form=/.test(s.html)));
  const recipient = (!legacy && site.draft.settings?.formRecipient) || project?.business?.email || '';
  const forms = !hasForm
    ? { state: 'none', label: 'No contact form on the site', ...stats }
    : !recipient ? { state: 'warn', label: 'Messages are saved here, but no notification email is set', ...stats }
    : !settings.resendApiKey ? { state: 'warn', label: 'Messages are saved here; email notifications are not switched on yet', recipient, ...stats }
    : { state: 'ok', label: `Working. Messages go to ${recipient}`, recipient, ...stats };

  // --- visitors (last 30 days) -----------------------------------------------
  const since = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const byDay = await sql`SELECT day, SUM(views)::int AS views FROM site_pageviews WHERE site_id = ${site.id} AND day >= ${since} GROUP BY day ORDER BY day`;
  const top = await sql`SELECT path, SUM(views)::int AS views FROM site_pageviews WHERE site_id = ${site.id} AND day >= ${since} GROUP BY path ORDER BY views DESC LIMIT 6`;
  const days = [];
  const map = new Map(byDay.map(r => [r.day, r.views]));
  for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); days.push({ day: d, views: map.get(d) || 0 }); }
  const analytics = { total: days.reduce((a, d) => a + d.views, 0), days, top: top.map(r => ({ path: r.path, views: r.views })) };

  // --- integrations -------------------------------------------------------------
  const integrations = (await listInstances(site.id)).map(i => ({ provider: i.provider, name: getProvider(i.provider)?.name || i.provider, status: i.status, error: role === 'staff' ? i.error : (i.status === 'error' ? 'Needs attention' : '') }));

  const o = outline(site.draft);
  return json({
    site: {
      id: site.id, projectId: site.projectId, slug: site.slug, legacy, businessName: project?.business?.name || '',
      status: site.liveVersionId ? 'live' : site.publishedVersionId ? 'published' : 'draft',
      hasUnpublishedChanges: site.draftDirty && !!site.publishedVersionId,
      publicUrl: domain && domainStatus.state === 'ok' ? `https://${domain}` : (project?.launch?.liveUrl || previewUrl),
      previewUrl, domain, pages: o.pages.filter(p => p.status !== 'archived').map(p => ({ id: p.id, title: p.title, path: p.path, status: p.status, inNav: p.inNav })),
      updatedAt: site.updatedAt
    },
    health: { domain: domainStatus, ssl, forms, analytics, integrations },
    role
  });
});
