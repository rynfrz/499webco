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
  'Bold and saturated: a confident hero brand color plus a vivid complementary accent, rich gradients, color used generously across sections — never timid',
  'Dark luxe: deep charcoal/ink base (never pure black), a luminous jewel-tone accent, glowing gradient highlights',
  'Vibrant duotone: two strong brand colors blended in gradients and color-blocked sections that alternate down the page',
  'Warm sunset palette: layered oranges/pinks/purples in gradient meshes against a clean base, energetic and inviting',
  'Fresh and modern: a crisp light base with one electric accent plus a secondary supporting hue, lots of colorful detail in cards, icons, and dividers'
];

// Concrete, vivid palettes (real hex) injected into the seed so every site
// commits to a bold, cohesive color system instead of playing it safe.
const PALETTES = {
  restaurant: [
    { name: 'Ember', bg: '#1a1410', surface: '#241b15', text: '#f7efe6', accent: '#ff5722', accent2: '#ffb300', grad: 'linear-gradient(135deg,#ff5722,#ffb300)' },
    { name: 'Terracotta Garden', bg: '#fbf6ef', surface: '#ffffff', text: '#2b1d16', accent: '#c8553d', accent2: '#588157', grad: 'linear-gradient(135deg,#c8553d,#e9a23b)' },
    { name: 'Midnight Supper', bg: '#12100f', surface: '#1d1a18', text: '#f4ece2', accent: '#e0a458', accent2: '#9a3b3b', grad: 'linear-gradient(120deg,#e0a458,#9a3b3b)' }
  ],
  shop: [
    { name: 'Electric Boutique', bg: '#ffffff', surface: '#f6f4ff', text: '#15131f', accent: '#6c4df6', accent2: '#ff5da2', grad: 'linear-gradient(135deg,#6c4df6,#ff5da2)' },
    { name: 'Coastal Pop', bg: '#f3fbfb', surface: '#ffffff', text: '#0c2733', accent: '#0bb3a6', accent2: '#ff8a5b', grad: 'linear-gradient(135deg,#0bb3a6,#3aa0ff)' },
    { name: 'Sunlit Craft', bg: '#fffdf6', surface: '#fff7e6', text: '#211a10', accent: '#f0a500', accent2: '#e2562b', grad: 'linear-gradient(135deg,#f0a500,#e2562b)' }
  ],
  professional: [
    { name: 'Trust Blue', bg: '#ffffff', surface: '#f1f5ff', text: '#0f1b34', accent: '#2563eb', accent2: '#06b6d4', grad: 'linear-gradient(135deg,#2563eb,#06b6d4)' },
    { name: 'Deep Authority', bg: '#0d1424', surface: '#16203a', text: '#eef3ff', accent: '#4f8cff', accent2: '#37e0b0', grad: 'linear-gradient(135deg,#4f8cff,#37e0b0)' },
    { name: 'Clinic Calm', bg: '#f7fbfa', surface: '#ffffff', text: '#10302b', accent: '#10b981', accent2: '#3b82f6', grad: 'linear-gradient(135deg,#10b981,#3b82f6)' }
  ],
  service: [
    { name: 'Hi-Vis Pro', bg: '#0f1115', surface: '#1a1e25', text: '#f3f6fb', accent: '#ff7a18', accent2: '#1fb6ff', grad: 'linear-gradient(135deg,#ff7a18,#ffb800)' },
    { name: 'Fresh Field', bg: '#f6faf3', surface: '#ffffff', text: '#14240f', accent: '#3a9d23', accent2: '#1f8fd6', grad: 'linear-gradient(135deg,#3a9d23,#1f8fd6)' },
    { name: 'Bold Blueprint', bg: '#ffffff', surface: '#eef4ff', text: '#0c1830', accent: '#1d4ed8', accent2: '#f59e0b', grad: 'linear-gradient(135deg,#1d4ed8,#f59e0b)' }
  ]
};

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
    palette: pick(PALETTES[category], rnd),
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

export const WEBSITE_SYSTEM_PROMPT = `You are a world-class web designer and senior front-end engineer. You build vivid, modern, conversion-focused marketing websites for local businesses that look like they cost $10,000 from a top studio — the kind of site that wins design awards and makes the business look far better online than in real life. Think Awwwards / "Site of the Day" quality, adapted to a real local business.

Your output must be COLORFUL, RICH, and PROFESSIONAL — never plain, never sparse, never a wireframe. Color, depth, motion, and polish are the point.

OUTPUT FORMAT
- Output ONE complete, self-contained HTML file and NOTHING else. No markdown, no commentary, no code fences. Begin with <!doctype html>.
- All CSS in one <style> block; all JS vanilla in one <script> block. No frameworks, no build steps, no external CSS/JS except Google Fonts.

VISUAL QUALITY BAR (every site must hit all of these)
- A committed, cohesive COLOR SYSTEM defined as CSS custom properties (use the exact palette hex values provided in the brief). Use color boldly: gradient heroes, color-blocked sections, tinted cards, colorful icons, gradient text or underlines on key headlines. Alternate section backgrounds to create rhythm. Never leave the page mostly white-and-gray.
- Rich depth: layered box-shadows, soft glows on accent elements, subtle borders, rounded corners (consistent radius scale), and at least one gradient-mesh or blurred color-blob background accent.
- Fluid, expressive typography: a clear type scale using clamp(); oversized confident headlines (hero h1 clamp ~40px→80px); tasteful letter-spacing; never default browser sizes.
- An 8-point spacing system with generous, premium whitespace and section padding (≈80–120px desktop).
- Motion & micro-interactions: scroll-triggered fade/slide-up reveals via IntersectionObserver; smooth hover states on every button/card/link (transform + shadow); a sticky header that adds a blurred/solid background on scroll. Keep animation tasteful and performant (transform/opacity only). Respect prefers-reduced-motion.
- 7–10 substantial, content-rich sections (see structure in the brief). Each section is fully designed — real headings, supporting copy, iconography, and visual interest. No empty filler.
- Custom inline SVG icons for services/features (never icon-font CDNs). Decorative SVG shapes/blobs/patterns welcome.

IMAGERY (graceful + safe)
- Build the reliable visual backbone with CSS: gradients, gradient meshes, duotone shapes, patterns, and inline SVG illustrations. This alone must already look colorful and complete.
- You MAY enhance with real photography from Unsplash via images.unsplash.com URLs, but ONLY as CSS \`background-image\` LAYERED UNDER a gradient overlay AND with a solid/gradient \`background-color\` fallback behind it — so if any photo fails to load, the section still looks intentional and on-brand. NEVER use a bare <img> tag for decorative/hero photos (a broken <img> looks amateur). Choose photos appropriate to the industry.
- If the brief provides explicit real photo URLs, use those exact URLs (they are safe) and they may be <img> tags.

ENGINEERING & UX
- Fully responsive and flawless at 360px, 768px, and 1280px+. Mobile nav is a working hamburger menu. Test your mental model at each width.
- Semantic HTML5, accurate <title> + meta description, Open Graph tags, and a JSON-LD LocalBusiness schema block with the real business data.
- Phone numbers wrapped in tel: links; addresses link to Google Maps. Smooth-scroll for in-page nav.
- Accessible: WCAG-AA contrast, visible focus states, alt text, aria-labels on icon buttons.
- Conversion-focused: a clear primary action (call/book/order/visit) in the hero and repeated at natural decision points; a sticky mobile "call/book" bar on small screens.
- Use ONLY the real information provided. Where details are missing, write warm, specific, locally-flavored copy — never lorem ipsum, never visible placeholder brackets.

Make it genuinely impressive. Err on the side of MORE design, MORE color, and MORE polish.`;

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
  lines.push(`## SITE STRUCTURE — build a long, rich single-page site (7–10 full sections), in this order:`);
  lines.push(`1. Sticky header/nav (logo + smooth-scroll links to: ${pages.join(', ')} + a prominent CTA button). Adds blurred background on scroll; hamburger on mobile.`);
  lines.push(`2. Hero — striking, colorful, gradient/photo background, oversized headline, supporting line, primary + secondary CTA, and a small trust signal (years in business / rating / "locally owned").`);
  lines.push(`3. Trust/credibility strip — stats, badges, or a logo/feature row.`);
  lines.push(`4. Services/offerings — bento or card grid with custom SVG icons, hover lift, and real descriptions.`);
  lines.push(`5. About/story — the business's real story with personality and a visual element.`);
  if (pages.includes('Menu')) lines.push(`   Menu — beautifully typeset, a clear centerpiece with real items${b.menu ? '' : ' (use tasteful representative items if none provided)'}.`);
  lines.push(`6. Reviews/testimonials — featured prominently with strong visual treatment.`);
  lines.push(`7. A "why choose us" / process / features section with visual interest.`);
  if (pages.includes('FAQ')) lines.push(`   FAQ — animated accordion.`);
  lines.push(`8. Contact section — address, map, hours, phone, and a styled contact form / booking.`);
  lines.push(`9. Footer — colorful, multi-column, with nav, contact, social, and hours.`);
  lines.push(`Each section gets generous padding, an entrance animation, and real content — no thin or empty sections.`);
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
  lines.push(`Typography: headlines in "${seed.type.head}", body in "${seed.type.body}" (Google Fonts). Use a bold fluid type scale with clamp().`);
  lines.push(`Color strategy: ${seed.color}`);
  if (seed.palette) {
    const p = seed.palette;
    lines.push(`COMMIT to this exact color palette as CSS variables and use it boldly across the whole page:`);
    lines.push(`  --bg: ${p.bg};  --surface: ${p.surface};  --text: ${p.text};  --accent: ${p.accent};  --accent-2: ${p.accent2};`);
    lines.push(`  primary gradient: ${p.grad} (use for the hero, key CTAs, headline highlights, and at least one color-blocked section).`);
    lines.push(`  Derive tints/shades from these for cards, badges, hovers, and section backgrounds. The page must feel distinctly "${p.name}".`);
  }
  lines.push(`Hero treatment: ${seed.hero} — make the hero striking and full of color/depth.`);
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
