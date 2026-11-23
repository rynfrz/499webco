// Stage A groundwork: the canonical facts about a business, taken only from
// what the prospect and the administrator actually supplied. Every later stage
// reads these facts; nothing here is invented.
import { industryFor } from '../design/direction.js';

const list = v => (Array.isArray(v) ? v : String(v || '').split('\n')).map(x => String(x).trim()).filter(Boolean);

/** Normalised facts from an existing project record. */
export function factsFromProject(project) {
  const b = project.business || {};
  const q = project.questionnaire || {};
  const lead = project.lead || {};
  const brief = project.briefInput || {};
  const reviews = (b.reviews || []).filter(r => r && r.text).map(r => ({ text: String(r.text).slice(0, 600), author: String(r.author || '').slice(0, 80), rating: r.rating ? String(r.rating).slice(0, 4) : '' })).slice(0, 12);
  const integrations = Object.entries(q.integrations || {}).filter(([, v]) => v?.enabled).map(([k, v]) => ({ key: k, url: v.url || '', ...v }));
  return {
    name: String(b.name || '').trim(),
    type: b.type || 'Other Local Business',
    industry: industryFor(b.type),
    city: String(b.city || '').trim(),
    state: String(b.state || '').trim(),
    address: String(b.address || '').trim(),
    phone: String(b.phone || '').trim(),
    email: String(b.email || '').trim(),
    hours: String(b.hours || '').trim(),
    currentUrl: String(b.currentUrl || '').trim(),
    description: String(b.description || '').trim(),
    tagline: String(b.tagline || '').trim(),
    services: list(b.services).slice(0, 30),
    menu: String(b.menu || '').trim(),
    reviews,
    photos: list(b.photos).filter(u => /^https:\/\//i.test(u)).slice(0, 24),
    hasLogo: !!b.logo,
    logoColors: list(b.logoColors).slice(0, 5),
    // Structured lead/brief fields added in 2.0 (all optional)
    targetAudience: String(brief.targetAudience || '').trim(),
    goals: String(brief.goals || '').trim(),
    differentiators: String(brief.differentiators || '').trim(),
    serviceArea: String(brief.serviceArea || '').trim(),
    brandPersonality: String(brief.brandPersonality || q.vibe?.tone || '').trim(),
    conversionGoal: String(brief.conversionGoal || '').trim(),
    desiredPageCount: Number.isFinite(+brief.desiredPageCount) && +brief.desiredPageCount > 0 ? Math.min(20, +brief.desiredPageCount) : null,
    package: String(brief.package || '').trim(),
    requestedIntegrations: integrations,
    requestedPages: list(q.pages),
    adminInstructions: [q.designNotes, q.vibe?.mustHave && `Must include: ${q.vibe.mustHave}`, q.vibe?.avoid && `Avoid: ${q.vibe.avoid}`, brief.instructions].filter(Boolean).join('\n').trim(),
    prospectNotes: String(lead.notes || '').trim(),
    analysis: project.analysis ? { about: project.analysis.extracted?.about || '', verdict: project.analysis.verdict || '' } : null
  };
}

/** Facts the site would be better with. Reported, never fabricated. */
export function missingFacts(f) {
  const missing = [];
  if (!f.phone) missing.push({ key: 'phone', label: 'Phone number', impact: 'No click-to-call button can be shown.' });
  if (!f.email) missing.push({ key: 'email', label: 'Email address', impact: 'Contact form messages have nowhere to go.' });
  if (!f.address) missing.push({ key: 'address', label: 'Street address', impact: 'No map or directions link; weaker local SEO.' });
  if (!f.hours) missing.push({ key: 'hours', label: 'Opening hours', impact: 'Hours are left off the site.' });
  if (!f.description) missing.push({ key: 'description', label: 'Business description / story', impact: 'The About content will be brief and generic.' });
  if (!f.services.length && !f.menu) missing.push({ key: 'services', label: 'Services or products', impact: 'Service pages cannot be specific.' });
  if (!f.reviews.length) missing.push({ key: 'reviews', label: 'Customer reviews', impact: 'No testimonials are shown (none are ever invented).' });
  if (!f.photos.length) missing.push({ key: 'photos', label: 'Photos of the business', impact: 'The design uses typography and graphics instead of photography.' });
  if (!f.hasLogo) missing.push({ key: 'logo', label: 'Logo', impact: 'A text wordmark is used.' });
  return missing;
}

/** A deterministic brief used in demo mode and as the fallback shape. */
export function basicBrief(f) {
  const where = [f.city, f.state].filter(Boolean).join(', ');
  return {
    business: { name: f.name, type: f.type, industry: f.industry, city: f.city, state: f.state, address: f.address, phone: f.phone, email: f.email, hours: f.hours, description: f.description },
    summary: f.description ? f.description.slice(0, 300) : `${f.name}${where ? ' in ' + where : ''} — ${f.type.toLowerCase()}.`,
    positioning: f.tagline || '',
    audience: f.targetAudience || '',
    goals: f.goals ? [f.goals] : [],
    primaryAction: primaryAction(f),
    differentiators: list(f.differentiators),
    tone: f.brandPersonality || '',
    services: f.services,
    proof: { reviews: f.reviews.length, photos: f.photos.length },
    missing: missingFacts(f),
    cautions: []
  };
}

/** The single most useful action for a visitor, from what we actually know. */
export function primaryAction(f) {
  const i = Object.fromEntries((f.requestedIntegrations || []).map(x => [x.key, x]));
  if (i.calendly?.url) return { label: 'Book online', href: i.calendly.url, kind: 'booking' };
  if (i.opentable?.url) return { label: 'Reserve a table', href: i.opentable.url, kind: 'booking' };
  if (i.doordash?.url) return { label: 'Order online', href: i.doordash.url, kind: 'order' };
  if (i.stripe?.url) return { label: 'Pay online', href: i.stripe.url, kind: 'pay' };
  if (f.phone) return { label: `Call ${f.phone}`, href: 'tel:' + f.phone.replace(/[^\d+]/g, ''), kind: 'call' };
  return { label: 'Get in touch', href: '/contact/', kind: 'contact' };
}

/** Human-readable facts block shared by every generation prompt. */
export function factsBlock(f) {
  const L = [];
  const add = (k, v) => { if (v && String(v).trim()) L.push(`${k}: ${v}`); };
  add('Business name', f.name);
  add('Business type', f.type);
  add('Industry category', f.industry);
  add('Location', [f.city, f.state].filter(Boolean).join(', '));
  add('Service area', f.serviceArea);
  add('Address', f.address);
  add('Phone', f.phone);
  add('Email', f.email);
  if (f.hours) L.push(`Hours:\n${f.hours}`);
  add('Existing website', f.currentUrl);
  add('Description / story', f.description);
  add('Tagline in the owner\'s words', f.tagline);
  if (f.services.length) L.push(`Products / services:\n${f.services.map(s => '- ' + s).join('\n')}`);
  if (f.menu) L.push(`Menu highlights (real items):\n${f.menu}`);
  add('Target audience', f.targetAudience);
  add('Brand personality', f.brandPersonality);
  add('Differentiators', f.differentiators);
  add('Business objectives', f.goals);
  add('Conversion goal', f.conversionGoal);
  if (f.reviews.length) L.push(`Real customer reviews (use verbatim or lightly trimmed; never invent more):\n${f.reviews.map(r => `- "${r.text}" — ${r.author || 'Customer'}${r.rating ? `, ${r.rating} stars` : ''}`).join('\n')}`);
  else L.push('Customer reviews: NONE PROVIDED. Do not write testimonials, star ratings or review counts.');
  if (f.photos.length) L.push(`Real photo URLs supplied by the business (the only images you may use):\n${f.photos.map(u => '- ' + u).join('\n')}`);
  else L.push('Photos: NONE PROVIDED. Do not use <img> tags or reference any photo URL; design with typography, colour, shape and inline SVG.');
  L.push(f.hasLogo ? 'Logo: provided. Use the literal token {{LOGO_SRC}} as the logo image src.' : 'Logo: none. Set the business name as a designed wordmark.');
  if (f.logoColors.length) add('Logo colours', f.logoColors.join(', '));
  if (f.requestedIntegrations.length) L.push(`Tools the business uses: ${f.requestedIntegrations.map(i => `${i.key}${i.url ? ` (${i.url})` : ''}`).join(', ')}`);
  add('What the prospect told us', f.prospectNotes);
  if (f.adminInstructions) L.push(`ADMINISTRATOR INSTRUCTIONS (follow these):\n${f.adminInstructions}`);
  return L.join('\n');
}
