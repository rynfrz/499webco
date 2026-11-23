// Integration provider definitions.
//
// Each provider is one self-contained object in a standard shape:
//
//   id, name, category, description, features, complexity, color
//   auth            'config' (public details only) | 'api_key' | 'oauth'
//   capabilities    what it adds: booking, payment, analytics, crm, email_list,
//                   lead_delivery, map, chat, reviews, social
//   configSchema    non-secret fields the customer fills in
//   secretSchema    credentials (stored encrypted, never sent to a browser,
//                   never written into a page)
//   permissions     the least-privilege scopes / access the provider needs
//   setup           plain-language steps
//   validate()      a REAL check against the provider. An integration is only
//                   "Connected" after this passes.
//   placements      blocks a customer can add to a page
//   renderSection() trusted, escaped markup for a placement
//   runtime()       data attributes for the platform script (analytics, chat)
//   bodyEnd()       trusted site-wide markup (e.g. a chat button)
//   onFormSubmission()  server-side lead delivery
//   csp             extra hosts the page's Content-Security-Policy must allow
//   oauth           authorisation endpoints (used only when the administrator
//                   has configured platform credentials for this provider)
//
// Nothing here is a pasted third-party snippet: scripts are loaded by the
// platform runtime from fixed, per-provider URLs using validated identifiers.
import crypto from 'crypto';
import dns from 'dns/promises';
import net from 'net';
import { escapeHtml as esc } from '../site/html.js';

// --- HTTP helper (injectable for tests) --------------------------------------

export async function http(url, opts = {}) {
  const f = globalThis.__integrationFetch || fetch;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opts.timeout || 8000);
  try { return await f(url, { ...opts, signal: ctl.signal, redirect: opts.redirect || 'follow' }); }
  catch (e) { throw new Error(ctl.signal.aborted ? 'The service did not respond in time.' : 'Could not reach the service.'); }
  finally { clearTimeout(t); }
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:');
}

/** Server-side request forgery guard for customer-supplied URLs. */
export async function assertPublicHttpsUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { throw new Error('Enter a full web address starting with https://'); }
  if (u.protocol !== 'https:') throw new Error('The address must start with https://');
  if (u.username || u.password) throw new Error('The address must not contain a username or password.');
  if (u.port && u.port !== '443') throw new Error('Only the standard HTTPS port is allowed.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.')) throw new Error('That address is not reachable from the internet.');
  if (net.isIP(host)) { if (isPrivateIp(host)) throw new Error('That address is not reachable from the internet.'); return u; }
  if (globalThis.__integrationNoDns) return u;
  let addrs;
  try { addrs = await dns.lookup(host, { all: true }); } catch { throw new Error('That address could not be found.'); }
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new Error('That address is not reachable from the internet.');
  return u;
}

async function reachable(url, { expect = /./ } = {}) {
  const res = await http(url, { method: 'GET', headers: { 'user-agent': 'Mozilla/5.0 (compatible; 499WebCo-IntegrationCheck/1.0)' } });
  if (res.status === 404 || res.status === 410) return { ok: false, error: 'That link does not exist (the service returned “not found”). Check it and try again.' };
  if (res.status >= 500) return { ok: false, error: 'The service is having problems right now. Try again in a few minutes.' };
  return { ok: true, status: res.status };
}

const hostIs = (u, hosts) => hosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
function httpsUrl(raw, hosts, what) {
  let u;
  try { u = new URL(String(raw || '').trim().replace(/^(?!https?:\/\/)/i, 'https://')); } catch { throw new Error(`Enter your ${what} link.`); }
  if (u.protocol !== 'https:') u.protocol = 'https:';
  if (!hostIs(u, hosts)) throw new Error(`That doesn’t look like a ${what} link. It should start with https://${hosts[0]}/`);
  u.hash = '';
  return u;
}

const btnSection = ({ title, text, label, href, external = true }) =>
  `<div class="w-container"><div data-reveal>${title ? `<h2 class="w-h2">${esc(title)}</h2>` : ''}${text ? `<p class="w-lead">${esc(text)}</p>` : ''}<div class="w-actions"><a class="w-btn w-btn--primary w-btn--lg" href="${esc(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(label)}</a></div></div></div>`;
const frameSection = ({ title, text, src, height = 700, frameTitle }) =>
  `<div class="w-container">${title || text ? `<div class="w-head" data-reveal>${title ? `<h2 class="w-h2">${esc(title)}</h2>` : ''}${text ? `<p class="w-lead">${esc(text)}</p>` : ''}</div>` : ''}<div class="w-embed" data-reveal><iframe src="${esc(src)}" title="${esc(frameTitle || title || 'Embedded content')}" loading="lazy" style="min-height:${Number(height) || 700}px"></iframe></div></div>`;

const text = (v, n = 160) => String(v ?? '').trim().slice(0, n);

// ---------------------------------------------------------------------------

export const CATEGORIES = [
  ['scheduling', 'Scheduling & Booking'], ['payments', 'Payments & Commerce'], ['marketing', 'Marketing & CRM'],
  ['forms', 'Forms & Leads'], ['communication', 'Customer Communication'], ['reputation', 'Reputation & Social'], ['maps', 'Maps & Location']
];

export const PROVIDERS = [
  // ============================ Scheduling ============================
  {
    id: 'calendly', name: 'Calendly', category: 'scheduling', color: '#006bff', complexity: 'Easy', auth: 'config',
    description: 'Let visitors pick a time and book with you right on your website.',
    features: ['Booking calendar on any page', 'Uses your existing Calendly availability', 'Confirmation emails sent by Calendly'],
    capabilities: ['booking'], permissions: ['Your public Calendly scheduling link (no password or API access needed)'],
    configSchema: [{ key: 'url', label: 'Your Calendly link', type: 'url', required: true, placeholder: 'https://calendly.com/your-name/30min', help: 'In Calendly: Event types → Copy link.' }],
    setup: ['Open Calendly and copy the link to the event people should book.', 'Paste it here and press Connect.', 'Add the booking calendar to any page.'],
    async validate({ config }) {
      const u = httpsUrl(config.url, ['calendly.com'], 'Calendly');
      if (u.pathname.split('/').filter(Boolean).length < 1) throw new Error('Paste the full link to your scheduling page, e.g. https://calendly.com/your-name/30min');
      const r = await reachable(u.toString());
      if (!r.ok) throw new Error(r.error);
      return { config: { url: u.origin + u.pathname.replace(/\/$/, '') } };
    },
    placements: [{ kind: 'booking', label: 'Booking calendar', description: 'A calendar visitors can book from.' }],
    renderSection: ({ config, placement }) => frameSection({ title: placement.title ?? 'Book a time', text: placement.text, src: `${config.url}?hide_gdpr_banner=1&embed_type=Inline`, height: 720, frameTitle: 'Booking calendar' }),
    csp: { frame: ['https://calendly.com'] }
  },
  {
    id: 'calcom', name: 'Cal.com', category: 'scheduling', color: '#111827', complexity: 'Easy', auth: 'config',
    description: 'Show your Cal.com booking page inside your website.',
    features: ['Booking calendar on any page', 'Uses your Cal.com availability'],
    capabilities: ['booking'], permissions: ['Your public Cal.com booking link'],
    configSchema: [{ key: 'url', label: 'Your Cal.com link', type: 'url', required: true, placeholder: 'https://cal.com/your-name/meeting' }],
    setup: ['In Cal.com, copy the public link to your event type.', 'Paste it here and press Connect.', 'Add the booking calendar to any page.'],
    async validate({ config }) {
      const u = httpsUrl(config.url, ['cal.com'], 'Cal.com');
      const r = await reachable(u.toString());
      if (!r.ok) throw new Error(r.error);
      return { config: { url: 'https://cal.com' + u.pathname.replace(/\/$/, '') } };
    },
    placements: [{ kind: 'booking', label: 'Booking calendar', description: 'A calendar visitors can book from.' }],
    renderSection: ({ config, placement }) => frameSection({ title: placement.title ?? 'Book a time', text: placement.text, src: `${config.url}?embed=true`, height: 720, frameTitle: 'Booking calendar' }),
    csp: { frame: ['https://cal.com', 'https://app.cal.com'] }
  },
  {
    id: 'square_appointments', name: 'Square Appointments', category: 'scheduling', color: '#3e4348', complexity: 'Easy', auth: 'config',
    description: 'Send visitors to your Square booking site with a clear “Book now” button.',
    features: ['“Book now” button on any page', 'Bookings and payments handled by Square'],
    capabilities: ['booking'], permissions: ['Your public Square booking site link'],
    configSchema: [{ key: 'url', label: 'Your Square booking link', type: 'url', required: true, placeholder: 'https://book.squareup.com/appointments/…', help: 'In Square: Appointments → Online booking → Copy booking site link.' },
      { key: 'label', label: 'Button text', type: 'text', placeholder: 'Book now' }],
    setup: ['In Square Appointments, turn on Online Booking.', 'Copy your booking site link and paste it here.', 'Add the “Book now” block to any page.'],
    async validate({ config }) {
      const u = httpsUrl(config.url, ['squareup.com', 'square.site'], 'Square booking');
      const r = await reachable(u.toString());
      if (!r.ok) throw new Error(r.error);
      return { config: { url: u.toString(), label: text(config.label, 40) || 'Book now' } };
    },
    placements: [{ kind: 'booking', label: '“Book now” button', description: 'A heading with a button to your Square booking site.' }],
    renderSection: ({ config, placement }) => btnSection({ title: placement.title ?? 'Book an appointment', text: placement.text ?? 'Choose a time that suits you. Booking takes about a minute.', label: config.label, href: config.url }),
    csp: {}
  },

  // ============================ Payments ============================
  {
    id: 'stripe_link', name: 'Stripe Payment Link', category: 'payments', color: '#635bff', complexity: 'Easy', auth: 'config',
    description: 'Take a payment or deposit with a secure Stripe checkout button.',
    features: ['“Pay now” button on any page', 'Card details are handled entirely by Stripe', 'No card data touches your website'],
    capabilities: ['payment'], permissions: ['A public Stripe Payment Link (your Stripe keys are never needed)'],
    configSchema: [{ key: 'url', label: 'Your Stripe Payment Link', type: 'url', required: true, placeholder: 'https://buy.stripe.com/…', help: 'In Stripe: Payment Links → New → Copy link.' },
      { key: 'label', label: 'Button text', type: 'text', placeholder: 'Pay now' }],
    setup: ['In Stripe, create a Payment Link for your product, service or deposit.', 'Copy the link and paste it here.', 'Add the payment button to any page.'],
    async validate({ config }) {
      const u = httpsUrl(config.url, ['buy.stripe.com', 'book.stripe.com', 'donate.stripe.com'], 'Stripe Payment');
      const r = await reachable(u.toString());
      if (!r.ok) throw new Error(r.error);
      return { config: { url: u.origin + u.pathname, label: text(config.label, 40) || 'Pay now' } };
    },
    placements: [{ kind: 'payment', label: 'Payment button', description: 'A heading with a secure “Pay now” button.' }],
    renderSection: ({ config, placement }) => btnSection({ title: placement.title ?? 'Pay online', text: placement.text ?? 'Secure checkout by Stripe.', label: config.label, href: config.url }),
    csp: {}
  },
  {
    id: 'square_link', name: 'Square Checkout', category: 'payments', color: '#3e4348', complexity: 'Easy', auth: 'config',
    description: 'Add a Square checkout link as a payment button.',
    features: ['“Pay now” button on any page', 'Payments handled by Square'],
    capabilities: ['payment'], permissions: ['A public Square checkout link'],
    configSchema: [{ key: 'url', label: 'Your Square checkout link', type: 'url', required: true, placeholder: 'https://square.link/u/…' }, { key: 'label', label: 'Button text', type: 'text', placeholder: 'Pay now' }],
    setup: ['In Square, create a checkout link (Online → Checkout links).', 'Copy it and paste it here.', 'Add the payment button to any page.'],
    async validate({ config }) {
      const u = httpsUrl(config.url, ['square.link', 'square.site', 'squareup.com'], 'Square checkout');
      const r = await reachable(u.toString());
      if (!r.ok) throw new Error(r.error);
      return { config: { url: u.toString(), label: text(config.label, 40) || 'Pay now' } };
    },
    placements: [{ kind: 'payment', label: 'Payment button', description: 'A heading with a “Pay now” button.' }],
    renderSection: ({ config, placement }) => btnSection({ title: placement.title ?? 'Pay online', text: placement.text ?? 'Secure checkout by Square.', label: config.label, href: config.url }),
    csp: {}
  },
  {
    id: 'paypal', name: 'PayPal', category: 'payments', color: '#003087', complexity: 'Easy', auth: 'config',
    description: 'Let customers pay you with PayPal from a button on your site.',
    features: ['PayPal button on any page', 'Works with PayPal.Me and PayPal payment links'],
    capabilities: ['payment'], permissions: ['Your public PayPal.Me or PayPal payment link'],
    configSchema: [{ key: 'url', label: 'Your PayPal link', type: 'url', required: true, placeholder: 'https://paypal.me/yourbusiness', help: 'A PayPal.Me link, or a payment link from PayPal → Pay & Get Paid → Payment links.' }, { key: 'label', label: 'Button text', type: 'text', placeholder: 'Pay with PayPal' }],
    setup: ['Copy your PayPal.Me link or a PayPal payment link.', 'Paste it here and press Connect.', 'Add the PayPal button to any page.'],
    async validate({ config }) {
      const u = httpsUrl(config.url, ['paypal.me', 'paypal.com'], 'PayPal');
      const r = await reachable(u.toString());
      if (!r.ok) throw new Error(r.error);
      return { config: { url: u.toString(), label: text(config.label, 40) || 'Pay with PayPal' } };
    },
    placements: [{ kind: 'payment', label: 'PayPal button', description: 'A heading with a PayPal button.' }],
    renderSection: ({ config, placement }) => btnSection({ title: placement.title ?? 'Pay online', text: placement.text ?? 'Pay securely with PayPal.', label: config.label, href: config.url }),
    csp: {}
  },

  // ============================ Marketing & CRM ============================
  {
    id: 'hubspot', name: 'HubSpot', category: 'marketing', color: '#ff7a59', complexity: 'Medium', auth: 'api_key',
    description: 'Every contact form message becomes a contact in your HubSpot CRM.',
    features: ['New website leads appear in HubSpot automatically', 'Captures name, email, phone and the message', 'Works with all forms on your site'],
    capabilities: ['crm', 'lead_delivery'], forms: ['*'],
    permissions: ['crm.objects.contacts.write — create contacts', 'crm.objects.contacts.read — confirm the connection'],
    secretSchema: [{ key: 'token', label: 'Private app access token', placeholder: 'pat-na1-…', help: 'HubSpot → Settings → Integrations → Private Apps → Create. Tick only the two contact scopes above.' }],
    setup: ['In HubSpot, go to Settings → Integrations → Private Apps and create an app.', 'Give it only these scopes: crm.objects.contacts.read and crm.objects.contacts.write.', 'Copy the access token, paste it here and press Connect. We test it before saving.'],
    oauth: { authorizeUrl: 'https://app.hubspot.com/oauth/authorize', tokenUrl: 'https://api.hubapi.com/oauth/v1/token', scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write'] },
    async validate({ secrets }) {
      const token = text(secrets.token || secrets.accessToken, 400);
      if (!token) throw new Error('Paste your HubSpot private app token.');
      const res = await http('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', { headers: { authorization: `Bearer ${token}` } });
      if (res.status === 401) throw new Error('HubSpot rejected that token. Copy it again from your private app.');
      if (res.status === 403) throw new Error('That token is missing the contact scopes. Add crm.objects.contacts.read and crm.objects.contacts.write to the private app.');
      if (!res.ok) throw new Error(`HubSpot returned an error (${res.status}). Try again shortly.`);
      return { config: { connectedAs: 'HubSpot CRM' }, secrets: { ...secrets, token } };
    },
    async onFormSubmission({ secrets, submission }) {
      const f = submission.fields;
      const email = f.email || f.Email;
      if (!email) return; // HubSpot contacts need an email
      const [first, ...rest] = String(f.name || f.Name || '').trim().split(/\s+/);
      const properties = { email, ...(first ? { firstname: first } : {}), ...(rest.length ? { lastname: rest.join(' ') } : {}), ...(f.phone ? { phone: f.phone } : {}) };
      const res = await http('https://api.hubapi.com/crm/v3/objects/contacts', { method: 'POST', headers: { authorization: `Bearer ${secrets.token || secrets.accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ properties }) });
      if (res.status === 409) return; // already a contact: nothing to do
      if (res.status === 401 || res.status === 403) { const e = new Error('HubSpot no longer accepts the saved token.'); e.auth = true; throw e; }
      if (!res.ok) throw new Error(`HubSpot returned ${res.status}`);
    },
    csp: {}
  },
  {
    id: 'mailchimp', name: 'Mailchimp', category: 'marketing', color: '#ffe01b', ink: '#241c15', complexity: 'Medium', auth: 'api_key',
    description: 'Add a newsletter signup to your site that fills your Mailchimp audience.',
    features: ['Newsletter signup form on any page', 'New subscribers go straight into your audience', 'Optional double opt-in'],
    capabilities: ['email_list', 'lead_delivery'], forms: ['newsletter'],
    permissions: ['An API key for your Mailchimp account (used only to add subscribers to the audience you choose)'],
    secretSchema: [{ key: 'apiKey', label: 'Mailchimp API key', placeholder: 'xxxxxxxxxxxxxxxxxxxx-us21', help: 'Mailchimp → Profile → Extras → API keys → Create a key.' }],
    configSchema: [{ key: 'listId', label: 'Audience', type: 'select', dynamic: 'lists', help: 'Chosen after your key is checked.' },
      { key: 'doubleOptIn', label: 'Ask new subscribers to confirm by email', type: 'checkbox' }],
    setup: ['In Mailchimp, open Profile → Extras → API keys and create a key.', 'Paste it here and press Connect. We check it and list your audiences.', 'Pick the audience, then add the signup form to any page.'],
    oauth: { authorizeUrl: 'https://login.mailchimp.com/oauth2/authorize', tokenUrl: 'https://login.mailchimp.com/oauth2/token', metadataUrl: 'https://login.mailchimp.com/oauth2/metadata', scopes: [] },
    async validate({ config, secrets }) {
      const key = text(secrets.apiKey || secrets.accessToken, 200);
      const dc = secrets.dc || (key.match(/-([a-z]{2,4}\d{1,3})$/) || [])[1];
      if (!key || !dc) throw new Error('That doesn’t look like a Mailchimp API key. It ends with a dash and a code like “us21”.');
      const auth = { authorization: 'Basic ' + Buffer.from('anystring:' + key).toString('base64') };
      const base = `https://${dc}.api.mailchimp.com/3.0`;
      const ping = await http(base + '/ping', { headers: auth });
      if (ping.status === 401 || ping.status === 403) throw new Error('Mailchimp rejected that key. Create a new one and try again.');
      if (!ping.ok) throw new Error(`Mailchimp returned an error (${ping.status}).`);
      const lists = await http(base + '/lists?count=50&fields=lists.id,lists.name', { headers: auth });
      const options = lists.ok ? ((await lists.json()).lists || []).map(l => ({ value: l.id, label: l.name })) : [];
      if (!options.length) throw new Error('Your Mailchimp account has no audience yet. Create one in Mailchimp first.');
      const listId = options.some(o => o.value === config.listId) ? config.listId : (options.length === 1 ? options[0].value : '');
      return { config: { listId, doubleOptIn: !!config.doubleOptIn, audienceName: options.find(o => o.value === listId)?.label || '' }, secrets: { ...secrets, apiKey: key, dc }, options: { lists: options }, needs: listId ? null : 'Choose which audience new subscribers should join.' };
    },
    async onFormSubmission({ config, secrets, submission }) {
      const email = submission.fields.email || submission.fields.Email;
      if (!email || !config.listId) return;
      const key = secrets.apiKey || secrets.accessToken;
      const hash = crypto.createHash('md5').update(String(email).toLowerCase()).digest('hex');
      const [first, ...rest] = String(submission.fields.name || '').trim().split(/\s+/);
      const res = await http(`https://${secrets.dc}.api.mailchimp.com/3.0/lists/${encodeURIComponent(config.listId)}/members/${hash}`, {
        method: 'PUT', headers: { authorization: 'Basic ' + Buffer.from('anystring:' + key).toString('base64'), 'content-type': 'application/json' },
        body: JSON.stringify({ email_address: email, status_if_new: config.doubleOptIn ? 'pending' : 'subscribed', merge_fields: { ...(first ? { FNAME: first } : {}), ...(rest.length ? { LNAME: rest.join(' ') } : {}) } })
      });
      if (res.status === 401 || res.status === 403) { const e = new Error('Mailchimp no longer accepts the saved key.'); e.auth = true; throw e; }
      if (!res.ok) throw new Error(`Mailchimp returned ${res.status}`);
    },
    placements: [{ kind: 'newsletter', label: 'Newsletter signup', description: 'An email signup form.' }],
    renderSection: ({ placement }) => `<div class="w-container"><div class="w-head" data-reveal><h2 class="w-h2">${esc(placement.title ?? 'Stay in the loop')}</h2><p class="w-lead">${esc(placement.text ?? 'Occasional news and offers. No spam, unsubscribe anytime.')}</p></div>
<form class="w-form" data-form="newsletter" data-success="Thanks for signing up!" data-reveal style="max-width:520px"><div class="w-row"><div><label class="w-label" for="nl-name">Name</label><input class="w-input" id="nl-name" name="name" autocomplete="name"></div><div><label class="w-label" for="nl-email">Email</label><input class="w-input" id="nl-email" name="email" type="email" autocomplete="email" required></div></div><button class="w-btn w-btn--primary" type="submit">${esc(placement.button ?? 'Sign up')}</button><p class="w-form-status" data-form-status role="status" aria-live="polite"></p></form></div>`,
    csp: {}
  },
  {
    id: 'ga4', name: 'Google Analytics', category: 'marketing', color: '#e37400', complexity: 'Easy', auth: 'config',
    description: 'See how visitors find and use your site in Google Analytics 4.',
    features: ['Page views and traffic sources in GA4', 'Loaded by the platform, no code to paste'],
    capabilities: ['analytics'], permissions: ['Your GA4 Measurement ID (it is public by design)'],
    configSchema: [{ key: 'measurementId', label: 'Measurement ID', type: 'text', required: true, placeholder: 'G-XXXXXXXXXX', help: 'Google Analytics → Admin → Data streams → your web stream.' }],
    setup: ['In Google Analytics, open Admin → Data streams and choose your website stream.', 'Copy the Measurement ID (it starts with “G-”) and paste it here.', 'Publish your site, then open Realtime in Google Analytics to see your own visit.'],
    async validate({ config }) {
      const id = text(config.measurementId, 20).toUpperCase();
      if (!/^G-[A-Z0-9]{6,14}$/.test(id)) throw new Error('A Measurement ID looks like G-AB12CD34EF.');
      const res = await http(`https://www.googletagmanager.com/gtag/js?id=${id}`, { method: 'GET' });
      if (!res.ok) throw new Error('Google does not recognise that Measurement ID. Check it in Admin → Data streams.');
      return { config: { measurementId: id }, note: 'Google does not let us confirm who owns an ID. After publishing, check Realtime in Google Analytics to confirm visits arrive.' };
    },
    runtime: ({ config }) => ({ 'data-ga': config.measurementId }),
    csp: { script: ['https://www.googletagmanager.com'], connect: ['https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.googletagmanager.com'], img: true }
  },
  {
    id: 'meta_pixel', name: 'Meta Pixel', category: 'marketing', color: '#0866ff', complexity: 'Easy', auth: 'config',
    description: 'Measure and build audiences for Facebook and Instagram ads.',
    features: ['PageView events sent to Meta', 'Loaded by the platform, no code to paste'],
    capabilities: ['analytics'], permissions: ['Your Pixel ID (public by design)'],
    configSchema: [{ key: 'pixelId', label: 'Pixel ID', type: 'text', required: true, placeholder: '123456789012345', help: 'Meta Events Manager → Data sources → your pixel → Settings.' }],
    setup: ['In Meta Events Manager, open your pixel and copy its ID (15–16 digits).', 'Paste it here and press Connect.', 'Publish, then use Meta’s “Test events” to confirm.'],
    async validate({ config }) {
      const id = text(config.pixelId, 20).replace(/\D/g, '');
      if (!/^\d{14,17}$/.test(id)) throw new Error('A Pixel ID is 15 or 16 digits.');
      return { config: { pixelId: id }, note: 'Meta does not let us confirm a Pixel ID from here. After publishing, use “Test events” in Events Manager to confirm.' };
    },
    runtime: ({ config }) => ({ 'data-fbq': config.pixelId }),
    csp: { script: ['https://connect.facebook.net'], connect: ['https://www.facebook.com', 'https://connect.facebook.net'], img: true }
  },

  // ============================ Forms & Leads ============================
  {
    id: 'lead_emails', name: 'Lead Notifications', category: 'forms', color: '#0f766e', complexity: 'Easy', auth: 'config', builtin: true,
    description: 'Send every website message to extra people on your team.',
    features: ['Up to five extra email addresses', 'Works with contact, quote and booking forms'],
    capabilities: ['lead_delivery'], forms: ['*'], permissions: ['The email addresses you enter'],
    configSchema: [{ key: 'emails', label: 'Extra email addresses', type: 'text', required: true, placeholder: 'sales@you.com, owner@you.com', help: 'Separate with commas.' }],
    setup: ['Enter the extra addresses that should receive website messages.', 'Press Connect. New messages are copied to them from now on.'],
    async validate({ config, platform }) {
      const emails = String(config.emails || '').split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(Boolean).slice(0, 5);
      if (!emails.length || emails.some(e => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e))) throw new Error('Enter one or more valid email addresses, separated by commas.');
      if (!platform.emailConfigured) return { config: { emails: emails.join(', ') }, needs: 'Email sending is not switched on for the platform yet. Your web team needs to finish that setup; your addresses are saved.' };
      return { config: { emails: emails.join(', ') } };
    },
    async onFormSubmission({ config, submission }) {
      const { formSubmission } = await import('../email.js');
      for (const to of String(config.emails || '').split(',').map(e => e.trim()).filter(Boolean)) {
        const r = await formSubmission(to, submission.businessName, submission.form, submission.fields, submission.page);
        if (r?.error) throw new Error('Email could not be sent');
      }
    },
    csp: {}
  },
  {
    id: 'webhook', name: 'Webhook', category: 'forms', color: '#475569', complexity: 'Advanced', auth: 'api_key', builtin: true,
    description: 'Send every form submission to your own system, Zapier or Make.',
    features: ['JSON POST for each submission', 'Signed so your system can verify it came from us', 'Works with Zapier, Make and custom apps'],
    capabilities: ['lead_delivery'], forms: ['*'], permissions: ['An HTTPS address you control'],
    configSchema: [{ key: 'url', label: 'Webhook address', type: 'url', required: true, placeholder: 'https://hooks.zapier.com/hooks/catch/…' }],
    secretSchema: [{ key: 'secret', label: 'Signing secret (optional)', placeholder: 'Leave blank to have one generated', optional: true, help: 'Sent as an HMAC-SHA256 signature in the X-499-Signature header.' }],
    setup: ['Create a “catch hook” in Zapier/Make, or an HTTPS endpoint in your own system.', 'Paste its address here and press Connect. We send a test message and need a success reply.', 'Each form submission is then POSTed as JSON.'],
    async validate({ config, secrets }) {
      const u = await assertPublicHttpsUrl(config.url);
      const secret = text(secrets.secret, 200) || crypto.randomBytes(24).toString('base64url');
      const body = JSON.stringify({ type: 'test', message: 'Connection test from 499 Web Co.' });
      const res = await http(u.toString(), { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', 'x-499-signature': sign(secret, body), 'user-agent': '499WebCo-Webhook/1.0' }, body });
      if (res.status < 200 || res.status >= 300) throw new Error(`Your endpoint answered the test with status ${res.status}. It needs to reply with a 2xx success code.`);
      return { config: { url: u.toString() }, secrets: { secret } };
    },
    async onFormSubmission({ config, secrets, submission }) {
      const u = await assertPublicHttpsUrl(config.url);
      const body = JSON.stringify({ type: 'form.submitted', id: submission.id, form: submission.form, page: submission.page, fields: submission.fields, at: new Date().toISOString() });
      const res = await http(u.toString(), { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', 'x-499-signature': sign(secrets.secret || '', body), 'user-agent': '499WebCo-Webhook/1.0' }, body });
      if (res.status < 200 || res.status >= 300) throw new Error(`Webhook answered ${res.status}`);
    },
    csp: {}
  },

  // ============================ Communication ============================
  {
    id: 'whatsapp', name: 'WhatsApp', category: 'communication', color: '#25d366', complexity: 'Easy', auth: 'config',
    description: 'A “Chat on WhatsApp” button that opens a conversation with you.',
    features: ['Floating chat button on every page', 'Opens WhatsApp with your number', 'Optional pre-filled greeting'],
    capabilities: ['chat'], permissions: ['Your WhatsApp phone number'],
    configSchema: [{ key: 'phone', label: 'WhatsApp number (with country code)', type: 'tel', required: true, placeholder: '+1 404 555 0142' }, { key: 'greeting', label: 'Pre-filled message (optional)', type: 'text', placeholder: 'Hi! I found you through your website.' }],
    setup: ['Enter the number you use for WhatsApp, including the country code.', 'Press Connect. A chat button appears on every page after you publish.'],
    async validate({ config }) {
      const digits = String(config.phone || '').replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 15) throw new Error('Enter the full number including the country code, e.g. +1 404 555 0142.');
      return { config: { phone: digits, greeting: text(config.greeting, 160) }, note: 'We can’t check that this number has WhatsApp. Tap the button on your published site to confirm.' };
    },
    bodyEnd: ({ config }) => `<a class="w-wa" href="https://wa.me/${esc(config.phone)}${config.greeting ? '?text=' + encodeURIComponent(config.greeting) : ''}" target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 00-7.8 13.5L3 21l4.6-1.2A9 9 0 1012 3z"/><path d="M9 9.5c0 3 2.5 5.500 5.500 5.500l1-1.500-2-1-1 1c-1-.400-1.600-1-2-2l1-1-1-2z"/></svg></a>`,
    csp: {}
  },
  {
    id: 'tawk', name: 'Tawk.to Live Chat', category: 'communication', color: '#03a84e', complexity: 'Medium', auth: 'config',
    description: 'Free live chat widget so visitors can message you in real time.',
    features: ['Chat bubble on every page', 'Answer from the Tawk.to app or dashboard'],
    capabilities: ['chat'], permissions: ['Your Tawk.to Property ID and Widget ID (public by design)'],
    configSchema: [{ key: 'propertyId', label: 'Property ID', type: 'text', required: true, placeholder: '64a1b2c3d4e5f6a7b8c9d0e1' }, { key: 'widgetId', label: 'Widget ID', type: 'text', required: true, placeholder: '1h2j3k4l5', help: 'Tawk.to → Administration → Chat Widget. The two IDs are in the widget code: …/PROPERTY_ID/WIDGET_ID' }],
    setup: ['In Tawk.to, open Administration → Chat Widget.', 'Find the address in the widget code: embed.tawk.to/PROPERTY_ID/WIDGET_ID.', 'Paste both IDs here and press Connect.'],
    async validate({ config }) {
      const p = text(config.propertyId, 40), w = text(config.widgetId, 40);
      if (!/^[a-f0-9]{24}$/i.test(p)) throw new Error('A Tawk.to Property ID is 24 letters and numbers.');
      if (!/^[a-z0-9]{6,20}$/i.test(w)) throw new Error('That Widget ID doesn’t look right. Copy it from the widget code.');
      const res = await http(`https://embed.tawk.to/${p}/${w}`, { method: 'GET' });
      if (!res.ok) throw new Error('Tawk.to does not recognise those IDs. Copy them again from the widget code.');
      return { config: { propertyId: p, widgetId: w } };
    },
    runtime: ({ config }) => ({ 'data-tawk': `${config.propertyId}/${config.widgetId}` }),
    csp: { relaxed: true }
  },
  {
    id: 'crisp', name: 'Crisp Chat', category: 'communication', color: '#1972f5', complexity: 'Medium', auth: 'config',
    description: 'Live chat and shared inbox for your website.',
    features: ['Chat bubble on every page', 'Reply from the Crisp inbox or mobile app'],
    capabilities: ['chat'], permissions: ['Your Crisp Website ID (public by design)'],
    configSchema: [{ key: 'websiteId', label: 'Website ID', type: 'text', required: true, placeholder: '7598bf86-9ebb-46bc-8c61-be8929bbf93d', help: 'Crisp → Settings → Website Settings → Setup instructions.' }],
    setup: ['In Crisp, open Settings → Website Settings → Setup instructions.', 'Copy the Website ID and paste it here.', 'Press Connect, then publish.'],
    async validate({ config }) {
      const id = text(config.websiteId, 40).toLowerCase();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new Error('A Crisp Website ID looks like 7598bf86-9ebb-46bc-8c61-be8929bbf93d.');
      return { config: { websiteId: id }, note: 'Crisp does not let us confirm a Website ID from here. Open your published site to see the chat bubble.' };
    },
    runtime: ({ config }) => ({ 'data-crisp': config.websiteId }),
    csp: { relaxed: true }
  },

  // ============================ Reputation & Social ============================
  {
    id: 'google_reviews', name: 'Google Review Link', category: 'reputation', color: '#ea4335', complexity: 'Easy', auth: 'config',
    description: 'Make it easy for happy customers to leave you a Google review.',
    features: ['“Review us on Google” block on any page', 'Opens your review form directly'],
    capabilities: ['reviews'], permissions: ['Your public Google review link'],
    configSchema: [{ key: 'url', label: 'Your Google review link', type: 'url', required: true, placeholder: 'https://g.page/r/…/review', help: 'Google Business Profile → Ask for reviews → Copy link.' }],
    setup: ['In your Google Business Profile, choose “Ask for reviews” and copy the link.', 'Paste it here and press Connect.', 'Add the review block to any page.'],
    async validate({ config }) {
      const u = httpsUrl(config.url, ['g.page', 'google.com', 'goo.gl', 'maps.app.goo.gl'], 'Google review');
      const r = await reachable(u.toString());
      if (!r.ok) throw new Error(r.error);
      return { config: { url: u.toString() } };
    },
    placements: [{ kind: 'reviews', label: '“Review us” block', description: 'A short invitation with a button to your Google review form.' }],
    renderSection: ({ config, placement }) => btnSection({ title: placement.title ?? 'Happy with our work?', text: placement.text ?? 'A quick Google review helps other local customers find us.', label: 'Review us on Google', href: config.url }),
    csp: {}
  },
  {
    id: 'google_reviews_widget', name: 'Google Reviews Display', category: 'reputation', color: '#fbbc05', ink: '#241c15', complexity: 'Advanced', auth: 'oauth', unavailable: true,
    description: 'Show your live Google reviews on your website.',
    features: ['Would display your real Google reviews'],
    capabilities: ['reviews'], permissions: ['Google Business Profile API access'],
    availabilityNote: 'Not available yet. Showing live Google reviews needs Google Business Profile API access, which Google grants per company after an approval process. Until that is approved for the platform, real reviews can be added to your site by hand in the editor, and the “Google Review Link” integration is available now.',
    setup: [], async validate() { throw new Error('This integration is not available yet.'); }, csp: {}
  },
  {
    id: 'social_links', name: 'Social Profiles', category: 'reputation', color: '#7c3aed', complexity: 'Easy', auth: 'config', builtin: true,
    description: 'A tidy row of links to your social media profiles.',
    features: ['Facebook, Instagram, TikTok, X, LinkedIn and YouTube', 'Icons match your site’s colours'],
    capabilities: ['social'], permissions: ['Your public profile links'],
    configSchema: ['facebook', 'instagram', 'tiktok', 'x', 'linkedin', 'youtube'].map(k => ({ key: k, label: k === 'x' ? 'X (Twitter)' : k[0].toUpperCase() + k.slice(1), type: 'url', placeholder: `https://${k === 'x' ? 'x' : k}.com/yourbusiness` })),
    setup: ['Paste the links to the profiles you want to show. Leave the others blank.', 'Press Connect, then add the “Follow us” block to any page.'],
    async validate({ config }) {
      const hosts = { facebook: ['facebook.com', 'fb.com'], instagram: ['instagram.com'], tiktok: ['tiktok.com'], x: ['x.com', 'twitter.com'], linkedin: ['linkedin.com'], youtube: ['youtube.com', 'youtu.be'] };
      const out = {};
      for (const [k, h] of Object.entries(hosts)) { if (text(config[k])) out[k] = httpsUrl(config[k], h, k === 'x' ? 'X' : k[0].toUpperCase() + k.slice(1)).toString(); }
      if (!Object.keys(out).length) throw new Error('Add at least one profile link.');
      return { config: out };
    },
    placements: [{ kind: 'social', label: '“Follow us” links', description: 'A heading with links to your profiles.' }],
    renderSection: ({ config, placement }) => {
      const names = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', x: 'X', linkedin: 'LinkedIn', youtube: 'YouTube' };
      const links = Object.entries(names).filter(([k]) => config[k]).map(([k, n]) => `<a class="w-btn w-btn--ghost" href="${esc(config[k])}" target="_blank" rel="noopener noreferrer">${n}</a>`).join('');
      return `<div class="w-container"><div data-reveal><h2 class="w-h2">${esc(placement.title ?? 'Follow along')}</h2>${placement.text ? `<p class="w-lead">${esc(placement.text)}</p>` : ''}<div class="w-actions">${links}</div></div></div>`;
    },
    csp: {}
  },
  {
    id: 'social_feed', name: 'Instagram / Facebook Feed', category: 'reputation', color: '#e1306c', complexity: 'Advanced', auth: 'oauth', unavailable: true,
    description: 'Show your latest social posts on your website.',
    features: ['Would display your latest posts automatically'],
    capabilities: ['social'], permissions: ['Meta Graph API access (app review required)'],
    availabilityNote: 'Not available yet. Meta only allows live feeds through an app that has passed its review, and tokens must be refreshed regularly. Until the platform has that approval, use “Social Profiles” to link to your pages.',
    setup: [], async validate() { throw new Error('This integration is not available yet.'); }, csp: {}
  },

  // ============================ Maps ============================
  {
    id: 'google_maps', name: 'Google Maps', category: 'maps', color: '#34a853', complexity: 'Easy', auth: 'config',
    description: 'Show your location on a Google map so customers can find you.',
    features: ['Interactive map on any page', 'No Google account or API key needed'],
    capabilities: ['map'], permissions: ['The address you want to show'],
    configSchema: [{ key: 'address', label: 'Address to show', type: 'text', required: true, placeholder: '120 Main St, Dacula, GA 30019' }],
    setup: ['Enter your street address.', 'Press Connect, then add the map to any page.'],
    async validate({ config }) {
      const address = text(config.address, 200);
      if (address.length < 6) throw new Error('Enter a full street address.');
      return { config: { address }, note: 'Check the pin on your published page. Google places it from the address text.' };
    },
    placements: [{ kind: 'map', label: 'Location map', description: 'A map with your address pinned.' }],
    renderSection: ({ config, placement }) => `<div class="w-container">${placement.title !== '' ? `<div class="w-head" data-reveal><h2 class="w-h2">${esc(placement.title ?? 'Find us')}</h2><p class="w-lead">${esc(config.address)}</p></div>` : ''}<div class="w-embed w-map" data-reveal><iframe title="Map showing ${esc(config.address)}" src="https://www.google.com/maps?q=${encodeURIComponent(config.address)}&amp;output=embed" loading="lazy"></iframe></div></div>`,
    csp: { frame: ['https://www.google.com'] }
  },
  {
    id: 'mapbox', name: 'Mapbox', category: 'maps', color: '#4264fb', complexity: 'Advanced', auth: 'config',
    description: 'A clean, brand-friendly map image of your location.',
    features: ['Fast static map (no scripts)', 'Pin at your exact address', 'Links to directions'],
    capabilities: ['map'], permissions: ['A Mapbox PUBLIC token (starts with “pk.”). Restrict it to your domain in Mapbox.'],
    configSchema: [{ key: 'token', label: 'Mapbox public token', type: 'text', required: true, placeholder: 'pk.eyJ…', help: 'Mapbox → Account → Access tokens. Use a public (pk.) token and add your website under URL restrictions.' }, { key: 'address', label: 'Address to show', type: 'text', required: true, placeholder: '120 Main St, Dacula, GA 30019' }],
    setup: ['In Mapbox, create a public access token and restrict it to your website’s address.', 'Paste the token and your address here. We check the token and look up the location.', 'Add the map to any page.'],
    async validate({ config }) {
      const token = text(config.token, 300), address = text(config.address, 200);
      if (!/^pk\./.test(token)) throw new Error('Use a Mapbox PUBLIC token (it starts with “pk.”). Secret tokens (sk.) must never be used on a website.');
      if (address.length < 6) throw new Error('Enter a full street address.');
      const check = await http(`https://api.mapbox.com/tokens/v2?access_token=${encodeURIComponent(token)}`);
      const cj = check.ok ? await check.json() : {};
      if (cj.code !== 'TokenValid') throw new Error('Mapbox says that token is not valid. Create a new public token and try again.');
      const geo = await http(`https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(address)}&limit=1&access_token=${encodeURIComponent(token)}`);
      const gj = geo.ok ? await geo.json() : {};
      const c = gj.features?.[0]?.geometry?.coordinates;
      if (!Array.isArray(c)) throw new Error('Mapbox could not find that address. Check the spelling.');
      return { config: { token, address, lon: Number(c[0].toFixed(6)), lat: Number(c[1].toFixed(6)) } };
    },
    placements: [{ kind: 'map', label: 'Location map', description: 'A map image with your address pinned.' }],
    renderSection: ({ config, placement }) => {
      const src = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+d33(${config.lon},${config.lat})/${config.lon},${config.lat},14,0/1200x520@2x?access_token=${encodeURIComponent(config.token)}`;
      return `<div class="w-container">${placement.title !== '' ? `<div class="w-head" data-reveal><h2 class="w-h2">${esc(placement.title ?? 'Find us')}</h2><p class="w-lead">${esc(config.address)}</p></div>` : ''}<a class="w-media" data-reveal href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(config.address)}" target="_blank" rel="noopener noreferrer" style="display:block"><img src="${esc(src)}" alt="Map showing ${esc(config.address)}" loading="lazy" width="1200" height="520"></a></div>`;
    },
    csp: { img: true }
  }
];

export function sign(secret, body) {
  return 'sha256=' + crypto.createHmac('sha256', String(secret)).update(body).digest('hex');
}
