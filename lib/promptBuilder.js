// The anti-template engine.
// Every generation gets a randomized "design seed" — a distinct art direction,
// typography pairing, color strategy, layout motif and signature element —
// so no two generated sites look alike. Jax can reroll the seed before generating.

const STYLE_DIRECTIONS = {
  restaurant: [
    'Warm editorial bistro — magazine-style layout, large serif headlines, generous whitespace, food-first storytelling',
    'Retro neighborhood diner — playful type, ticket-stub shapes, checkered accents used sparingly and tastefully',
    'Dark moody supper club — near-black backgrounds, candlelight gold accents, cinematic full-bleed sections',
    'Bright Mediterranean café — sun-washed palette, hand-drawn divider flourishes, airy and casual',
    'Modern street-food energy — bold condensed type, high-contrast color blocking, diagonal section breaks',
    'Farm-to-table organic — cream paper texture feel, botanical line art, soft greens and terracotta'
  ],
  shop: [
    'Indie boutique editorial — asymmetric product grid, oversized lowercase headlines, charming micro-interactions',
    'Heritage general store — vintage badge logo treatment, muted Americana palette, serif/slab pairing',
    'Minimal gallery retail — products treated like art pieces, extreme whitespace, thin grid lines',
    'Vibrant market stall — color-saturated cards, sticker-style accents, friendly rounded type',
    'Scandinavian craft — calm neutrals, soft shadows, precise spacing, understated luxury'
  ],
  professional: [
    'Quiet authority — deep navy/ink palette, classic serif headlines, structured grid, generous breathing room',
    'Modern clinic calm — soft pastels on white, rounded cards, gentle gradients, approachable sans-serif',
    'Established firm — charcoal and brass, ruled lines, columned layouts inspired by fine print stationery',
    'Friendly local expert — warm neutrals, big human-centric type, conversational microcopy, soft photography blocks',
    'Precision and trust — monochrome with one decisive accent color, sharp edges, data-flavored detail strips'
  ],
  service: [
    'Bold tradesman confidence — strong slab type, safety-tone accent, big honest sections, no fluff',
    'Clean utility modern — crisp whites, blueprint-line accents, organized service grid',
    'Hometown reliability — warm earth tones, badge-style guarantees, photographs framed like polaroids',
    'High-energy response — dynamic angled hero, urgency-friendly CTAs, route-map motifs'
  ]
};

const TYPE_PAIRINGS = [
  { head: 'Fraunces', body: 'Inter' },
  { head: 'Playfair Display', body: 'Source Sans 3' },
  { head: 'Space Grotesk', body: 'Inter' },
  { head: 'DM Serif Display', body: 'DM Sans' },
  { head: 'Sora', body: 'Inter' },
  { head: 'Libre Caslon Text', body: 'Karla' },
  { head: 'Archivo Black', body: 'Archivo' },
  { head: 'Cormorant Garamond', body: 'Mulish' },
  { head: 'Bricolage Grotesque', body: 'Instrument Sans' },
  { head: 'Lora', body: 'Work Sans' },
  { head: 'Syne', body: 'Outfit' },
  { head: 'Crimson Pro', body: 'Figtree' }
];

const COLOR_STRATEGIES = [
  'Derive a palette from the business\'s industry and locale: one dominant neutral, one rich brand color, one unexpected accent used in under 10% of the page',
  'Near-monochrome with a single electric accent reserved exclusively for CTAs',
  'Dark theme: deep charcoal base (never pure black), warm light text, one luminous accent',
  'Light and airy: off-white base (never pure white), ink text, two muted complementary tones',
  'Earthy and grounded: clay, sand, olive or ocean tones drawn from the local landscape',
  'Split-tone: alternating light and dark full-width sections that create rhythm down the page'
];

const HERO_TREATMENTS = [
  'Full-bleed atmospheric hero with oversized headline overlapping the fold line',
  'Split hero: headline + CTA on one side, visual panel on the other, slightly asymmetric (60/40)',
  'Typographic hero: no imagery, just a massive beautifully-set statement headline with a kinetic underline or marquee strip',
  'Stacked editorial hero: kicker line, huge headline, supporting line, then a wide visual band below',
  'Card-inset hero: visual contained in a large rounded card floating over a tinted background',
  'Diagonal or curved section divider hero that breaks the standard rectangle'
];

const SIGNATURE_ELEMENTS = [
  'a horizontally scrolling reviews marquee',
  'a sticky side rail with phone number and hours that follows scroll',
  'numbered service cards with oversized ghost numerals',
  'an FAQ accordion with smooth height animation',
  'a before/after or process timeline strip',
  'hover-lift cards with layered shadows and subtle rotation',
  'a stats band with animated count-up numbers',
  'scroll-triggered fade/slide reveals (IntersectionObserver)',
  'a local-area map section with custom-styled embed and neighborhood callouts',
  'hand-drawn style SVG underlines and arrows as accents'
];

const LAYOUT_MOTIFS = [
  'Strict 12-column grid with intentional rule-breaking in exactly two places',
  'Alternating full-width and contained sections to create rhythm',
  'Bento-grid arrangement for services/features',
  'Magazine layout: multi-column text blocks, pull quotes, large drop caps',
  'Generous vertical whitespace; each section feels like its own page',
  'Overlapping elements: images that break section boundaries, badges that straddle edges'
];

function pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORY_MAP = {
  'Restaurant / Café': 'restaurant',
  'Bar / Brewery': 'restaurant',
  'Bakery / Dessert Shop': 'restaurant',
  'Retail / Local Shop': 'shop',
  'Boutique / Clothing': 'shop',
  'Insurance Agency': 'professional',
  'Doctor\'s Office / Medical': 'professional',
  'Dentist / Orthodontist': 'professional',
  'Law Firm': 'professional',
  'Accounting / Tax': 'professional',
  'Real Estate': 'professional',
  'HVAC': 'service',
  'Roofing': 'service',
  'Plumbing / Electrical': 'service',
  'Landscaping': 'service',
  'Auto Repair': 'service',
  'Salon / Spa': 'shop',
  'Fitness / Gym': 'service',
  'Other Local Business': 'service'
};

export const BUSINESS_TYPES = Object.keys(CATEGORY_MAP);

export function makeDesignSeed(businessType, seedNum = Date.now() % 2147483647) {
  const rnd = mulberry32(seedNum);
  const category = CATEGORY_MAP[businessType] || 'service';
  return {
    seedNum,
    direction: pick(STYLE_DIRECTIONS[category], rnd),
    type: pick(TYPE_PAIRINGS, rnd),
    color: pick(COLOR_STRATEGIES, rnd),
    hero: pick(HERO_TREATMENTS, rnd),
    motif: pick(LAYOUT_MOTIFS, rnd),
    signatures: [pick(SIGNATURE_ELEMENTS, rnd), pick(SIGNATURE_ELEMENTS, rnd)].filter((v, i, a) => a.indexOf(v) === i)
  };
}

// ---------- Integration embed instructions ----------

function integrationInstructions(q) {
  const out = [];
  const i = q.integrations || {};
  if (i.shopify?.enabled) {
    out.push(`SHOPIFY: The business sells online at ${i.shopify.url || 'their Shopify store'}. Add a "Shop" presence: prominent nav link and a featured-products style section that links to ${i.shopify.url || '#'}. ${i.shopify.token ? `They have a Storefront API token; add a clearly marked <script> placeholder section commented "SHOPIFY BUY BUTTON — paste generated embed here" plus working links meanwhile.` : 'Link out to the store; do not fabricate product data.'}`);
  }
  if (i.stripe?.enabled) {
    out.push(`STRIPE: Include payment CTAs linking to their Stripe payment link${i.stripe.url ? ` (${i.stripe.url})` : ''}. Style as a primary "Pay / Book now" button where it makes sense.`);
  }
  if (i.trustpilot?.enabled) {
    out.push(`TRUSTPILOT: Add a Trustpilot trust strip near reviews linking to ${i.trustpilot.url || 'their Trustpilot profile'} with a star visual built in CSS (do not hotlink Trustpilot assets).`);
  }
  if (i.socialWall?.enabled) {
    const handles = Object.entries(i.socialWall.handles || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ');
    out.push(`SOCIAL WALL: Add a social section ("Follow along") with linked icon buttons for ${handles || 'their social profiles'}. Build icons as inline SVG. If Instagram handle given, add a 3–6 tile grid of placeholder tiles styled like a feed, each linking to the profile.`);
  }
  if (i.jotform?.enabled) {
    if (i.jotform.formId) out.push(`JOTFORM FORM: Embed their Jotform via iframe: https://form.jotform.com/${i.jotform.formId} — full-width in the contact section, min-height 540px.`);
    if (i.jotform.chatbot) out.push(`JOTFORM CHATBOT: Add this script before </body>: <script src="https://cdn.jotfor.ms/agent/embedjs/${i.jotform.chatbot}/embed.js"><\/script>`);
    if (!i.jotform.formId && !i.jotform.chatbot) out.push('JOTFORM: Add a styled contact form with a comment marking where the Jotform embed code goes.');
  }
  if (i.googleMaps?.enabled && q.business?.address) {
    out.push(`GOOGLE MAPS: Embed a map iframe (no API key needed): <iframe src="https://www.google.com/maps?q=${encodeURIComponent(q.business.address)}&output=embed"></iframe> styled to match the design (rounded corners, subtle border or grayscale filter).`);
  }
  if (i.calendly?.enabled) {
    out.push(`CALENDLY: Embed inline booking widget for ${i.calendly.url || 'their Calendly'}: <div class="calendly-inline-widget" data-url="${i.calendly.url || ''}" style="min-width:320px;height:660px;"></div> plus the Calendly widget.js script.`);
  }
  if (i.opentable?.enabled) {
    out.push(`RESERVATIONS: Add a prominent "Reserve a table" CTA linking to ${i.opentable.url || 'their OpenTable/Resy page'}.`);
  }
  if (i.doordash?.enabled) {
    out.push(`ONLINE ORDERING: Add "Order online" CTAs linking to ${i.doordash.url || 'their ordering page'} — this should be one of the two primary actions on the page.`);
  }
  if (i.googleBusiness?.enabled) {
    out.push(`GOOGLE REVIEWS: Reviews shown are from Google. Add a "Review us on Google" link${i.googleBusiness.url ? ` to ${i.googleBusiness.url}` : ''} near the reviews section.`);
  }
  return out;
}

// ---------- The main website prompt ----------

export const WEBSITE_SYSTEM_PROMPT = `You are an elite web designer and front-end engineer who builds award-calibre one-page-or-multi-section websites for local businesses. Your work has Apple-level polish: impeccable typography, deliberate spacing, restrained color, and details that feel custom-made — never like a template.

Hard rules:
- Output ONE complete, self-contained HTML file and NOTHING else. No markdown, no commentary, no code fences. Start with <!doctype html>.
- All CSS in a single <style> block; all JS vanilla in a single <script> block. No frameworks, no build steps.
- Load fonts from Google Fonts only.
- NEVER use stock-photo URLs or any external image that could 404. Build all visuals with CSS gradients, patterns, and inline SVG illustrations. If real photo URLs are explicitly provided in the brief, use those exact URLs only.
- Fully responsive: flawless at 360px, 768px, 1200px+. Test your mental model at each.
- Semantic HTML, real meta description, Open Graph tags, JSON-LD LocalBusiness schema with the real business data.
- Phone numbers always wrapped in tel: links; addresses link to Google Maps.
- Smooth-scroll nav for on-page sections. Mobile nav must be a working hamburger menu.
- Accessible: contrast-safe colors, focus states, alt text, aria labels on icon buttons.
- Every section must contain the REAL information provided. Where information is missing, write plausible warm local copy — never lorem ipsum, never placeholder brackets.
- Conversion-focused: clear primary action (call, book, order, visit) visible in hero and repeated at natural decision points, sticky mobile call bar at the bottom on small screens.`;

export function buildWebsitePrompt(project) {
  const b = project.business;
  const q = project.questionnaire;
  const seed = project.designSeed;
  const pages = q.pages || [];

  const reviews = (b.reviews || []).filter(r => r.text).slice(0, 10);
  const services = (b.services || []).filter(Boolean);
  const integrations = integrationInstructions({ ...q, business: b });

  const lines = [];
  lines.push(`Design and build a complete premium website for this local business.`);
  lines.push('');
  lines.push(`## BUSINESS BRIEF`);
  lines.push(`Name: ${b.name}`);
  lines.push(`Type: ${b.type}`);
  if (b.city) lines.push(`Location: ${b.city}${b.state ? ', ' + b.state : ''}`);
  if (b.address) lines.push(`Address: ${b.address}`);
  if (b.phone) lines.push(`Phone: ${b.phone}`);
  if (b.email) lines.push(`Email: ${b.email}`);
  if (b.hours) lines.push(`Hours:\n${b.hours}`);
  if (b.description) lines.push(`About / story: ${b.description}`);
  if (b.tagline) lines.push(`Tagline or vibe in the owner's words: ${b.tagline}`);
  if (services.length) lines.push(`Services / offerings:\n${services.map(s => '- ' + s).join('\n')}`);
  if (b.menu) lines.push(`Menu highlights (use real items):\n${b.menu}`);
  if (reviews.length) {
    lines.push(`Real customer reviews (feature these prominently, lightly trimmed for length is fine, never invented):`);
    reviews.forEach(r => lines.push(`- "${r.text}" — ${r.author || 'Verified customer'}${r.rating ? `, ${r.rating}★` : ''}`));
  } else {
    lines.push(`No reviews provided: include a reviews section designed to hold them, with 2–3 tasteful short quotes attributed to "Local customer" so the layout reads complete.`);
  }
  if (b.photos?.length) lines.push(`Real photo URLs you may use:\n${b.photos.map(p => '- ' + p).join('\n')}`);

  lines.push('');
  lines.push(`## SITE STRUCTURE`);
  lines.push(`Build as a polished single-page site with these sections in the nav: ${pages.join(', ')}.`);
  if (pages.includes('Menu')) lines.push(`The Menu section must be beautifully typeset — this is a centerpiece, not an afterthought.`);
  if (pages.includes('Locations')) lines.push(`Locations: ${b.locations || b.address || 'present the address with a map'}.`);
  if (pages.includes('Shop')) lines.push(`Shop section per the integration notes below.`);

  if (integrations.length) {
    lines.push('');
    lines.push(`## INTEGRATIONS (implement exactly)`);
    integrations.forEach(t => lines.push('- ' + t));
  }

  lines.push('');
  lines.push(`## ART DIRECTION — follow this seed precisely (it is what makes this site unlike any other)`);
  lines.push(`Style direction: ${seed.direction}`);
  lines.push(`Typography: headlines in "${seed.type.head}", body in "${seed.type.body}" (Google Fonts).`);
  lines.push(`Color strategy: ${seed.color}`);
  lines.push(`Hero treatment: ${seed.hero}`);
  lines.push(`Layout motif: ${seed.motif}`);
  lines.push(`Signature elements to include: ${seed.signatures.join('; ')}.`);
  if (q.vibe?.tone) lines.push(`Owner's requested tone: ${q.vibe.tone}`);
  if (q.vibe?.colors) lines.push(`Color preferences from owner (honor within the strategy): ${q.vibe.colors}`);
  if (q.vibe?.mustHave) lines.push(`Must include: ${q.vibe.mustHave}`);
  if (q.vibe?.avoid) lines.push(`Avoid: ${q.vibe.avoid}`);

  lines.push('');
  lines.push(`## LOCAL SEO`);
  lines.push(`Weave "${b.type.toLowerCase()} in ${b.city || 'the local area'}" naturally into the h1/meta/copy. Include the JSON-LD LocalBusiness block with real name, address, phone, hours.`);
  lines.push('');
  lines.push(`Now output the complete HTML file.`);

  return lines.join('\n');
}

// ---------- Analysis prompt (Screen 2) ----------

export function buildAnalysisPrompt(b, fetched) {
  return `You are auditing a local business's current website. Based on the data below, return ONLY a JSON object (no prose) with this exact shape:
{
  "score": <0-100 overall quality score, be tough but fair>,
  "redFlags": [<short strings: concrete problems found, e.g. "Not mobile friendly — no viewport meta">],
  "designIssues": [<strings>],
  "seoIssues": [<strings>],
  "conversionIssues": [<strings>],
  "extracted": {
    "services": [<services/offerings detected from the site text>],
    "about": "<1-2 sentence summary of the business>",
    "phone": "<phone if found, else ''>",
    "address": "<address if found, else ''>",
    "hours": "<hours if found, else ''>"
  },
  "verdict": "<one punchy sentence: should we build them a new site and why>"
}

Business: ${b.name} (${b.type}) in ${b.city || 'unknown city'}
URL: ${b.currentUrl}
HTTP status: ${fetched.status}
Page title: ${fetched.title || '(none)'}
Has mobile viewport meta: ${fetched.hasViewport}
HTML size: ${fetched.htmlLength} bytes
First 6000 chars of HTML head/source:
${fetched.htmlHead}

Visible page text (truncated):
${fetched.text}`;
}

// ---------- Audit one-pager prompt (Step 5) ----------

export function buildAuditPrompt(project) {
  const a = project.analysis || {};
  const b = project.business;
  return `Create a one-page client-facing website audit as a complete HTML document (output ONLY HTML, no fences). It will be converted to a Letter-size PDF, so design for print: white background, max-width 7.5in content, professional and visual, brand-neutral modern style. Use system fonts only (no webfonts).

Structure:
1. Header: "Website Audit — ${b.name}" with date ${new Date().toLocaleDateString()} and "Prepared by Websites For Locals".
2. Side-by-side comparison: two image slots. Use EXACTLY these img tags (the tool injects real screenshots):
   <img src="{{OLD_SHOT}}" style="width:100%"> labeled "Current website" and <img src="{{NEW_SHOT}}" style="width:100%"> labeled "Our redesign preview".
3. Overall score: ${a.score ?? 'N/A'}/100 shown as a bold visual.
4. Four compact columns or blocks: Design problems, Mobile problems, SEO problems, Conversion problems — using these findings:
Design: ${(a.designIssues || []).join('; ') || 'see red flags'}
SEO: ${(a.seoIssues || []).join('; ') || '—'}
Conversion: ${(a.conversionIssues || []).join('; ') || '—'}
Red flags: ${(a.redFlags || []).join('; ') || '—'}
5. "What we built instead" — 3 bullets on the redesign: modern mobile-first design, clear calls-to-action, local SEO structure${project.publish?.previewUrl ? `, live at ${project.publish.previewUrl}` : ''}.
6. Footer with a soft CTA: preview link${project.publish?.previewUrl ? ` (${project.publish.previewUrl})` : ''} and contact.

Keep everything on ONE page. Tight, confident, factual copy.`;
}

// ---------- Outreach email prompt (Step 6) ----------

export function buildOutreachPrompt(project, senderName) {
  const b = project.business;
  return `Write a short cold outreach email from ${senderName} to the owner of ${b.name} (${b.type} in ${b.city || 'town'}). Return ONLY JSON: {"subject": "...", "body": "..."}.

Rules:
- Under 110 words. Plain, human, zero marketing-speak, no exclamation marks.
- The hook: instead of a proposal, we already BUILT them a new website preview.
- Mention one specific real problem with their current site: ${(project.analysis?.redFlags || ['the site is dated']).slice(0, 2).join('; ')}
- Include the preview link on its own line: ${project.publish?.previewUrl || '[preview link]'}
- Mention the attached one-page audit PDF.
- Ask for feedback, not a sale. Sign off "${senderName}".`;
}
