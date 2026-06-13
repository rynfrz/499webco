// Minimal Stripe client (no SDK): Checkout Session creation + webhook signature
// verification, using fetch and Node crypto.
import crypto from 'crypto';

function form(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (typeof v === 'object') form(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out;
}

/** Create a hosted Checkout Session for the $499 (one-time) site. Returns {id,url}. */
export async function createCheckoutSession({ secretKey, amount, productName, successUrl, cancelUrl, customerEmail, metadata }) {
  if (!secretKey) throw new Error('Stripe secret key not set');
  const body = form({
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: customerEmail || undefined,
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': amount,
    'line_items[0][price_data][product_data][name]': productName,
    metadata
  }).join('&');
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || 'Stripe error');
  return { id: json.id, url: json.url };
}

/**
 * Verify a Stripe webhook signature (t=...,v1=...) against the raw body.
 * Returns the parsed event or throws.
 */
export function verifyWebhook(rawBody, sigHeader, signingSecret) {
  if (!signingSecret) throw new Error('Webhook signing secret not set');
  if (!sigHeader) throw new Error('Missing signature');
  const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')));
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) throw new Error('Malformed signature');
  const expected = crypto.createHmac('sha256', signingSecret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(v1);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Signature mismatch');
  // Tolerance check (5 min)
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) throw new Error('Signature timestamp out of tolerance');
  return JSON.parse(rawBody);
}
