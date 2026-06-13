// Deployment: Vercel (primary) and Netlify (alternate).
// Previews: one project/site hosts every preview at /preview/<slug>/.
// Launch: each client site becomes its own Vercel project with a custom domain.
import crypto from 'crypto';

const VERCEL = 'https://api.vercel.com';
const NETLIFY = 'https://api.netlify.com/api/v1';

function vQuery(teamId) { return teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''; }

async function vFetch(token, path, opts = {}) {
  const res = await fetch(VERCEL + path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(opts.headers || {}) }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Vercel ${res.status}: ${body.error?.message || JSON.stringify(body).slice(0, 200)}`);
  return body;
}

function portfolioIndex(previews, previewDomain) {
  const cards = Object.entries(previews)
    .sort((a, b) => b[1].publishedAt - a[1].publishedAt)
    .map(([slug, p]) => `<a class="card" href="/preview/${slug}/"><h2>${escapeHtml(p.businessName)}</h2><span>/preview/${slug}</span></a>`)
    .join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Previews · 499web.co</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#0e0f12;color:#f2f2f2;margin:0;padding:60px 24px}
h1{font-size:28px;max-width:880px;margin:0 auto 8px}p{color:#9a9aa3;max-width:880px;margin:0 auto 40px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;max-width:880px;margin:0 auto}
.card{display:block;background:#17181d;border:1px solid #26272e;border-radius:14px;padding:22px;text-decoration:none;color:inherit;transition:.15s}
.card:hover{border-color:#4f5af0;transform:translateY(-2px)}
.card h2{font-size:17px;margin:0 0 6px}.card span{font-size:13px;color:#7a7b85}</style></head>
<body><h1>499web.co — Live Previews</h1><p>Modern websites built for local businesses, before asking for the sale.</p>
<div class="grid">${cards}</div></body></html>`;
}

function escapeHtml(s = '') {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- VERCEL ----------

async function vercelEnsureProject(token, teamId, name) {
  try {
    return await vFetch(token, `/v9/projects/${encodeURIComponent(name)}${vQuery(teamId)}`);
  } catch {
    return vFetch(token, `/v10/projects${vQuery(teamId)}`, {
      method: 'POST',
      body: JSON.stringify({ name, framework: null })
    });
  }
}

async function vercelDeployFiles(token, teamId, projectName, files) {
  const payload = {
    name: projectName,
    project: projectName,
    target: 'production',
    files: files.map(f => ({ file: f.file, data: Buffer.from(f.data).toString('base64'), encoding: 'base64' })),
    projectSettings: { framework: null }
  };
  const qs = teamId
    ? `?teamId=${encodeURIComponent(teamId)}&skipAutoDetectionConfirmation=1`
    : '?skipAutoDetectionConfirmation=1';
  const dep = await vFetch(token, `/v13/deployments${qs}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  // Poll until ready (max ~90s)
  for (let i = 0; i < 45; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const st = await vFetch(token, `/v13/deployments/${dep.id}${vQuery(teamId)}`);
    if (st.readyState === 'READY') return st;
    if (['ERROR', 'CANCELED'].includes(st.readyState)) throw new Error(`Deployment ${st.readyState.toLowerCase()}`);
  }
  return dep; // still building; URL will go live shortly
}

async function vercelAddDomain(token, teamId, projectName, domain) {
  let result;
  try {
    result = await vFetch(token, `/v10/projects/${encodeURIComponent(projectName)}/domains${vQuery(teamId)}`, {
      method: 'POST',
      body: JSON.stringify({ name: domain })
    });
  } catch (e) {
    if (!String(e.message).includes('already')) throw e;
    result = { name: domain };
  }
  // If this is an apex domain, also attach www.<domain> as a redirect to the
  // apex so both hostnames resolve. Ignore failures (e.g. already attached).
  if (domain.split('.').length === 2) {
    try {
      await vFetch(token, `/v10/projects/${encodeURIComponent(projectName)}/domains${vQuery(teamId)}`, {
        method: 'POST',
        body: JSON.stringify({ name: 'www.' + domain, redirect: domain, redirectStatusCode: 308 })
      });
    } catch {}
  }
  const status = await vercelDomainStatus(token, teamId, projectName, domain);
  return { ...result, ...status };
}

async function vercelDomainStatus(token, teamId, projectName, domain) {
  const info = await vFetch(token, `/v9/projects/${encodeURIComponent(projectName)}/domains/${encodeURIComponent(domain)}${vQuery(teamId)}`);

  // "verified" from Vercel only means ownership (not claimed by another account).
  // Whether DNS actually points at Vercel is a separate config check.
  let dnsConfigured = false;
  try {
    const cfg = await vFetch(token, `/v6/domains/${encodeURIComponent(domain)}/config${vQuery(teamId)}`);
    dnsConfigured = cfg.misconfigured === false;
  } catch {}

  const apex = domain.split('.').length === 2;
  const records = [];
  if (info.verification?.length) {
    for (const v of info.verification) records.push({ type: v.type.toUpperCase(), name: v.domain, value: v.value, purpose: 'verification' });
  }
  records.push(
    apex
      ? { type: 'A', name: '@', value: '76.76.21.21', purpose: 'routing' }
      : { type: 'CNAME', name: domain.split('.')[0], value: 'cname.vercel-dns.com', purpose: 'routing' }
  );
  return {
    verified: !!info.verified && dnsConfigured, // true only when actually live
    ownershipVerified: !!info.verified,
    dnsConfigured,
    records
  };
}

// ---------- NETLIFY ----------

async function nFetch(token, path, opts = {}) {
  const res = await fetch(NETLIFY + path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(opts.headers || {}) }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Netlify ${res.status}: ${body.message || JSON.stringify(body).slice(0, 200)}`);
  return body;
}

async function netlifyEnsureSite(token, siteId, name) {
  if (siteId) return nFetch(token, `/sites/${siteId}`);
  return nFetch(token, '/sites', { method: 'POST', body: JSON.stringify({ name }) });
}

// Digest-based deploy: send sha1 manifest, then upload required files.
async function netlifyDeployFiles(token, siteId, files) {
  const manifest = {};
  const bySha = {};
  for (const f of files) {
    const sha = crypto.createHash('sha1').update(f.data).digest('hex');
    const p = '/' + f.file;
    manifest[p] = sha;
    bySha[sha] = { path: p, data: f.data };
  }
  const deploy = await nFetch(token, `/sites/${siteId}/deploys`, {
    method: 'POST',
    body: JSON.stringify({ files: manifest })
  });
  for (const sha of deploy.required || []) {
    const f = bySha[sha];
    if (!f) continue;
    const res = await fetch(`${NETLIFY}/deploys/${deploy.id}/files${encodeURI(f.path)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
      body: Buffer.from(f.data)
    });
    if (!res.ok) throw new Error(`Netlify upload failed for ${f.path} (${res.status})`);
  }
  return deploy;
}

// ---------- HIGH LEVEL ----------

/**
 * Publish/refresh the whole preview catalog (all previews + portfolio index).
 * previews: { slug: { businessName, html, publishedAt } }
 */
async function publishPreviews(settings, previews, homepageFiles = []) {
  // Homepage priority: an imported folder (full multi-file site) beats a
  // published-preview slug, which beats the auto-generated portfolio.
  // The portfolio always remains available at /portfolio/.
  const files = [];
  if (homepageFiles.length) {
    files.push(...homepageFiles.filter(f => !/^(preview|portfolio)\//.test(f.file)));
  } else {
    const homepage = settings.homepageSlug && previews[settings.homepageSlug];
    files.push({ file: 'index.html', data: homepage ? homepage.html : portfolioIndex(previews, settings.previewDomain) });
  }
  files.push({ file: 'portfolio/index.html', data: portfolioIndex(previews, settings.previewDomain) });
  for (const [slug, p] of Object.entries(previews)) {
    files.push({ file: `preview/${slug}/index.html`, data: p.html });
  }

  if (settings.provider === 'netlify') {
    if (!settings.netlifyToken) throw new Error('No Netlify token set. Add one in Settings.');
    const site = await netlifyEnsureSite(settings.netlifyToken, settings.netlifySiteId, settings.vercelPreviewProject);
    await netlifyDeployFiles(settings.netlifyToken, site.id, files);
    return { siteId: site.id, baseUrl: `https://${site.default_domain || site.url?.replace('https://', '')}` , customBase: `https://${settings.previewDomain}` };
  }

  if (!settings.vercelToken) throw new Error('No Vercel token set. Add one in Settings.');
  const project = settings.vercelPreviewProject || 'wfl-previews';
  await vercelEnsureProject(settings.vercelToken, settings.vercelTeamId, project);
  const dep = await vercelDeployFiles(settings.vercelToken, settings.vercelTeamId, project, files);
  return { baseUrl: `https://${dep.url || dep.alias?.[0] || project + '.vercel.app'}`, customBase: `https://${settings.previewDomain}` };
}

/** Launch a client's final site as its own project, optionally attach a domain. */
async function launchSite(settings, { projectName, html, domain }) {
  if (settings.provider === 'netlify') {
    if (!settings.netlifyToken) throw new Error('No Netlify token set. Add one in Settings.');
    const site = await netlifyEnsureSite(settings.netlifyToken, null, projectName);
    await netlifyDeployFiles(settings.netlifyToken, site.id, [{ file: 'index.html', data: html }]);
    return {
      liveUrl: `https://${site.default_domain}`,
      domain: domain || null,
      records: domain ? [
        { type: 'A', name: '@', value: '75.2.60.5', purpose: 'routing (add domain in Netlify dashboard)' },
        { type: 'CNAME', name: 'www', value: site.default_domain, purpose: 'routing' }
      ] : [],
      verified: false
    };
  }

  if (!settings.vercelToken) throw new Error('No Vercel token set. Add one in Settings.');
  await vercelEnsureProject(settings.vercelToken, settings.vercelTeamId, projectName);
  const dep = await vercelDeployFiles(settings.vercelToken, settings.vercelTeamId, projectName, [
    { file: 'index.html', data: html }
  ]);
  let domainInfo = { records: [], verified: false };
  if (domain) {
    domainInfo = await vercelAddDomain(settings.vercelToken, settings.vercelTeamId, projectName, domain);
  }
  return { liveUrl: `https://${dep.url}`, domain: domain || null, records: domainInfo.records || [], verified: !!domainInfo.verified };
}

async function checkDomain(settings, { projectName, domain }) {
  if (settings.provider !== 'vercel') throw new Error('Domain checks are automated for Vercel only.');
  return vercelDomainStatus(settings.vercelToken, settings.vercelTeamId, projectName, domain);
}

/** Attach the preview domain (e.g. websitesforlocals.com) to the previews project. */
async function connectPreviewDomain(settings) {
  if (settings.provider !== 'vercel') throw new Error('Use the Netlify dashboard to attach your preview domain.');
  const project = settings.vercelPreviewProject || 'wfl-previews';
  await vercelEnsureProject(settings.vercelToken, settings.vercelTeamId, project);
  return vercelAddDomain(settings.vercelToken, settings.vercelTeamId, project, settings.previewDomain);
}

export { publishPreviews, launchSite, checkDomain, connectPreviewDomain };
