// Prompts for the multi-stage generation pipeline.
//
// Stage A  brief      → structured understanding of the business
// Stage B  sitemap    → proposed pages (reviewed by the administrator)
// Stage C  design     → the sitewide design system (tokens, CSS, header, footer, patterns)
// Stage D  page       → one page at a time, inside that design system
//          seo        → metadata for every page
//          revise     → targeted changes to a page / section
//
// Output uses small tagged blocks (<w-json>, <w-css>, <w-section>, …) instead of
// one giant document, so each artifact can be validated, stored and regenerated
// on its own.
import { factsBlock } from './brief.js';
import { directionPromptBlock } from '../design/direction.js';

// ---------------------------------------------------------------------------
// The platform contract every design + page call shares (stable → cacheable)
// ---------------------------------------------------------------------------

export const PLATFORM_CONTRACT = `PLATFORM CONTRACT — how sites are assembled on this platform

You write HTML fragments and CSS only. The platform assembles every page as:

  <header class="w-header" data-header> [your header fragment] </header>
  <main id="main">
    <section id="…" class="w-section s-{type} {your classes}" data-section> [your section fragment] </section>
    …
  </main>
  <footer class="w-footer"> [your footer fragment] </footer>

NEVER output: <script>, <style>, <link>, <html>/<head>/<body>, inline event handlers (onclick=…), javascript: URLs, <iframe> (except https://www.google.com/maps?q=…&output=embed), external stylesheets, or @import. Anything like that is stripped and reported as a defect. All behaviour comes from the platform runtime through data attributes (below).

DESIGN TOKENS (CSS custom properties the platform emits from your token values — use them, do not redefine them in CSS):
  colours   --c-bg --c-surface --c-text --c-muted --c-accent --c-accent-2 --c-border --c-on-accent
  fonts     --f-head --f-body --f-accent
  shape     --radius --radius-lg --radius-btn
  layout    --container --gutter --section-y
  type      --fs-display --fs-h1 --fs-h2 --fs-h3 --fs-lead --fs-body --fs-small --lh-head --ls-head --fw-head --lh-body
  misc      --shadow --ease --dur

FOUNDATION PRIMITIVES (already styled by a low-priority foundation layer; your design stylesheet RESTYLES them so they carry this site's look — pages added later by the customer are built only from these, so they must look right):
  .w-container  .w-section (the wrapper; has vertical padding var(--section-y))  .w-head (section heading group)
  .w-eyebrow  .w-display  .w-h1  .w-h2  .w-h3  .w-lead  .w-muted  .w-prose
  .w-btn  .w-btn--primary  .w-btn--ghost  .w-btn--lg  .w-link  .w-actions
  .w-grid  .w-grid--2/3/4  .w-split (+ .is-reverse)  .w-card  .w-num  .w-icon  .w-media  .w-badge  .w-list  .w-check
  .w-quote  .w-stat  .w-faq (uses <details><summary>)  .w-form .w-row .w-label .w-input .w-form-status  .w-embed .w-map
  header: .w-header .w-header-in .w-brand .w-nav .w-nav-toggle .w-nav-cta      footer: .w-footer .w-footer-grid .w-footer-nav .w-footer-base
  section modifiers the customer can switch on any section: .is-tint .is-surface .is-accent .is-dark .is-tight .is-loose .is-center

Beyond the primitives, invent your own class names for this site's bespoke components and layouts (do not prefix them with "w-").

RUNTIME HOOKS (data attributes; the platform script implements them):
  data-reveal                 element animates in once when scrolled into view (siblings stagger automatically)
  data-nav                    container the platform fills with one link per page. Put exactly ONE template link inside it:
                              <a data-nav-item href="/">Label</a>  (the platform repeats it per page and adds aria-current="page" + class "is-active" on the current page; if the link sits inside an <li>, the <li> is repeated)
  data-nav-toggle             the mobile menu button; toggles class "is-open" on the header and aria-expanded on itself
  data-header                 (added by the platform) the header gets class "is-scrolled" after scrolling
  data-count="250"            number counts up once when visible (element text is the final value, e.g. "250+")
  data-year                   replaced with the current year
  <form data-form="contact">  submitted by the platform (no action/method). Every field needs name + a <label>. Include
                              <p class="w-form-status" data-form-status role="status" aria-live="polite"></p> and a submit button.
  <details>/<summary>         use for accordions (no script needed)

EDITABLE CONTENT (customers edit the site visually afterwards):
  data-f="key" on every element whose text a business owner might change: headings, paragraphs, list items, button/link labels, captions.
  data-f="key" on every <img> (they can swap the photo) and on every <a> (they can change the destination).
  data-f-bg="key" on an element whose CSS background image is content (style="background-image:url(…)").
  Keys: lowercase words with dashes, unique within the fragment (e.g. hero-title, service-1-body).
  Put data-item on each repeated unit (a card, a list row, a FAQ entry) so customers can add, remove and reorder them.
  Keep text out of pseudo-elements and background images.

LINKS
  Internal links are root-relative page paths exactly as listed in the sitemap ("/", "/services/", "/contact/").
  Phone numbers use tel:, emails mailto:, addresses link to https://www.google.com/maps/search/?api=1&query=…
  Every <a> and button must do something real. No href="#".

ACCESSIBILITY AND QUALITY (non-negotiable)
  One <h1> per page (in the first section), logical heading order, WCAG AA contrast, visible focus states, alt text on every image, aria-label on icon-only links, labels on all form fields.
  Fully responsive from 360px to 1600px using fluid type/spacing and container-relative grids — no fixed pixel widths, no horizontal scrolling.
  Motion uses transform/opacity only and respects prefers-reduced-motion.
  Icons are small inline <svg> (stroke="currentColor"). No icon fonts, no emoji as icons.

TRUTHFULNESS
  Use only the facts provided. Never invent reviews, ratings, review counts, awards, certifications, licences, years in business, team members, statistics, client names, prices or guarantees. If something useful is missing, write around it — do not fabricate it and do not leave visible placeholders or bracketed notes.
  Only use image URLs that appear in the facts. If no photos were supplied, use no <img> at all: let typography, colour, shape and inline SVG carry the design.`;

export const CRAFT_GUIDE = `CRAFT — what "boutique agency quality" means here

The site should be mistaken for the work of a small, opinionated studio, not a template or an AI demo.
- Commit to ONE clear visual idea (from the design direction) and express it consistently: in the type, the grid, the way sections begin and end, the treatment of cards, rules, numerals, buttons and links.
- Typography does the heavy lifting: a confident scale, real contrast between display and text sizes, tuned line-height and letter-spacing, sensible measure (45–75 characters), deliberate use of weight and case.
- Composition: vary section structure down the page. Do not stack a centred heading over a three-card row again and again. Use asymmetry, offset, scale contrast, generous or tight spacing on purpose.
- Colour: follow the colour architecture. Restraint reads as expensive. Reserve the accent for what matters.
- Details: hover and focus states on everything interactive, considered borders and radii, consistent spacing rhythm, aligned edges, well-set lists and contact details.
- Copy: specific, local, plain-spoken and conversion-minded. Short sentences. Concrete benefits. No filler, no clichés ("we pride ourselves", "one-stop shop", "look no further"), no exclamation marks.

AVOID the look of generated sites: a purple/blue gradient hero, glassmorphism panels, blurred colour blobs, every element a rounded card with a soft shadow, a row of three identical icon cards under every heading, emoji bullets, gradient text on headings, generic stock-illustration vibes, identical section rhythm on every page, and centred everything.`;

function json(obj) { return JSON.stringify(obj, null, 1); }

// ---------------------------------------------------------------------------
// Stage A — business understanding
// ---------------------------------------------------------------------------

export const BRIEF_SYSTEM = `You are the strategy lead at a small web design studio that builds websites for local businesses. You read everything known about a client and produce a precise, honest creative brief. You never pad, never flatter, and never invent facts.`;

export function briefPrompt(facts, missing) {
  return `Write the creative brief for this client's new website.

## EVERYTHING WE KNOW (the only source of facts)
${factsBlock(facts)}

## FACTS WE DO NOT HAVE
${missing.length ? missing.map(m => `- ${m.label}: ${m.impact}`).join('\n') : '- (nothing important is missing)'}

## OUTPUT
Return ONE JSON object inside <w-json> … </w-json> and nothing else:
{
  "summary": "2–3 sentence plain description of the business, using only the facts",
  "positioning": "one sentence: what makes this business the right choice, grounded in the facts",
  "audience": "who the site must persuade and what they care about",
  "goals": ["what the website must achieve for the business"],
  "primaryAction": { "label": "the single most valuable visitor action, as button text", "kind": "call | booking | order | quote | visit | contact | pay" },
  "secondaryActions": ["other useful actions"],
  "keyMessages": ["3–6 specific things the site must get across, each backed by a supplied fact"],
  "differentiators": ["only differentiators supported by the facts"],
  "tone": "voice and tone in a short phrase",
  "voiceGuidelines": ["3–5 concrete writing rules for this client"],
  "seoKeywords": ["5–10 natural local search phrases"],
  "contentInventory": { "services": true|false, "reviews": true|false, "photos": true|false, "story": true|false, "hours": true|false, "location": true|false },
  "cautions": ["claims we must NOT make because the facts do not support them"],
  "questionsForClient": ["important facts worth asking the client for, most valuable first"]
}`;
}

// ---------------------------------------------------------------------------
// Stage B — site architecture
// ---------------------------------------------------------------------------

export const SITEMAP_SYSTEM = `You are an information architect at a small web design studio. You plan compact, useful multipage websites for local businesses. Every page you propose has a distinct job and enough real material to do it.`;

export function sitemapPrompt({ facts, brief, suggestion, upgradeNote = '' }) {
  return `Plan the sitemap for this client's website.

## FACTS
${factsBlock(facts)}

## BRIEF
${json(brief)}

## A RULE-BASED STARTING POINT (improve on it; it only reflects what material exists)
${suggestion.map(p => `- ${p.title} (${p.type}) → /${p.slug}`).join('\n')}
${facts.desiredPageCount ? `\nThe administrator asked for about ${facts.desiredPageCount} pages.` : ''}${upgradeNote ? `\n\n## UPGRADE CONTEXT\n${upgradeNote}` : ''}

## RULES
- A genuinely multipage site: usually 4–7 pages for an ordinary small business; fewer or more only when the business clearly warrants it.
- The first page is Home with slug "". Include a Contact page.
- Give a service its own page only when there is enough real detail about it to fill a page; otherwise keep services together.
- Do NOT create a page there is no real material for (no Testimonials page without reviews, no Gallery without photos, no Blog). Do not create pages that repeat each other.
- Slugs: lowercase words with dashes; a service detail page may be nested once ("services/roof-repair").
- For each page list 3–7 sections in order, each with a clear intent. Vary section types between pages.
- Page types: home, about, services, service, products, product, gallery, testimonials, faq, contact, booking, locations, landing, standard.

## OUTPUT
Return ONE JSON object inside <w-json> … </w-json> and nothing else:
{
  "rationale": "2–3 sentences on why this structure fits the business",
  "pages": [
    { "type": "home", "title": "Home", "navLabel": "Home", "slug": "", "inNav": true,
      "purpose": "what this page must achieve",
      "sections": [ { "type": "hero", "intent": "what this section says and does" } ] }
  ]
}`;
}

// ---------------------------------------------------------------------------
// Stage C — design system
// ---------------------------------------------------------------------------

export const DESIGN_SYSTEM_PROMPT = `You are the design director of a small, award-winning web design studio and an expert front-end engineer. You create distinctive, restrained, highly crafted design systems for local businesses, and you write the production CSS yourself.

${CRAFT_GUIDE}

${PLATFORM_CONTRACT}`;

export function designPrompt({ facts, brief, direction, sitemap, upgradeNote = '' }) {
  return `Create the sitewide design system for this client. Every page will be built inside it, so it must be complete and coherent.

## CLIENT FACTS
${factsBlock(facts)}

## BRIEF
${json(brief)}

## SITEMAP (the header navigation is filled by the platform from this)
${sitemap.map(p => `- ${p.navLabel || p.title} → ${p.slug ? '/' + p.slug + '/' : '/'} (${p.type})${p.inNav === false ? ' [not in nav]' : ''}`).join('\n')}

## DESIGN DIRECTION
${directionPromptBlock(direction, { logoColors: facts.logoColors })}
${upgradeNote ? `\n## UPGRADE CONTEXT\n${upgradeNote}\n` : ''}
## WHAT TO PRODUCE (in this order, nothing else)

<w-json>
{
  "concept": "The visual concept in 2–4 sentences: the idea, why it suits this business, how it shows up.",
  "system": {
    "typography": "roles, scale, weights, case and spacing rules",
    "colour": "how each colour is used and where the accent may appear",
    "spacing": "the spacing scale and section rhythm",
    "layout": "grid, widths, and the composition principles pages must follow",
    "components": "the component language: buttons, links, cards/rows, headings, lists, forms",
    "imagery": "how photos are treated — or what replaces them when there are none",
    "iconography": "icon style",
    "motion": "what animates and how",
    "navigation": "header behaviour on desktop and mobile",
    "footer": "footer structure",
    "responsive": "how layouts adapt at small sizes"
  },
  "tokens": {
    "colors": { "bg": "#…", "surface": "#…", "text": "#…", "muted": "#…", "accent": "#…", "accent2": "#…", "border": "#…", "onAccent": "#…" },
    "fonts": { "head": "Google Font family", "body": "Google Font family", "accent": "", "headWeights": "400;600;700", "bodyWeights": "400;500;600" },
    "radius": { "base": "8px", "lg": "16px", "btn": "999px" },
    "layout": { "container": "1160px", "gutter": "clamp(20px, 5vw, 48px)", "sectionY": "clamp(64px, 9vw, 128px)" },
    "type": { "display": "clamp(…)", "h1": "clamp(…)", "h2": "clamp(…)", "h3": "1.25rem", "lead": "clamp(…)", "body": "1rem", "small": "0.875rem", "headLineHeight": "1.05", "headLetterSpacing": "-0.02em", "headWeight": "700", "bodyLineHeight": "1.65" },
    "shadow": "0 1px 2px rgb(0 0 0 / 0.04), 0 14px 36px rgb(0 0 0 / 0.08)",
    "motion": "none | subtle | moderate | expressive"
  }
}
</w-json>

<w-css>
/* The complete design stylesheet. Plain CSS, no @import, no :root token redefinition.
   1. Restyle every foundation primitive you intend pages to use (buttons, links, headings, eyebrow, cards, lists, forms, section modifiers) so they carry this concept.
   2. Style the header (.w-header and everything inside it, including the open mobile menu and the .is-scrolled state) and the footer.
   3. Define the site's bespoke, reusable components and layout helpers (your own class names) that pages will share.
   Mobile-first, fluid, accessible. Typically 250–450 lines. */
</w-css>

<w-header class="optional extra classes for the header element">
<!-- Header fragment: brand (logo token or wordmark), the navigation with a data-nav slot, the main action button, and the data-nav-toggle button. -->
</w-header>

<w-footer class="optional extra classes for the footer element">
<!-- Footer fragment: brand, a data-nav link list, real contact details, hours if known, © <span data-year></span>. -->
</w-footer>

<w-patterns>
<!-- 5–8 short, annotated markup patterns showing exactly how pages must write this site's recurring components
     (section heading group, primary/secondary buttons, a card or row, a list, an inner-page header, a call-to-action band, an image frame if photos exist).
     Page builders copy these patterns, so use the real class names from your CSS. -->
</w-patterns>`;
}

// ---------------------------------------------------------------------------
// Stage D — pages
// ---------------------------------------------------------------------------

export const PAGE_SYSTEM = `You are a senior designer-developer at a small, award-winning web design studio. You build one page of a client's website at a time, strictly inside the site's established design system, with the care of someone whose name is on the work.

${CRAFT_GUIDE}

${PLATFORM_CONTRACT}`;

/** The stable, cacheable context shared by every page of one site. */
export function siteContextBlock({ facts, brief, design, sitemap }) {
  return `# THIS CLIENT AND THIS SITE (shared by every page)

## CLIENT FACTS (the only source of facts)
${factsBlock(facts)}

## BRIEF
${json({ summary: brief.summary, positioning: brief.positioning, audience: brief.audience, primaryAction: brief.primaryAction, keyMessages: brief.keyMessages, tone: brief.tone, voiceGuidelines: brief.voiceGuidelines, seoKeywords: brief.seoKeywords, cautions: brief.cautions })}

## SITEMAP (link only to these paths)
${sitemap.map(p => `- ${p.title} → ${p.slug ? '/' + p.slug + '/' : '/'} — ${p.purpose || p.type}`).join('\n')}

## DESIGN SYSTEM
Concept: ${design.concept}
${json(design.system)}

Token values: ${json(design.tokens)}

## DESIGN STYLESHEET (already loaded on every page — use these classes; do not restate this CSS)
${design.css}

## MARKUP PATTERNS (copy these for recurring components)
${design.patterns || '(none supplied — follow the stylesheet)'}`;
}

export function pagePrompt({ page, sitemap, isHome, note = '', existingClasses = '' }) {
  const others = sitemap.filter(p => p.id !== page.id).map(p => `${p.title} (${p.slug ? '/' + p.slug + '/' : '/'})`).join(', ');
  return `Build the "${page.title}" page (${page.slug ? '/' + page.slug + '/' : '/'}).

Purpose: ${page.purpose || page.type}
Page type: ${page.type}
Planned sections, in order:
${(page.sections || []).map((s, i) => `${i + 1}. ${s.type}${s.intent ? ' — ' + s.intent : ''}`).join('\n') || '(decide the best 3–6 sections for this purpose)'}
Other pages you can link to: ${others || '(none)'}
${note ? `\nAdditional direction for this page:\n${note}\n` : ''}
REQUIREMENTS
- Stay inside the design system: use its classes, tokens, components and patterns. The page must be unmistakably part of the same site.
- ${isHome ? 'This is the home page: it sets the tone. Make the first screen distinctive and immediately clear about who this is, what they do, where, and what to do next.' : 'This is an inner page: open with a compact page header (not a second home-page hero), then get to the substance.'}
- The first section contains the page's only <h1>.
- Vary composition from section to section; do not repeat one layout.
- Real, specific copy from the facts. No invented claims. No placeholders.
- Mark editable content with data-f / data-item as the contract describes.
- Add page-specific CSS only for genuinely new layouts, with class names starting "${cssPrefix(page)}-". Prefer the shared components.${existingClasses ? `\n- Bespoke classes already used on other pages (reuse where it fits): ${existingClasses}` : ''}

OUTPUT (nothing else, no commentary)
<w-section type="hero" name="Short human name" class="your-classes">
…section inner HTML (the platform supplies the <section> wrapper; start with your container)…
</w-section>
…one <w-section> per section…
<w-css>
/* optional page-specific CSS */
</w-css>
<w-seo>{"title": "≤ 60 characters, includes the place if local", "description": "120–155 characters, specific and inviting"}</w-seo>`;
}

/** Appended when an earlier response for the same page was cut off by the request time limit. */
export function pageContinuationNote(sections) {
  return `

CONTINUATION
An earlier response for this page was cut off by a time limit. The sections below are already written and saved, in this order. Do not output them again and do not rewrite them.

${sections.map(x => `<w-section type="${x.type}" name="${String(x.name || '').replace(/"/g, '')}" class="${String(x.className || '').replace(/"/g, '')}">\n${x.html}\n</w-section>`).join('\n')}

Now output ONLY the remaining planned sections that complete this page, matching the saved sections in style (if nothing remains, output no sections). Then <w-css> with the page-specific CSS for every bespoke class used on this page, including the saved sections above, and then <w-seo>. No commentary.`;
}

export const PAGE_TIGHTER_NOTE = `

TIME LIMIT
An earlier attempt at this page ran out of time before any section was finished. Start writing the output promptly, keep the markup compact, and use at most five sections.`;

export function cssPrefix(page) {
  return 'p-' + (page.slug ? page.slug.replace(/[^a-z0-9]+/g, '-') : 'home');
}

// ---------------------------------------------------------------------------
// SEO metadata (small, cheap model)
// ---------------------------------------------------------------------------

export const SEO_SYSTEM = `You write precise search metadata for local business websites. You never invent facts.`;

export function seoPrompt({ facts, pages }) {
  return `Write search metadata for each page of this website.

Business: ${facts.name} — ${facts.type}${facts.city ? ' in ' + facts.city + (facts.state ? ', ' + facts.state : '') : ''}

Pages (id, title, and what is on the page):
${pages.map(p => `- ${p.id} | ${p.title} | ${p.text.slice(0, 500)}`).join('\n')}

Rules: title ≤ 60 characters and unique per page; description 120–155 characters, unique, specific, written for a person; include the town where natural; no invented claims; no quotation marks inside values.

Return ONE JSON object inside <w-json> … </w-json>:
{ "pages": [ { "id": "…", "title": "…", "description": "…" } ] }`;
}

// ---------------------------------------------------------------------------
// Revisions
// ---------------------------------------------------------------------------

export function revisePagePrompt({ page, currentSections, instruction }) {
  return `Revise the "${page.title}" page (${page.slug ? '/' + page.slug + '/' : '/'}) of this site.

CHANGE REQUEST FROM THE ADMINISTRATOR
${instruction}

CURRENT PAGE (each section as it exists now)
${currentSections.map(s => `<w-section type="${s.type}" name="${s.name}" class="${s.className || ''}">\n${s.html}\n</w-section>`).join('\n')}
${page.css ? `\nCURRENT PAGE CSS\n${page.css}\n` : ''}
Apply the request with the same design quality, changing only what it requires. Keep existing data-f keys on content you keep so edits are preserved. Output the COMPLETE revised page in the same format:
<w-section type="…" name="…" class="…">…</w-section> … <w-css>…</w-css> <w-seo>{"title": "…", "description": "…"}</w-seo>`;
}

export function reviseSectionPrompt({ page, section, instruction }) {
  return `Rework ONE section of the "${page.title}" page.

${instruction ? `DIRECTION FROM THE ADMINISTRATOR\n${instruction}\n` : 'Produce a fresh, stronger take on this section with the same purpose and facts.\n'}
CURRENT SECTION
<w-section type="${section.type}" name="${section.name}" class="${section.className || ''}">
${section.html}
</w-section>

Output exactly one <w-section …>…</w-section> (same type), plus an optional <w-css> block for any new classes (prefix "${cssPrefix(page)}-"). Nothing else.`;
}

// ---------------------------------------------------------------------------
// Parsing tagged output
// ---------------------------------------------------------------------------

function attr(tagOpen, name) {
  const m = tagOpen.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i')) || tagOpen.match(new RegExp(name + "\\s*=\\s*'([^']*)'", 'i'));
  return m ? m[1] : '';
}

function stripFence(s) {
  let t = String(s || '').trim();
  const m = t.match(/^```[a-z]*\s*([\s\S]*?)```\s*$/i);
  if (m) t = m[1].trim();
  return t;
}

export function block(text, tag) {
  const re = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const m = String(text || '').match(re);
  if (!m) {
    // tolerate a truncated final block
    const open = String(text || '').match(new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*)$`, 'i'));
    return open ? { open: open[1] || '', body: stripFence(open[2]), truncated: true } : null;
  }
  return { open: m[1] || '', body: stripFence(m[2]), truncated: false };
}

export function parseJsonBlock(text) {
  const b = block(text, 'w-json');
  let raw = b ? b.body : String(text || '');
  const a = raw.indexOf('{'), z = raw.lastIndexOf('}');
  if (a === -1 || z === -1) throw new Error('The model did not return JSON.');
  raw = raw.slice(a, z + 1);
  try { return JSON.parse(raw); }
  catch (e) {
    // common slips: trailing commas, smart quotes around keys
    const repaired = raw.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"');
    try { return JSON.parse(repaired); } catch { throw new Error('The model returned invalid JSON: ' + e.message); }
  }
}

/** Parse a page response into raw sections + css + seo. */
export function parsePageOutput(text) {
  const src = String(text || '');
  const sections = [];
  const re = /<w-section(\s[^>]*)?>([\s\S]*?)<\/w-section>/gi;
  let m;
  while ((m = re.exec(src))) {
    const open = m[1] || '';
    const html = stripFence(m[2]);
    if (!html.trim()) continue;
    sections.push({ type: attr(open, 'type') || 'content', name: attr(open, 'name') || '', className: attr(open, 'class') || '', html });
  }
  const cssB = block(src, 'w-css');
  let seo = {};
  const seoB = block(src, 'w-seo');
  if (seoB) { try { seo = JSON.parse(seoB.body.slice(seoB.body.indexOf('{'), seoB.body.lastIndexOf('}') + 1)); } catch {} }
  const openCount = (src.match(/<w-section[\s>]/gi) || []).length;
  return { sections, css: cssB ? cssB.body : '', seo: { title: String(seo.title || '').slice(0, 140), description: String(seo.description || '').slice(0, 320) }, incomplete: openCount > sections.length };
}

export function parseDesignOutput(text) {
  const data = parseJsonBlock(text);
  const css = block(text, 'w-css');
  const header = block(text, 'w-header');
  const footer = block(text, 'w-footer');
  const patterns = block(text, 'w-patterns');
  const missing = [];
  if (!css?.body) missing.push('w-css');
  if (!header?.body) missing.push('w-header');
  if (!footer?.body) missing.push('w-footer');
  if (!data.tokens) missing.push('tokens');
  if (missing.length) throw new Error('The design response is missing: ' + missing.join(', '));
  if (css.truncated || footer.truncated) throw new Error('The design response was cut off before it finished.');
  return {
    concept: String(data.concept || '').slice(0, 2000),
    system: data.system && typeof data.system === 'object' ? data.system : {},
    tokens: data.tokens,
    css: css.body,
    header: { html: header.body, className: attr(header.open, 'class') },
    footer: { html: footer.body, className: attr(footer.open, 'class') },
    patterns: patterns ? patterns.body.slice(0, 12000) : ''
  };
}
