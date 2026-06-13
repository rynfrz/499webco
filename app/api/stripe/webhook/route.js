// Public: Stripe webhook. Verifies the signature against the RAW body, then on
// checkout.session.completed flips the project to 'paid' and emails the client
// DNS instructions + notifies the team. Kept fast (no deploy here) so Stripe
// never times out — the team finalizes the live launch from the admin tool.
import { NextResponse } from 'next/server';
import { getSettings, getProject, putProject } from '@/lib/db';
import { verifyWebhook } from '@/lib/stripe';
import { paymentInstructions, teamPaidNotice } from '@/lib/email';

export const runtime = 'nodejs';

// Standard Vercel DNS records shown to the client to point their domain at us.
function standardRecords(domain) {
  const apex = (domain || '').split('.').length === 2;
  return apex
    ? [{ type: 'A', name: '@', value: '76.76.21.21' }, { type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com' }]
    : [{ type: 'CNAME', name: (domain || '').split('.')[0] || 'www', value: 'cname.vercel-dns.com' }];
}

export async function POST(req) {
  const s = await getSettings();
  const raw = await req.text();
  const sig = req.headers.get('stripe-signature');
  let event;
  try {
    event = verifyWebhook(raw, sig, s.stripeWebhookSecret);
  } catch (e) {
    return NextResponse.json({ error: 'Invalid signature: ' + e.message }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const projectId = session.metadata?.projectId;
    if (projectId) {
      const p = await getProject(projectId);
      if (p && !p.payment?.paidAt) {
        const domain = p.payment?.domain || '';
        p.payment = {
          ...(p.payment || {}),
          sessionId: session.id,
          amount: session.amount_total,
          paidAt: Date.now(),
          email: session.customer_details?.email || p.business.email
        };
        p.status = 'paid';
        await putProject(p);
        const records = domain ? standardRecords(domain) : null;
        paymentInstructions(p.payment.email, p.business.name, domain, records).catch(() => {});
        if (s.teamNotifyEmail) teamPaidNotice(s.teamNotifyEmail, p.business.name, session.amount_total).catch(() => {});
      }
    }
  }
  return NextResponse.json({ received: true });
}
