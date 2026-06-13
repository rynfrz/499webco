// Public: create a Stripe Checkout session for an approved project (by token).
// Optionally records the client's domain for the post-payment launch.
import { NextResponse } from 'next/server';
import { projectByToken, putProject, getSettings } from '@/lib/db';
import { createCheckoutSession } from '@/lib/stripe';
import { brand } from '@/lib/brand';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { token, domain } = await req.json();
    const p = await projectByToken(token);
    if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!p.generatedHtml) return NextResponse.json({ error: 'Site not ready' }, { status: 400 });

    const s = await getSettings();
    if (!s.stripeSecretKey) return NextResponse.json({ error: 'Payments are not configured yet. Please contact us.' }, { status: 500 });

    if (domain) { p.payment = { ...(p.payment || {}), domain: String(domain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '') }; await putProject(p); }

    const origin = new URL(req.url).origin;
    const amount = Number(s.sitePriceCents) || brand.priceCents;
    const session = await createCheckoutSession({
      secretKey: s.stripeSecretKey,
      amount,
      productName: `${brand.name} — Website for ${p.business.name}`,
      customerEmail: p.business.email || undefined,
      successUrl: `${origin}/review/${token}?paid=1`,
      cancelUrl: `${origin}/review/${token}?canceled=1`,
      metadata: { projectId: p.id, reviewToken: token }
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
