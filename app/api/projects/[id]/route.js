import { NextResponse } from 'next/server';
import { sql, initDb, patchProject } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const runtime = 'nodejs';

async function load(id) {
  const rows = await sql`SELECT data FROM projects WHERE id = ${id}`;
  return rows[0]?.data || null;
}

// Keys written by the server (jobs, payments, publishing, customer accounts).
// The workspace autosaves the whole project from the browser, so a tab that was
// opened before one of these changed must not be able to overwrite it.
const SERVER_KEYS = ['siteId', 'siteEngine', 'payment', 'approvedAt', 'customer', 'browserQa', 'launch', 'publish', 'previewEmailedAt'];
const STATUS_RANK = { draft: 0, lead: 0, generated: 1, published: 2, approved: 3, paid: 4, launched: 5 };

export async function GET(req, { params }) {
  try {
    await requireUser();
    await initDb();
    const p = await load(params.id);
    if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    // A classic project whose upgrade tools were opened has a site record; make sure the project knows it,
    // otherwise a staged upgrade would be hidden behind "Open upgrade tools" after a reload.
    if (!p.siteId) {
      const site = (await sql`SELECT id FROM sites WHERE project_id = ${params.id} LIMIT 1`)[0];
      if (site) { p.siteId = site.id; await patchProject(params.id, { siteId: site.id }); }
    }
    return NextResponse.json({ project: p });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}

export async function PATCH(req, { params }) {
  try {
    await requireUser();
    await initDb();
    const incoming = await req.json();
    incoming.id = params.id;
    const current = await load(params.id);
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    for (const k of SERVER_KEYS) {
      // The server's value wins whenever it has one the browser copy lacks or is behind on.
      if (current[k] !== undefined && (incoming[k] === undefined || k === 'siteId' || k === 'siteEngine' || k === 'payment' || k === 'customer' || k === 'approvedAt' || k === 'browserQa')) incoming[k] = current[k];
    }
    // The lifecycle never moves backwards through an autosave (e.g. paid → published).
    if ((STATUS_RANK[current.status] ?? 0) > (STATUS_RANK[incoming.status] ?? 0)) incoming.status = current.status;
    // A classic build that finished server-side is kept if the browser copy has none.
    if (current.generatedHtml && !incoming.generatedHtml) incoming.generatedHtml = current.generatedHtml;
    await sql`UPDATE projects SET data = ${JSON.stringify(incoming)}::jsonb, updated_at = ${Date.now()} WHERE id = ${params.id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    await requireUser();
    await initDb();
    // Remove the structured site and everything hanging off it with the project.
    const sites = await sql`SELECT id FROM sites WHERE project_id = ${params.id}`;
    for (const s of sites) {
      await sql`DELETE FROM site_files WHERE version_id IN (SELECT id FROM site_versions WHERE site_id = ${s.id})`;
      await sql`DELETE FROM site_versions WHERE site_id = ${s.id}`;
      await sql`DELETE FROM site_events WHERE site_id = ${s.id}`;
      await sql`DELETE FROM integration_instances WHERE site_id = ${s.id}`;
      await sql`DELETE FROM form_submissions WHERE site_id = ${s.id}`;
      await sql`DELETE FROM site_pageviews WHERE site_id = ${s.id}`;
    }
    await sql`DELETE FROM sites WHERE project_id = ${params.id}`;
    await sql`DELETE FROM project_members WHERE project_id = ${params.id}`;
    await sql`DELETE FROM media_assets WHERE project_id = ${params.id}`;
    await sql`DELETE FROM support_requests WHERE project_id = ${params.id}`;
    await sql`DELETE FROM projects WHERE id = ${params.id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
