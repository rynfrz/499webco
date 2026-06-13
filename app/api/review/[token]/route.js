// Public: fetch the safe, client-facing view of a project by review token.
// Never exposes internal data — just what the review page needs.
import { NextResponse } from 'next/server';
import { projectByToken } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  const p = await projectByToken(params.token);
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    businessName: p.business?.name || '',
    city: p.business?.city || '',
    status: p.status,
    hasSite: !!p.generatedHtml,
    previewUrl: p.publish?.directUrl || (p.publish?.slug ? `/preview/${p.publish.slug}/` : null),
    approved: ['approved', 'paid', 'launched'].includes(p.status) || !!p.approvedAt,
    paid: ['paid', 'launched'].includes(p.status) || !!p.payment?.paidAt,
    domain: p.launch?.domain || p.payment?.domain || '',
    dnsRecords: p.launch?.records || null
  });
}
