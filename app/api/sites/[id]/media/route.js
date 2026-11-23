// A site's media library: list (GET), upload (POST multipart), remove (DELETE).
// Available to staff and to the site's own customers; files are stored in
// Vercel Blob under a per-site prefix and referenced by stable URLs.
import { put, del } from '@vercel/blob';
import { sql, initDb } from '@/lib/db';
import { newId } from '@/lib/auth';
import { siteAccess } from '@/lib/access';
import { rateLimit } from '@/lib/ratelimit';
import { handle, json } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
const MAX_BYTES = 8 * 1024 * 1024;

/** Check the first bytes really are the image type claimed. */
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.slice(0, 3).toString('latin1') === 'GIF') return 'image/gif';
  if (buf.slice(4, 12).toString('latin1').includes('ftypavif')) return 'image/avif';
  return null;
}

export const GET = handle(async (req, { params }) => {
  const { site } = await siteAccess(params.id, { full: false });
  await initDb();
  const rows = await sql`SELECT id, url, name, alt, kind, bytes, created_at FROM media_assets WHERE project_id = ${site.projectId} ORDER BY created_at DESC LIMIT 300`;
  // Photos the studio attached to the project before the library existed are offered too.
  const proj = await sql`SELECT data->'business'->'photos' AS photos FROM projects WHERE id = ${site.projectId}`;
  const known = new Set(rows.map(r => r.url));
  const legacy = (Array.isArray(proj[0]?.photos) ? proj[0].photos : []).filter(u => typeof u === 'string' && /^https:\/\//.test(u) && !known.has(u));
  return json({
    media: [
      ...rows.map(r => ({ id: r.id, url: r.url, name: r.name, alt: r.alt, kind: r.kind, bytes: r.bytes, createdAt: Number(r.created_at) })),
      ...legacy.map((u, i) => ({ id: 'legacy' + i, url: u, name: 'Business photo', alt: '', kind: 'photo', bytes: 0, createdAt: 0 }))
    ]
  });
});

export const POST = handle(async (req, { params }) => {
  const { site, user } = await siteAccess(params.id, { full: false });
  await rateLimit(`upload:${site.id}`, 60, 3600);
  const form = await req.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') throw { status: 400, message: 'No file provided' };
  if (file.size > MAX_BYTES) throw { status: 413, message: 'That image is too large (the limit is 8 MB).' };
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniff(buf);
  if (!type || !TYPES[type]) throw { status: 400, message: 'Please upload a JPG, PNG, WebP, GIF or AVIF image.' };
  const safeName = String(file.name || 'image').replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9\-_]/g, '-').slice(0, 50) || 'image';
  let url;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`sites/${site.id}/${safeName}.${TYPES[type]}`, buf, { access: 'public', addRandomSuffix: true, contentType: type });
    url = blob.url;
  } else if ((process.env.DATABASE_URL || '').startsWith('pglite:') && buf.length <= 400 * 1024) {
    // Local development without Blob storage: keep small images inline so the flow can be tried.
    url = `data:${type};base64,${buf.toString('base64')}`;
  } else {
    throw { status: 500, message: 'Image hosting is not configured. Create a Blob store in Vercel (Storage → Blob) and redeploy.' };
  }
  await initDb();
  const id = newId('m');
  const alt = String(form.get('alt') || '').slice(0, 300);
  await sql`INSERT INTO media_assets (id, project_id, url, name, alt, kind, bytes, created_by, created_at)
            VALUES (${id}, ${site.projectId}, ${url}, ${safeName}, ${alt}, 'photo', ${buf.length}, ${user.id}, ${Date.now()})`;
  return json({ media: { id, url, name: safeName, alt, kind: 'photo', bytes: buf.length } });
});

export const DELETE = handle(async (req, { params }) => {
  const { site } = await siteAccess(params.id, { full: false });
  const id = new URL(req.url).searchParams.get('mediaId');
  await initDb();
  const rows = await sql`SELECT id, url FROM media_assets WHERE id = ${id} AND project_id = ${site.projectId}`;
  if (!rows[0]) throw { status: 404, message: 'Not found' };
  // The file itself is kept if a published version might still reference it;
  // removing the library entry only stops it being offered for new use.
  await sql`DELETE FROM media_assets WHERE id = ${id}`;
  if (process.env.BLOB_READ_WRITE_TOKEN && new URL(req.url).searchParams.get('purge') === '1') { try { await del(rows[0].url); } catch {} }
  return json({ ok: true });
});
