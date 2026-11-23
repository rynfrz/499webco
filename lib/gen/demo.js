// Demo-mode site builder: a complete multipage SiteDoc with no model call.
//
// Lets the whole pipeline (plan → build → QA → preview → publish → edit) run
// before an Anthropic key is added, and backs the automated tests. The design
// is driven by the same Design Direction as real generations, so demo sites
// still differ from one another.
import { defaultHeader, defaultFooter, normalizeTokens } from '../site/foundation.js';
import { ingestChrome } from '../site/clean.js';
import { buildTemplatePage } from '../site/templates.js';
import { normalizeDoc } from '../site/schema.js';
import { paletteOf, fontsOf, choiceOf, describeDirection } from '../design/direction.js';
import { basicBrief, primaryAction } from './brief.js';

const RADII = {
  'borderless-rows': { base: '4px', lg: '0px', btn: '4px' },
  'outlined-flat': { base: '4px', lg: '6px', btn: '4px' },
  'soft-elevated': { base: '12px', lg: '22px', btn: '999px' },
  'solid-color': { base: '10px', lg: '18px', btn: '12px' },
  'ticket-label': { base: '6px', lg: '10px', btn: '6px' },
  'inset-panels': { base: '8px', lg: '14px', btn: '8px' }
};

const CARD_CSS = {
  'borderless-rows': `.w-card{background:transparent;border:0;border-top:1px solid var(--c-border);border-radius:0;padding:28px 0 8px}a.w-card:hover{box-shadow:none;transform:none;border-top-color:var(--c-accent)}`,
  'outlined-flat': `.w-card{box-shadow:none;border-width:1.5px}a.w-card:hover{box-shadow:none;border-color:var(--c-text)}`,
  'soft-elevated': `.w-card{border-color:transparent;box-shadow:var(--shadow)}`,
  'solid-color': `.w-grid .w-card:nth-child(3n+1){background:var(--c-accent);color:var(--c-on-accent);border-color:transparent;--c-muted:color-mix(in srgb,var(--c-on-accent) 80%,transparent)}.w-grid .w-card:nth-child(3n+1) .w-num,.w-grid .w-card:nth-child(3n+1) .w-link{color:inherit}.w-grid .w-card:nth-child(3n+2){background:color-mix(in srgb,var(--c-accent-2) 16%,var(--c-surface));border-color:transparent}`,
  'ticket-label': `.w-card{border-style:dashed;border-width:1.5px;position:relative}.w-card .w-num{background:var(--c-text);color:var(--c-bg);display:inline-block;padding:3px 9px;border-radius:3px}`,
  'inset-panels': `.w-card{box-shadow:inset 0 0 0 6px var(--c-bg);border-color:var(--c-border);padding:calc(clamp(20px,2.6vw,32px) + 6px)}`
};

const MOTIF_CSS = {
  hairlines: `.w-head{border-top:1px solid var(--c-text);padding-top:1.25rem}.w-eyebrow{letter-spacing:.2em}`,
  'oversized-numerals': `.w-num{font-size:clamp(2.4rem,4vw,3.4rem);line-height:1;letter-spacing:-.04em;-webkit-text-stroke:1.5px var(--c-accent);color:transparent;margin-bottom:.4rem}`,
  'soft-shapes': `.w-media{border-radius:calc(var(--radius-lg) * 2) var(--radius-lg) calc(var(--radius-lg) * 2) var(--radius-lg)}.w-art{border-radius:46% 54% 42% 58%/52% 44% 56% 48%}`,
  'grid-paper': `.s-hero,.s-header{background-image:linear-gradient(var(--c-border) 1px,transparent 1px),linear-gradient(90deg,var(--c-border) 1px,transparent 1px);background-size:44px 44px;background-position:center}.w-eyebrow{font-family:ui-monospace,Menlo,monospace;letter-spacing:.08em}`,
  'stamps-badges': `.w-eyebrow{border:1.5px solid currentColor;border-radius:999px;padding:.35em .9em}`,
  'hand-drawn': `.w-display,.w-h1{text-decoration:underline;text-decoration-color:var(--c-accent-2);text-decoration-thickness:.12em;text-underline-offset:.14em;text-decoration-skip-ink:none}`,
  'diagonal-cuts': `.s-hero,.s-cta{clip-path:polygon(0 0,100% 0,100% calc(100% - 3vw),0 100%);padding-bottom:calc(var(--section-y) + 3vw)}`,
  'framed-panels': `.w-media,.w-art{outline:1px solid var(--c-border);outline-offset:10px}`
};

const NAV_CSS = {
  'classic-bar': ``,
  'centered-logo': `@media (min-width:861px){.w-header-in{display:grid;grid-template-columns:1fr auto 1fr}.w-brand{grid-column:2;justify-self:center}.w-nav{grid-column:1/-1;grid-row:2;justify-content:center;padding-bottom:14px}}`,
  'pill-floating': `.w-header{background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;padding-top:12px;border:0}.w-header-in{background:color-mix(in srgb,var(--c-surface) 92%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid var(--c-border);border-radius:999px;padding-inline:22px;min-height:62px;box-shadow:var(--shadow)}@media (max-width:860px){.w-nav{top:calc(100% + 8px);border:1px solid var(--c-border);border-radius:var(--radius-lg);left:var(--gutter);right:var(--gutter);padding:8px 20px 20px}}`,
  'utility-strip': `.w-header{border-top:4px solid var(--c-accent)}`,
  'minimal-index': `.w-nav a{text-transform:uppercase;letter-spacing:.14em;font-size:.76rem;font-weight:600}.w-header{backdrop-filter:none;-webkit-backdrop-filter:none;background:var(--c-bg)}`,
  'bold-block': `.w-header{background:var(--c-text);color:var(--c-bg);backdrop-filter:none;-webkit-backdrop-filter:none}.w-header .w-nav-toggle{border-color:color-mix(in srgb,var(--c-bg) 30%,transparent)}@media (max-width:860px){.w-header .w-nav{background:var(--c-text)}.w-header .w-nav a{border-bottom-color:color-mix(in srgb,var(--c-bg) 18%,transparent)}}`
};

const LAYOUT_CSS = {
  'editorial-grid': `.w-head{max-width:860px}.s-hero .w-split{grid-template-columns:repeat(12,1fr);align-items:end}.s-hero .w-split>*:first-child{grid-column:1/8}.s-hero .w-split>*:last-child{grid-column:8/13}@media (max-width:860px){.s-hero .w-split>*{grid-column:1/-1!important}}`,
  'asymmetric-split': `@media (min-width:861px){.w-split{grid-template-columns:7fr 5fr}.w-split.is-reverse{grid-template-columns:5fr 7fr}}`,
  'centered-calm': `.s-hero .w-split{grid-template-columns:1fr;text-align:center;max-width:860px}.s-hero .w-lead{margin-inline:auto}.s-hero .w-actions{justify-content:center}.s-hero .w-media,.s-hero .w-art{aspect-ratio:21/9;margin-top:1rem}.w-head{margin-inline:auto;text-align:center}`,
  bento: `@media (min-width:861px){.s-services .w-grid--3{grid-template-columns:repeat(6,1fr)}.s-services .w-grid--3>*{grid-column:span 2}.s-services .w-grid--3>*:nth-child(5n+1){grid-column:span 4}.s-services .w-grid--3>*:nth-child(5n+4){grid-column:span 3}.s-services .w-grid--3>*:nth-child(5n+5){grid-column:span 3}}`,
  'stacked-bands': `.w-section:nth-of-type(even):not(.is-accent):not(.is-dark):not(.is-tint){background:var(--c-surface)}`,
  'offset-overlap': `@media (min-width:861px){.s-hero .w-media,.s-hero .w-art{translate:0 12%;box-shadow:var(--shadow);z-index:2}.w-split.is-reverse .w-media{translate:-6% 0}}`,
  'sidebar-rail': `@media (min-width:1100px){.w-head{display:grid;grid-template-columns:200px 1fr;column-gap:40px;max-width:none}.w-head .w-eyebrow{grid-row:1/4;padding-top:.6rem}.w-head>*:not(.w-eyebrow){grid-column:2}}`,
  magazine: `.w-prose{columns:2 320px;column-gap:48px;max-width:none}.w-prose>p:first-child::first-letter{font-family:var(--f-head);font-size:3.6em;line-height:.8;float:left;padding:.08em .12em 0 0;color:var(--c-accent)}`
};

function typeScale(direction) {
  const density = direction.prefs?.density;
  const kind = choiceOf(direction, 'typePairing').kind;
  const big = ['condensed', 'editorial'].includes(kind);
  const t = {
    display: big ? 'clamp(3rem, 7.4vw, 6.2rem)' : 'clamp(2.6rem, 6vw, 4.8rem)',
    headLineHeight: big ? '0.98' : '1.08',
    headLetterSpacing: kind === 'condensed' ? '0em' : kind === 'classic-serif' ? '-0.01em' : '-0.025em',
    headWeight: ['classic-serif', 'editorial'].includes(kind) ? '600' : '700'
  };
  if (kind === 'condensed') t.headWeight = '700';
  return { type: t, sectionY: density === 'airy' ? 'clamp(80px, 11vw, 160px)' : density === 'compact' ? 'clamp(48px, 6.5vw, 92px)' : 'clamp(64px, 9vw, 128px)' };
}

/** Tokens + a compact design stylesheet derived from the direction. */
export function designFromDirection(direction) {
  const pal = paletteOf(direction);
  const fonts = fontsOf(direction);
  const card = choiceOf(direction, 'cardTreatment').id;
  const scale = typeScale(direction);
  const kind = choiceOf(direction, 'typePairing').kind;
  const tokens = normalizeTokens({
    colors: { bg: pal.bg, surface: pal.surface, text: pal.text, muted: pal.muted, accent: pal.accent, accent2: pal.accent2, border: pal.border },
    fonts: { head: fonts.head, body: fonts.body, accent: fonts.accent || '', headWeights: fonts.headWeights, bodyWeights: fonts.bodyWeights },
    radius: RADII[card],
    layout: { sectionY: scale.sectionY },
    type: scale.type,
    motion: direction.prefs?.animation || 'subtle'
  });
  const css = [
    kind === 'condensed' ? `.w-display,.w-h1,.w-h2{text-transform:uppercase}` : '',
    CARD_CSS[card], MOTIF_CSS[choiceOf(direction, 'motif').id], NAV_CSS[choiceOf(direction, 'navPattern').id], LAYOUT_CSS[choiceOf(direction, 'layout').id],
    choiceOf(direction, 'interaction').id === 'underline-draw' ? `.w-nav a{background:linear-gradient(currentColor,currentColor) 0 100%/0 1.5px no-repeat;border-bottom:0;transition:background-size .3s var(--ease)}.w-nav a:hover,.w-nav a[aria-current=page]{background-size:100% 1.5px}` : ''
  ].filter(Boolean).join('\n');
  return { tokens, css };
}

/**
 * Build a whole site without a model.
 * @param {object} o { facts, direction, sitemap (array of page specs), logo, jobId }
 */
export function buildDemoSite({ facts, direction, sitemap, logo = '', jobId = null }) {
  const has = Object.fromEntries(sitemap.map(p => [p.type, true]));
  const { tokens, css } = designFromDirection(direction);
  const act = primaryAction(facts);
  const header = ingestChrome(defaultHeader({ businessName: facts.name, hasLogo: !!logo, cta: act.kind === 'contact' ? { label: 'Contact', href: '/contact/' } : { label: act.label, href: act.href } })).chrome;
  const footer = ingestChrome(defaultFooter({ businessName: facts.name, blurb: facts.tagline || facts.description.slice(0, 140), phone: facts.phone, email: facts.email, address: facts.address, hours: facts.hours })).chrome;
  const pages = sitemap.map((spec, i) => buildTemplatePage(spec.type, facts, {
    id: spec.id, slug: spec.slug, title: spec.type === 'home' ? 'Home' : spec.title, navLabel: spec.navLabel, order: i, inNav: spec.inNav !== false,
    purpose: spec.purpose, has, description: spec.type === 'home' ? (facts.description || '').slice(0, 155) : `${spec.title} — ${facts.name}${facts.city ? ', ' + facts.city : ''}.`
  }));
  return normalizeDoc({
    meta: { businessName: facts.name, lang: 'en', generator: { engine: 'demo', jobId, at: Date.now() } },
    brief: basicBrief(facts),
    direction,
    design: {
      concept: `Demo build (no API key). Direction: ${describeDirection(direction).map(d => d.choice).join(' · ')}.`,
      system: { summary: 'Token-driven design derived from the selected design direction.', direction: describeDirection(direction) },
      tokens, css, header, footer
    },
    pages,
    settings: { logo, favicon: logo, formRecipient: facts.email }
  });
}
