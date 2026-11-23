// Public, CORS-enabled endpoint that generated websites post their forms to.
import { handleSubmission } from '@/lib/forms';
import { rateLimit, clientIp } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' };
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });

export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

export async function POST(req, { params }) {
  try {
    const len = Number(req.headers.get('content-length') || 0);
    if (len > 60000) return reply({ error: 'That message is too long.' }, 413);
    const ip = clientIp(req);
    await rateLimit(`form-ip:${ip}`, 8, 600);
    await rateLimit(`form-site:${params.siteId}`, 120, 3600);
    let body;
    try { body = JSON.parse((await req.text()).slice(0, 60000)); } catch { return reply({ error: 'Invalid form data.' }, 400); }
    const r = await handleSubmission(String(params.siteId).slice(0, 40), body);
    return reply({ ok: r.ok });
  } catch (e) {
    const status = Number.isInteger(e?.status) ? e.status : 500;
    return reply({ error: status === 500 ? 'Sorry, something went wrong. Please call or email us instead.' : e.message }, status);
  }
}
