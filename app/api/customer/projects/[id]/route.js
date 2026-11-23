// A customer's own business information and billing summary.
// Only a fixed set of contact fields can be changed here.
import { getProject, patchProject } from '@/lib/db';
import { projectAccess } from '@/lib/access';
import { handle, json, readJson } from '@/lib/http';

export const runtime = 'nodejs';

const EDITABLE = { name: 120, phone: 40, email: 160, address: 200, city: 80, state: 40, hours: 600, description: 2000, tagline: 200 };

function view(p) {
  const b = p.business || {};
  return {
    id: p.id,
    business: Object.fromEntries(Object.keys(EDITABLE).map(k => [k, b[k] || ''])),
    status: p.status,
    billing: p.payment?.paidAt ? { amount: p.payment.amount || null, paidAt: p.payment.paidAt, plan: p.briefInput?.package || 'Website', receiptEmail: p.payment.email || '' } : null,
    domain: p.launch?.domain || p.payment?.domain || '',
    liveUrl: p.launch?.liveUrl || '',
    launchedAt: p.launch?.launchedAt || null
  };
}

export const GET = handle(async (req, { params }) => {
  await projectAccess(params.id);
  const p = await getProject(params.id);
  if (!p) throw { status: 404, message: 'Not found' };
  return json({ project: view(p) });
});

export const PATCH = handle(async (req, { params }) => {
  const { role } = await projectAccess(params.id);
  if (role === 'editor') throw { status: 403, message: 'Only the account owner can change business details.' };
  const body = await readJson(req);
  const p = await getProject(params.id);
  if (!p) throw { status: 404, message: 'Not found' };
  const business = { ...(p.business || {}) };
  for (const [k, max] of Object.entries(EDITABLE)) {
    if (body[k] == null) continue;
    const v = String(body[k]).slice(0, max).trim();
    if (k === 'name' && !v) throw { status: 400, message: 'The business name cannot be empty.' };
    if (k === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw { status: 400, message: 'That does not look like an email address.' };
    business[k] = v;
  }
  const next = await patchProject(params.id, { business });
  return json({ project: view(next) });
});
