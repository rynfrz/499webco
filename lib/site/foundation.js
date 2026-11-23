// The platform's shared foundation for every generated website:
//
//   - design TOKENS (CSS custom properties) — the persisted design system
//   - FOUNDATION_CSS — a token-driven baseline + primitive classes (`w-*`)
//     that the site's own design stylesheet restyles; it lives in a cascade
//     layer so the site's CSS always wins
//   - RUNTIME_JS — the only script a generated site runs (navigation, reveals,
//     accordions, forms, analytics). Models never write JavaScript.
//   - LAYOUTS — platform section templates built purely from the primitives,
//     so pages added later (by a customer, an integration, or demo mode)
//     automatically match the site's look.
import { escapeHtml as esc } from './html.js';

export const DEFAULT_TOKENS = {
  colors: { bg: '#fbfaf8', surface: '#ffffff', text: '#14161c', muted: '#5d6370', accent: '#1f4fe0', accent2: '#e4572e', border: '#e6e3dd', onAccent: '#ffffff' },
  fonts: { head: 'Fraunces', body: 'Inter', accent: '', headWeights: '400;600;700', bodyWeights: '400;500;600' },
  radius: { base: '10px', lg: '20px', btn: '999px' },
  layout: { container: '1160px', gutter: 'clamp(20px, 5vw, 48px)', sectionY: 'clamp(64px, 9vw, 128px)' },
  type: {
    display: 'clamp(2.6rem, 6.2vw, 5rem)', h1: 'clamp(2.2rem, 4.6vw, 3.6rem)', h2: 'clamp(1.7rem, 3.2vw, 2.6rem)', h3: '1.25rem',
    lead: 'clamp(1.08rem, 1.5vw, 1.3rem)', body: '1rem', small: '0.875rem',
    headLineHeight: '1.08', headLetterSpacing: '-0.02em', headWeight: '700', bodyLineHeight: '1.65'
  },
  shadow: '0 1px 2px rgb(0 0 0 / 0.04), 0 14px 36px rgb(0 0 0 / 0.08)',
  motion: 'subtle'
};

const COLOR_RE = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab)\([0-9a-z.,%\s/\-]+\))$/i;
const LENGTH_RE = /^(0|[0-9.]+(px|rem|em|%|vw|vh|ch)|clamp\([0-9a-z.,%\s+\-*/()]+\)|min\([0-9a-z.,%\s+\-*/()]+\)|max\([0-9a-z.,%\s+\-*/()]+\))$/i;
const NUMBER_RE = /^-?[0-9.]+(em|rem|px|%)?$/;
const FONT_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{1,39}$/;
const WEIGHTS_RE = /^[0-9]{3}(;[0-9]{3}){0,5}$/;
const SHADOW_RE = /^[0-9a-z.,%\s/()#\-]+$/i;

function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(expandHex(hex) || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function expandHex(h = '') {
  const s = String(h).trim();
  if (/^#[0-9a-f]{3}$/i.test(s)) return '#' + s.slice(1).split('').map(c => c + c).join('');
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  if (/^#[0-9a-f]{8}$/i.test(s)) return s.slice(0, 7);
  return null;
}
/** WCAG contrast ratio between two hex colours (null if either is not hex). */
export function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b);
  if (la == null || lb == null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function readableOn(bg) {
  const l = luminance(bg);
  if (l == null) return '#ffffff';
  return l > 0.5 ? '#111111' : '#ffffff';
}

/** Validate tokens coming from a model or an editor; anything invalid falls back to the default. */
export function normalizeTokens(input = {}) {
  const t = JSON.parse(JSON.stringify(DEFAULT_TOKENS));
  const take = (group, key, re, v) => { if (typeof v === 'string' && v.length < 120 && re.test(v.trim())) t[group][key] = v.trim(); };
  const c = input.colors || {};
  for (const k of ['bg', 'surface', 'text', 'muted', 'accent', 'accent2', 'border', 'onAccent']) take('colors', k, COLOR_RE, c[k] ?? c[k === 'accent2' ? 'accent-2' : k]);
  if (!c.onAccent) t.colors.onAccent = readableOn(t.colors.accent);
  // Guarantee readable button text even if the model chose a poor pairing.
  const cr = contrastRatio(t.colors.accent, t.colors.onAccent);
  if (cr != null && cr < 3) t.colors.onAccent = readableOn(t.colors.accent);
  const f = input.fonts || {};
  for (const k of ['head', 'body', 'accent']) take('fonts', k, FONT_RE, f[k]);
  take('fonts', 'headWeights', WEIGHTS_RE, f.headWeights);
  take('fonts', 'bodyWeights', WEIGHTS_RE, f.bodyWeights);
  const r = input.radius || {};
  for (const k of ['base', 'lg', 'btn']) take('radius', k, LENGTH_RE, r[k]);
  const l = input.layout || {};
  for (const k of ['container', 'gutter', 'sectionY']) take('layout', k, LENGTH_RE, l[k]);
  const ty = input.type || {};
  for (const k of ['display', 'h1', 'h2', 'h3', 'lead', 'body', 'small']) take('type', k, LENGTH_RE, ty[k]);
  for (const k of ['headLineHeight', 'headLetterSpacing', 'bodyLineHeight']) take('type', k, NUMBER_RE, ty[k]);
  if (/^[1-9]00$/.test(String(ty.headWeight || ''))) t.type.headWeight = String(ty.headWeight);
  if (typeof input.shadow === 'string' && input.shadow.length < 200 && SHADOW_RE.test(input.shadow)) t.shadow = input.shadow;
  if (['none', 'subtle', 'moderate', 'expressive'].includes(input.motion)) t.motion = input.motion;
  return t;
}

export function tokensCss(tokens) {
  const t = normalizeTokens(tokens);
  const stack = (name, fallback) => `"${name}", ${fallback}`;
  const serifish = /serif|garamond|caslon|playfair|fraunces|lora|slab|crimson|cormorant/i;
  const headFallback = serifish.test(t.fonts.head) ? 'Georgia, "Times New Roman", serif' : 'system-ui, -apple-system, "Segoe UI", sans-serif';
  const bodyFallback = serifish.test(t.fonts.body) ? 'Georgia, serif' : 'system-ui, -apple-system, "Segoe UI", sans-serif';
  return `:root{
--c-bg:${t.colors.bg};--c-surface:${t.colors.surface};--c-text:${t.colors.text};--c-muted:${t.colors.muted};
--c-accent:${t.colors.accent};--c-accent-2:${t.colors.accent2};--c-border:${t.colors.border};--c-on-accent:${t.colors.onAccent};
--f-head:${stack(t.fonts.head, headFallback)};--f-body:${stack(t.fonts.body, bodyFallback)};--f-accent:${t.fonts.accent ? stack(t.fonts.accent, 'cursive') : 'var(--f-head)'};
--radius:${t.radius.base};--radius-lg:${t.radius.lg};--radius-btn:${t.radius.btn};
--container:${t.layout.container};--gutter:${t.layout.gutter};--section-y:${t.layout.sectionY};
--fs-display:${t.type.display};--fs-h1:${t.type.h1};--fs-h2:${t.type.h2};--fs-h3:${t.type.h3};--fs-lead:${t.type.lead};--fs-body:${t.type.body};--fs-small:${t.type.small};
--lh-head:${t.type.headLineHeight};--ls-head:${t.type.headLetterSpacing};--fw-head:${t.type.headWeight};--lh-body:${t.type.bodyLineHeight};
--shadow:${t.shadow};--ease:cubic-bezier(.2,.7,.2,1);--dur:.6s}`;
}

/** Google Fonts stylesheet URL for the token fonts. */
export function fontsHref(tokens) {
  const t = normalizeTokens(tokens);
  const fam = (name, weights) => `family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@${weights}`;
  const parts = [];
  const seen = new Set();
  const add = (name, weights) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    parts.push(fam(name, weights));
  };
  if (t.fonts.head === t.fonts.body) {
    const all = [...new Set([...t.fonts.headWeights.split(';'), ...t.fonts.bodyWeights.split(';')])].sort().join(';');
    add(t.fonts.head, all);
  } else {
    add(t.fonts.head, t.fonts.headWeights);
    add(t.fonts.body, t.fonts.bodyWeights);
  }
  if (t.fonts.accent) add(t.fonts.accent, '400;700');
  return `https://fonts.googleapis.com/css2?${parts.join('&')}&display=swap`;
}

// ---------------------------------------------------------------------------
// Foundation CSS (in a cascade layer: the site's own CSS always overrides it)
// ---------------------------------------------------------------------------

// Element-level baseline (omitted for converted classic sites, which bring their own).
const FOUNDATION_BASE = `*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:96px}
body{margin:0;background:var(--c-bg);color:var(--c-text);font-family:var(--f-body);font-size:var(--fs-body);line-height:var(--lh-body);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:hidden}
img,svg,video,iframe{max-width:100%}
img,video{height:auto;display:block}
h1,h2,h3,h4,h5,h6{font-family:var(--f-head);font-weight:var(--fw-head);line-height:var(--lh-head);letter-spacing:var(--ls-head);margin:0 0 .5em;text-wrap:balance}
p{margin:0 0 1em;text-wrap:pretty}
a{color:inherit}
ul,ol{margin:0 0 1em;padding-left:1.2em}
button,input,select,textarea{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--c-accent);outline-offset:3px;border-radius:4px}
`;

// Primitive classes, section modifiers, header/footer defaults and motion.
const FOUNDATION_PRIMS = `.w-skip{position:absolute;left:12px;top:-60px;background:var(--c-text);color:var(--c-bg);padding:10px 16px;border-radius:8px;z-index:100;text-decoration:none}
.w-skip:focus{top:12px}
.w-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.w-container{width:min(100% - 2 * var(--gutter),var(--container));margin-inline:auto}
.w-section{padding-block:var(--section-y);position:relative}
.w-section.is-tight{padding-block:calc(var(--section-y) * .55)}
.w-section.is-loose{padding-block:calc(var(--section-y) * 1.3)}
.w-section.is-tint{background:color-mix(in srgb,var(--c-accent) 7%,var(--c-bg))}
.w-section.is-surface{background:var(--c-surface)}
.w-section.is-accent{background:var(--c-accent);color:var(--c-on-accent);--c-muted:color-mix(in srgb,var(--c-on-accent) 78%,transparent);--c-border:color-mix(in srgb,var(--c-on-accent) 28%,transparent);--c-surface:color-mix(in srgb,var(--c-on-accent) 10%,transparent)}
.w-section.is-accent .w-btn--primary{background:var(--c-on-accent);color:var(--c-accent);border-color:var(--c-on-accent)}
.w-section.is-dark{background:var(--c-text);color:var(--c-bg);--c-muted:color-mix(in srgb,var(--c-bg) 72%,transparent);--c-border:color-mix(in srgb,var(--c-bg) 22%,transparent);--c-surface:color-mix(in srgb,var(--c-bg) 8%,transparent)}
.w-section.is-center{text-align:center}
.w-section.is-center .w-lead,.w-section.is-center .w-prose{margin-inline:auto}
.w-section.is-center .w-actions{justify-content:center}
.w-eyebrow{display:inline-block;font-size:var(--fs-small);font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--c-accent);margin:0 0 1rem}
.is-accent .w-eyebrow,.is-dark .w-eyebrow{color:inherit;opacity:.8}
.w-display{font-size:var(--fs-display)}
.w-h1{font-size:var(--fs-h1)}
.w-h2{font-size:var(--fs-h2)}
.w-h3{font-size:var(--fs-h3);letter-spacing:-.01em}
.w-lead{font-size:var(--fs-lead);color:var(--c-muted);max-width:60ch;line-height:1.55}
.w-muted{color:var(--c-muted)}
.w-prose{max-width:68ch}
.w-prose>*+*{margin-top:1em}
.w-prose h2{font-size:var(--fs-h2);margin-top:1.6em}
.w-prose h3{font-size:var(--fs-h3);margin-top:1.4em}
.w-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:1.75rem;align-items:center}
.w-btn{display:inline-flex;align-items:center;justify-content:center;gap:.5em;padding:.9em 1.5em;border-radius:var(--radius-btn);border:1.5px solid var(--c-text);background:transparent;color:var(--c-text);font-weight:600;font-size:var(--fs-body);line-height:1.2;text-decoration:none;cursor:pointer;transition:transform .2s var(--ease),background-color .2s,color .2s,border-color .2s,box-shadow .2s}
.w-btn:hover{transform:translateY(-1px)}
.w-btn:active{transform:translateY(0)}
.w-btn--primary{background:var(--c-accent);border-color:var(--c-accent);color:var(--c-on-accent)}
.w-btn--primary:hover{box-shadow:0 8px 24px color-mix(in srgb,var(--c-accent) 35%,transparent)}
.w-btn--ghost{border-color:var(--c-border)}
.w-btn--lg{padding:1.05em 1.9em;font-size:1.05rem}
.w-link{color:var(--c-accent);font-weight:600;text-decoration:none;border-bottom:1.5px solid color-mix(in srgb,var(--c-accent) 35%,transparent);transition:border-color .2s}
.w-link:hover{border-color:var(--c-accent)}
.w-grid{display:grid;gap:clamp(16px,2.4vw,28px)}
.w-grid--2{grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))}
.w-grid--3{grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}
.w-grid--4{grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))}
.w-split{display:grid;gap:clamp(28px,5vw,72px);align-items:center;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))}
.w-split.is-reverse>*:first-child{order:2}
.w-stack>*+*{margin-top:1rem}
.w-head{max-width:720px;margin-bottom:clamp(28px,4vw,56px)}
.is-center .w-head{margin-inline:auto}
.w-card{background:var(--c-surface);border:1px solid var(--c-border);border-radius:var(--radius-lg);padding:clamp(20px,2.6vw,32px);transition:transform .25s var(--ease),box-shadow .25s,border-color .25s}
a.w-card{display:block;text-decoration:none}
a.w-card:hover{transform:translateY(-3px);box-shadow:var(--shadow)}
.w-card p:last-child{margin-bottom:0}
.w-num{font-family:var(--f-head);font-size:var(--fs-small);font-weight:700;letter-spacing:.08em;color:var(--c-accent);display:block;margin-bottom:.9rem}
.w-icon{width:44px;height:44px;border-radius:var(--radius);display:grid;place-items:center;background:color-mix(in srgb,var(--c-accent) 12%,transparent);color:var(--c-accent);margin-bottom:1rem}
.w-icon svg{width:22px;height:22px}
.w-media{border-radius:var(--radius-lg);overflow:hidden;background:color-mix(in srgb,var(--c-accent) 10%,var(--c-surface));position:relative}
.w-media img{width:100%;height:100%;object-fit:cover}
.w-media--ratio{aspect-ratio:4/3}
.w-media--tall{aspect-ratio:4/5}
.w-art{aspect-ratio:4/3;border-radius:var(--radius-lg);background:linear-gradient(135deg,color-mix(in srgb,var(--c-accent) 85%,var(--c-text)),var(--c-accent-2));position:relative;overflow:hidden}
.w-art::before,.w-art::after{content:"";position:absolute;border-radius:50%;border:1.5px solid color-mix(in srgb,var(--c-on-accent) 45%,transparent)}
.w-art::before{inset:12% 30% 28% 10%}
.w-art::after{inset:38% 8% 10% 42%}
.w-badge{display:inline-flex;align-items:center;gap:.4em;padding:.35em .8em;border-radius:999px;border:1px solid var(--c-border);font-size:var(--fs-small);font-weight:600}
.w-divider{border:0;border-top:1px solid var(--c-border);margin:0}
.w-list{list-style:none;padding:0;margin:0}
.w-list>li{padding:1rem 0;border-top:1px solid var(--c-border)}
.w-list>li:last-child{border-bottom:1px solid var(--c-border)}
.w-check{list-style:none;padding:0;margin:1.25rem 0 0}
.w-check>li{position:relative;padding-left:1.9em;margin-bottom:.6em}
.w-check>li::before{content:"";position:absolute;left:0;top:.35em;width:1.05em;height:1.05em;border-radius:50%;background:var(--c-accent);-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M10 0a10 10 0 100 20 10 10 0 000-20zm4.7 7.7l-5.4 5.6a1 1 0 01-1.4 0L5.3 10.7a1 1 0 011.4-1.4l1.9 1.9 4.7-4.9a1 1 0 011.4 1.4z'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M10 0a10 10 0 100 20 10 10 0 000-20zm4.7 7.7l-5.4 5.6a1 1 0 01-1.4 0L5.3 10.7a1 1 0 011.4-1.4l1.9 1.9 4.7-4.9a1 1 0 011.4 1.4z'/%3E%3C/svg%3E") center/contain no-repeat}
.w-quote{margin:0}
.w-quote blockquote{margin:0 0 1rem;font-family:var(--f-head);font-size:clamp(1.15rem,1.9vw,1.5rem);line-height:1.4;letter-spacing:-.01em}
.w-quote figcaption{font-size:var(--fs-small);color:var(--c-muted);font-weight:600}
.w-stat b{display:block;font-family:var(--f-head);font-size:clamp(2.2rem,4.4vw,3.4rem);line-height:1;letter-spacing:-.03em}
.w-stat span{color:var(--c-muted);font-size:var(--fs-small)}
.w-faq details{border-top:1px solid var(--c-border)}
.w-faq details:last-child{border-bottom:1px solid var(--c-border)}
.w-faq summary{cursor:pointer;list-style:none;padding:1.15rem 2.2rem 1.15rem 0;font-weight:600;font-size:1.05rem;position:relative}
.w-faq summary::-webkit-details-marker{display:none}
.w-faq summary::after{content:"+";position:absolute;right:.2rem;top:50%;translate:0 -50%;font-size:1.5rem;font-weight:400;color:var(--c-accent);transition:rotate .25s var(--ease)}
.w-faq details[open] summary::after{rotate:45deg}
.w-faq .w-faq-a{padding:0 2.2rem 1.25rem 0;color:var(--c-muted);max-width:70ch}
.w-table{width:100%;border-collapse:collapse}
.w-table td,.w-table th{padding:.8rem 0;border-bottom:1px solid var(--c-border);text-align:left;vertical-align:top}
.w-price{display:flex;justify-content:space-between;gap:1rem;align-items:baseline}
.w-price b{font-family:var(--f-head);white-space:nowrap}
.w-form{display:grid;gap:14px}
.w-form .w-row{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))}
.w-label{display:block;font-size:var(--fs-small);font-weight:600;margin-bottom:6px}
.w-input{width:100%;padding:.85em 1em;border-radius:var(--radius);border:1.5px solid var(--c-border);background:var(--c-surface);color:var(--c-text);transition:border-color .2s,box-shadow .2s}
.w-input:focus{outline:none;border-color:var(--c-accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--c-accent) 16%,transparent)}
textarea.w-input{min-height:130px;resize:vertical}
.w-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}
.w-form-status{font-size:var(--fs-small);font-weight:600;min-height:1.4em;margin:0}
.w-form-status.is-ok{color:#18794e}
.w-form-status.is-err{color:#c2362b}
.w-embed{border-radius:var(--radius-lg);overflow:hidden;border:1px solid var(--c-border);background:var(--c-surface)}
.w-embed iframe{display:block;width:100%;border:0;min-height:420px}
.w-map iframe{min-height:380px}
.w-header{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--c-bg) 88%,transparent);backdrop-filter:saturate(1.4) blur(12px);-webkit-backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid transparent;transition:border-color .25s,box-shadow .25s}
.w-header.is-scrolled{border-bottom-color:var(--c-border)}
.w-header-in{display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:72px}
.w-brand{font-family:var(--f-head);font-weight:var(--fw-head);font-size:1.25rem;letter-spacing:var(--ls-head);text-decoration:none;display:inline-flex;align-items:center;gap:10px}
.w-brand img{height:40px;width:auto}
.w-nav{display:flex;align-items:center;gap:clamp(14px,2.2vw,30px)}
.w-nav a{text-decoration:none;font-weight:500;font-size:.95rem;padding:6px 0;border-bottom:1.5px solid transparent;transition:border-color .2s,color .2s}
.w-nav a:hover,.w-nav a[aria-current=page]{border-bottom-color:var(--c-accent)}
.w-nav-cta{margin-left:6px}
.w-nav-toggle{display:none;width:44px;height:44px;border:1px solid var(--c-border);border-radius:var(--radius);background:transparent;cursor:pointer;place-items:center;padding:0}
.w-nav-toggle span,.w-nav-toggle span::before,.w-nav-toggle span::after{display:block;width:18px;height:1.5px;background:currentColor;position:relative;transition:transform .25s var(--ease),opacity .2s}
.w-nav-toggle span::before,.w-nav-toggle span::after{content:"";position:absolute;left:0}
.w-nav-toggle span::before{top:-6px}
.w-nav-toggle span::after{top:6px}
.is-open .w-nav-toggle span{background:transparent}
.is-open .w-nav-toggle span::before{transform:translateY(6px) rotate(45deg)}
.is-open .w-nav-toggle span::after{transform:translateY(-6px) rotate(-45deg)}
@media (max-width:860px){
.w-nav-toggle{display:grid}
.w-nav{position:absolute;left:0;right:0;top:100%;flex-direction:column;align-items:stretch;gap:0;background:var(--c-bg);border-bottom:1px solid var(--c-border);padding:8px var(--gutter) 20px;display:none;box-shadow:0 24px 40px rgb(0 0 0/.08)}
.is-open .w-nav{display:flex}
.w-nav a{padding:14px 0;border-bottom:1px solid var(--c-border);font-size:1.05rem}
.w-nav .w-btn{margin-top:14px;border-bottom-width:1.5px}
.w-nav-cta{margin-left:0}
}
.w-footer{background:var(--c-text);color:var(--c-bg);padding-block:clamp(48px,6vw,80px) 28px;--c-muted:color-mix(in srgb,var(--c-bg) 68%,transparent);--c-border:color-mix(in srgb,var(--c-bg) 18%,transparent)}
.w-footer a{text-decoration:none}
.w-footer a:hover{text-decoration:underline}
.w-footer-grid{display:grid;gap:36px;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))}
.w-footer h3{font-size:var(--fs-small);letter-spacing:.14em;text-transform:uppercase;font-family:var(--f-body);font-weight:600;opacity:.7;margin-bottom:1rem}
.w-footer-nav{display:grid;gap:.55rem}
.w-footer-base{margin-top:48px;padding-top:20px;border-top:1px solid var(--c-border);display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;font-size:var(--fs-small);color:var(--c-muted)}
.w-credit{opacity:.75}
.w-wa{position:fixed;right:18px;bottom:18px;z-index:60;width:56px;height:56px;border-radius:50%;background:#25d366;color:#fff;display:grid;place-items:center;box-shadow:0 10px 28px rgb(0 0 0/.22);transition:transform .2s var(--ease)}
.w-wa:hover{transform:scale(1.06)}
[data-reveal].is-in{animation:w-rise var(--dur) var(--ease) both}
[data-reveal=fade].is-in{animation-name:w-fade}
@keyframes w-rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes w-fade{from{opacity:0}to{opacity:1}}
[data-motion=none] [data-reveal].is-in{animation:none}
[data-motion=subtle]{--dur:.5s}
[data-motion=expressive]{--dur:.8s}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
@media print{.w-header,.w-nav-toggle{position:static}}
`;

export const FOUNDATION_CSS = `@layer foundation{
${FOUNDATION_BASE}${FOUNDATION_PRIMS}}`;
export const FOUNDATION_PRIMITIVES_CSS = `@layer foundation{
${FOUNDATION_PRIMS}}`;

// ---------------------------------------------------------------------------
// Runtime (the only JavaScript a generated site runs)
// ---------------------------------------------------------------------------

export const RUNTIME_JS = `(function(){
'use strict';
var d=document,root=d.documentElement,cfg=root.dataset;
function $(s,c){return Array.prototype.slice.call((c||d).querySelectorAll(s));}
/* header */
var header=d.querySelector('[data-header]');
if(header){
  var onScroll=function(){header.classList.toggle('is-scrolled',window.scrollY>8);};
  onScroll();window.addEventListener('scroll',onScroll,{passive:true});
  var toggle=header.querySelector('[data-nav-toggle]');
  if(toggle){
    toggle.addEventListener('click',function(){var open=header.classList.toggle('is-open');toggle.setAttribute('aria-expanded',open?'true':'false');});
    $('a',header).forEach(function(a){a.addEventListener('click',function(){header.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');});});
    d.addEventListener('keydown',function(e){if(e.key==='Escape'&&header.classList.contains('is-open')){header.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');toggle.focus();}});
  }
}
/* reveal on scroll */
var reveals=$('[data-reveal]');
if(reveals.length){
  if(!('IntersectionObserver' in window)||cfg.motion==='none'){reveals.forEach(function(el){el.classList.add('is-in');});}
  else{
    var io=new IntersectionObserver(function(entries){entries.forEach(function(en){if(en.isIntersecting){var el=en.target;var sibs=el.parentNode?Array.prototype.filter.call(el.parentNode.children,function(c){return c.hasAttribute('data-reveal');}):[el];var i=Math.max(0,sibs.indexOf(el));el.style.animationDelay=Math.min(i,6)*70+'ms';el.classList.add('is-in');io.unobserve(el);}});},{rootMargin:'0px 0px -8% 0px',threshold:0.08});
    reveals.forEach(function(el){io.observe(el);});
  }
}
/* count-up numbers: <b data-count="250">250</b> */
$('[data-count]').forEach(function(el){
  var target=parseFloat(el.getAttribute('data-count'));if(!isFinite(target)||!('IntersectionObserver' in window))return;
  var text=el.textContent,prefix=(text.match(/^[^0-9]*/)||[''])[0],suffix=(text.match(/[^0-9.,]*$/)||[''])[0];
  var io2=new IntersectionObserver(function(es){es.forEach(function(en){if(!en.isIntersecting)return;io2.disconnect();var t0=performance.now(),dur=1100;(function tick(now){var p=Math.min(1,(now-t0)/dur),v=target*(1-Math.pow(1-p,3));el.textContent=prefix+(target%1?v.toFixed(1):Math.round(v).toLocaleString())+suffix;if(p<1)requestAnimationFrame(tick);})(t0);});},{threshold:0.4});
  io2.observe(el);
});
/* current year */
$('[data-year]').forEach(function(el){el.textContent=new Date().getFullYear();});
/* forms */
$('form[data-form]').forEach(function(form){
  var status=form.querySelector('[data-form-status]');
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var endpoint=form.getAttribute('data-endpoint')||cfg.forms;
    if(!endpoint){if(status){status.textContent='This form is not connected yet.';status.className='w-form-status is-err';}return;}
    var data={};$('input,textarea,select',form).forEach(function(f){if(!f.name||f.type==='submit')return;if((f.type==='checkbox'||f.type==='radio')&&!f.checked)return;data[f.name]=f.value;});
    var btn=form.querySelector('[type=submit]');if(btn){btn.disabled=true;}
    if(status){status.textContent='Sending…';status.className='w-form-status';}
    fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({form:form.getAttribute('data-form'),page:location.pathname,fields:data})})
    .then(function(r){return r.json().catch(function(){return {};}).then(function(j){return {ok:r.ok,j:j};});})
    .then(function(res){
      if(btn){btn.disabled=false;}
      if(res.ok){form.reset();if(status){status.textContent=form.getAttribute('data-success')||'Thanks — your message was sent. We will be in touch shortly.';status.className='w-form-status is-ok';}}
      else if(status){status.textContent=(res.j&&res.j.error)||'Sorry, that did not send. Please call or email us instead.';status.className='w-form-status is-err';}
    })
    .catch(function(){if(btn){btn.disabled=false;}if(status){status.textContent='Sorry, that did not send. Please call or email us instead.';status.className='w-form-status is-err';}});
  });
});
/* third-party tools switched on under Integrations (ids are validated server-side) */
function load(src,attrs){var s=d.createElement('script');s.async=true;s.src=src;if(attrs)Object.keys(attrs).forEach(function(k){s.setAttribute(k,attrs[k]);});d.head.appendChild(s);return s;}
if(cfg.ga&&/^G-[A-Z0-9]{6,14}$/.test(cfg.ga)){window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments);};window.gtag('js',new Date());window.gtag('config',cfg.ga);load('https://www.googletagmanager.com/gtag/js?id='+cfg.ga);}
if(cfg.fbq&&/^[0-9]{14,17}$/.test(cfg.fbq)){(function(f){if(f.fbq)return;var n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments);};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=true;n.version='2.0';n.queue=[];})(window);load('https://connect.facebook.net/en_US/fbevents.js');window.fbq('init',cfg.fbq);window.fbq('track','PageView');}
if(cfg.tawk&&/^[a-f0-9]{24}[/][a-z0-9]{6,20}$/i.test(cfg.tawk)){window.Tawk_API=window.Tawk_API||{};window.Tawk_LoadStart=new Date();load('https://embed.tawk.to/'+cfg.tawk,{charset:'UTF-8',crossorigin:'*'});}
if(cfg.crisp&&/^[0-9a-f-]{36}$/.test(cfg.crisp)){window.$crisp=[];window.CRISP_WEBSITE_ID=cfg.crisp;load('https://client.crisp.chat/l.js');}
/* privacy-friendly page view (no cookies) */
if(cfg.track&&navigator.sendBeacon&&!/bot|crawl|spider|headless/i.test(navigator.userAgent)){
  try{navigator.sendBeacon(cfg.track,new Blob([JSON.stringify({p:cfg.page||location.pathname})],{type:'text/plain'}));}catch(e){}
}
})();`;

// ---------------------------------------------------------------------------
// Platform section layouts. Content is escaped here; editable parts carry
// data-f markers so they become fields exactly like model-built sections.
// ---------------------------------------------------------------------------

const rich = s => esc(s || '').replace(/\n/g, '<br>');
const btn = (key, label, href, cls = 'w-btn w-btn--primary') => label ? `<a class="${cls}" data-f="${key}" href="${esc(href || '#')}">${esc(label)}</a>` : '';
const ICONS = {
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
};
const media = (key, src, alt, cls = 'w-media w-media--ratio') =>
  src ? `<div class="${cls}" data-reveal><img data-f="${key}" src="${esc(src)}" alt="${esc(alt || '')}"></div>` : `<div class="w-art" data-reveal aria-hidden="true"></div>`;
const head = (c, level = 'h2') => `<div class="w-head" data-reveal>${c.eyebrow ? `<p class="w-eyebrow" data-f="eyebrow">${esc(c.eyebrow)}</p>` : ''}<${level} class="${level === 'h1' ? 'w-h1' : 'w-h2'}" data-f="title">${esc(c.title || '')}</${level}>${c.lead ? `<p class="w-lead" data-f="lead">${rich(c.lead)}</p>` : ''}</div>`;

export const LAYOUTS = {
  hero: {
    name: 'Hero', type: 'hero',
    build: c => `<div class="w-container w-split"><div data-reveal>${c.eyebrow ? `<p class="w-eyebrow" data-f="eyebrow">${esc(c.eyebrow)}</p>` : ''}<h1 class="w-display" data-f="title">${esc(c.title || '')}</h1>${c.lead ? `<p class="w-lead" data-f="lead">${rich(c.lead)}</p>` : ''}<div class="w-actions">${btn('cta', c.cta?.label, c.cta?.href, 'w-btn w-btn--primary w-btn--lg')}${btn('cta2', c.cta2?.label, c.cta2?.href, 'w-btn w-btn--ghost w-btn--lg')}</div>${c.note ? `<p class="w-muted" style="margin-top:1.25rem;font-size:var(--fs-small)" data-f="note">${esc(c.note)}</p>` : ''}</div>${media('image', c.image, c.imageAlt, 'w-media w-media--tall')}</div>`
  },
  pageHeader: {
    name: 'Page header', type: 'header',
    build: c => `<div class="w-container">${head({ ...c }, 'h1')}</div>`
  },
  text: {
    name: 'Text', type: 'content',
    build: c => `<div class="w-container">${c.title ? head(c) : ''}<div class="w-prose" data-reveal>${(c.paragraphs || []).map((p, i) => `<p data-f="p${i + 1}">${rich(p)}</p>`).join('')}</div></div>`
  },
  split: {
    name: 'Text with image', type: 'content',
    build: c => `<div class="w-container w-split${c.reverse ? ' is-reverse' : ''}"><div data-reveal>${c.eyebrow ? `<p class="w-eyebrow" data-f="eyebrow">${esc(c.eyebrow)}</p>` : ''}<h2 class="w-h2" data-f="title">${esc(c.title || '')}</h2>${(c.paragraphs || []).map((p, i) => `<p class="${i === 0 ? 'w-lead' : 'w-muted'}" data-f="p${i + 1}">${rich(p)}</p>`).join('')}${c.bullets?.length ? `<ul class="w-check">${c.bullets.map((b, i) => `<li data-item><span data-f="b${i + 1}">${esc(b)}</span></li>`).join('')}</ul>` : ''}${c.cta?.label ? `<div class="w-actions">${btn('cta', c.cta.label, c.cta.href)}</div>` : ''}</div>${media('image', c.image, c.imageAlt)}</div>`
  },
  features: {
    name: 'Feature cards', type: 'services',
    build: c => `<div class="w-container">${head(c)}<div class="w-grid w-grid--3">${(c.items || []).map((it, i) => `<article class="w-card" data-item data-reveal><span class="w-num">${String(i + 1).padStart(2, '0')}</span><h3 class="w-h3" data-f="item${i + 1}-title">${esc(it.title)}</h3><p class="w-muted" data-f="item${i + 1}-body">${rich(it.body)}</p>${it.href ? `<a class="w-link" data-f="item${i + 1}-link" href="${esc(it.href)}">${esc(it.linkLabel || 'Learn more')}</a>` : ''}</article>`).join('')}</div></div>`
  },
  list: {
    name: 'Detail list', type: 'list',
    build: c => `<div class="w-container">${head(c)}<ul class="w-list" data-reveal>${(c.items || []).map((it, i) => `<li data-item><div class="w-price"><h3 class="w-h3" style="margin:0" data-f="item${i + 1}-title">${esc(it.title)}</h3>${it.meta ? `<b data-f="item${i + 1}-meta">${esc(it.meta)}</b>` : ''}</div>${it.body ? `<p class="w-muted" style="margin:.35rem 0 0" data-f="item${i + 1}-body">${rich(it.body)}</p>` : ''}</li>`).join('')}</ul></div>`
  },
  steps: {
    name: 'Process steps', type: 'process',
    build: c => `<div class="w-container">${head(c)}<div class="w-grid w-grid--4">${(c.items || []).map((it, i) => `<div data-item data-reveal><span class="w-num">Step ${i + 1}</span><h3 class="w-h3" data-f="step${i + 1}-title">${esc(it.title)}</h3><p class="w-muted" data-f="step${i + 1}-body">${rich(it.body)}</p></div>`).join('')}</div></div>`
  },
  stats: {
    name: 'Key numbers', type: 'stats',
    build: c => `<div class="w-container"><div class="w-grid w-grid--4">${(c.items || []).map((it, i) => `<div class="w-stat" data-item data-reveal><b data-f="stat${i + 1}-value">${esc(it.value)}</b><span data-f="stat${i + 1}-label">${esc(it.label)}</span></div>`).join('')}</div></div>`
  },
  quotes: {
    name: 'Testimonials', type: 'testimonials',
    build: c => `<div class="w-container">${head(c)}<div class="w-grid w-grid--3">${(c.items || []).map((it, i) => `<figure class="w-quote w-card" data-item data-reveal><blockquote data-f="quote${i + 1}-text">${esc(it.text)}</blockquote><figcaption data-f="quote${i + 1}-author">${esc(it.author || '')}</figcaption></figure>`).join('')}</div></div>`
  },
  faq: {
    name: 'FAQ', type: 'faq',
    build: c => `<div class="w-container">${head(c)}<div class="w-faq" data-reveal>${(c.items || []).map((it, i) => `<details data-item><summary><span data-f="faq${i + 1}-q">${esc(it.q)}</span></summary><div class="w-faq-a"><p data-f="faq${i + 1}-a">${rich(it.a)}</p></div></details>`).join('')}</div></div>`
  },
  gallery: {
    name: 'Gallery', type: 'gallery',
    build: c => `<div class="w-container">${head(c)}<div class="w-grid w-grid--3">${(c.images || []).map((im, i) => `<figure class="w-media w-media--ratio" data-item data-reveal style="margin:0"><img data-f="img${i + 1}" src="${esc(im.src)}" alt="${esc(im.alt || '')}"></figure>`).join('')}</div></div>`
  },
  cta: {
    name: 'Call to action', type: 'cta', options: { tone: 'accent', align: 'center' },
    build: c => `<div class="w-container"><div data-reveal><h2 class="w-h1" data-f="title">${esc(c.title || '')}</h2>${c.lead ? `<p class="w-lead" data-f="lead">${rich(c.lead)}</p>` : ''}<div class="w-actions">${btn('cta', c.cta?.label, c.cta?.href, 'w-btn w-btn--primary w-btn--lg')}${btn('cta2', c.cta2?.label, c.cta2?.href, 'w-btn w-btn--ghost w-btn--lg')}</div></div></div>`
  },
  contact: {
    name: 'Contact', type: 'contact',
    build: c => {
      const rows = [
        c.phone && `<li><div class="w-icon">${ICONS.phone}</div><div><b>Call</b><br><a class="w-link" data-f="phone" href="tel:${esc(String(c.phone).replace(/[^\d+]/g, ''))}">${esc(c.phone)}</a></div></li>`,
        c.email && `<li><div class="w-icon">${ICONS.mail}</div><div><b>Email</b><br><a class="w-link" data-f="email" href="mailto:${esc(c.email)}">${esc(c.email)}</a></div></li>`,
        c.address && `<li><div class="w-icon">${ICONS.pin}</div><div><b>Visit</b><br><a class="w-link" data-f="address" href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(c.address)}">${esc(c.address)}</a></div></li>`,
        c.hours && `<li><div class="w-icon">${ICONS.clock}</div><div><b>Hours</b><br><span data-f="hours">${rich(c.hours)}</span></div></li>`
      ].filter(Boolean).join('');
      return `<div class="w-container w-split" style="align-items:start"><div data-reveal>${c.eyebrow ? `<p class="w-eyebrow" data-f="eyebrow">${esc(c.eyebrow)}</p>` : ''}<h2 class="w-h2" data-f="title">${esc(c.title || 'Get in touch')}</h2>${c.lead ? `<p class="w-lead" data-f="lead">${rich(c.lead)}</p>` : ''}<ul class="w-contact-list" style="list-style:none;padding:0;margin:2rem 0 0;display:grid;gap:1.25rem">${rows.replace(/<li>/g, '<li style="display:flex;gap:1rem;align-items:flex-start">').replace(/class="w-icon"/g, 'class="w-icon" style="margin:0;flex:none"')}</ul></div><div class="w-card" data-reveal>${contactForm(c)}</div></div>`;
    }
  },
  map: {
    name: 'Map', type: 'map',
    build: c => `<div class="w-container">${c.title ? head(c) : ''}<div class="w-embed w-map" data-reveal><iframe title="Map showing ${esc(c.address || 'our location')}" src="https://www.google.com/maps?q=${encodeURIComponent(c.address || '')}&amp;output=embed" loading="lazy"></iframe></div></div>`
  }
};

export function contactForm(c = {}) {
  return `<form class="w-form" data-form="${esc(c.formKey || 'contact')}" novalidate>
<div class="w-row"><div><label class="w-label" for="f-name">Name</label><input class="w-input" id="f-name" name="name" autocomplete="name" required></div>
<div><label class="w-label" for="f-phone">Phone</label><input class="w-input" id="f-phone" name="phone" type="tel" autocomplete="tel"></div></div>
<div><label class="w-label" for="f-email">Email</label><input class="w-input" id="f-email" name="email" type="email" autocomplete="email" required></div>
<div><label class="w-label" for="f-message">How can we help?</label><textarea class="w-input" id="f-message" name="message" required></textarea></div>
<button class="w-btn w-btn--primary" type="submit" data-f="submit">${esc(c.submitLabel || 'Send message')}</button>
<p class="w-form-status" data-form-status role="status" aria-live="polite"></p>
</form>`;
}

/** Default site chrome (used by demo mode and as a safe fallback). */
export function defaultHeader({ businessName = '', hasLogo = false, cta = null } = {}) {
  const brand = hasLogo
    ? `<a class="w-brand" href="/" aria-label="${esc(businessName)} home"><img src="{{LOGO_SRC}}" alt="${esc(businessName)} logo"></a>`
    : `<a class="w-brand" href="/"><span data-f="brand">${esc(businessName)}</span></a>`;
  return `<div class="w-container w-header-in">${brand}<button class="w-nav-toggle" type="button" data-nav-toggle aria-expanded="false" aria-label="Menu"><span></span></button><nav class="w-nav" aria-label="Main"><span data-nav style="display:contents"><a data-nav-item href="/">Page</a></span>${cta?.label ? `<a class="w-btn w-btn--primary w-nav-cta" data-f="navcta" href="${esc(cta.href || '#')}">${esc(cta.label)}</a>` : ''}</nav></div>`;
}

export function defaultFooter({ businessName = '', blurb = '', phone = '', email = '', address = '', hours = '' } = {}) {
  const contact = [
    phone && `<a data-f="fphone" href="tel:${esc(String(phone).replace(/[^\d+]/g, ''))}">${esc(phone)}</a>`,
    email && `<a data-f="femail" href="mailto:${esc(email)}">${esc(email)}</a>`,
    address && `<span data-f="faddress">${esc(address)}</span>`
  ].filter(Boolean).join('<br>');
  return `<div class="w-container"><div class="w-footer-grid"><div><p class="w-brand" style="margin:0 0 .75rem" data-f="fbrand">${esc(businessName)}</p>${blurb ? `<p class="w-muted" style="max-width:36ch" data-f="fblurb">${esc(blurb)}</p>` : ''}</div><div><h3>Explore</h3><nav class="w-footer-nav" aria-label="Footer" data-nav><a data-nav-item href="/">Page</a></nav></div>${contact ? `<div><h3>Contact</h3><p style="margin:0;line-height:1.9">${contact}</p></div>` : ''}${hours ? `<div><h3>Hours</h3><p style="margin:0;line-height:1.9" data-f="fhours">${rich(hours)}</p></div>` : ''}</div><div class="w-footer-base"><span>© <span data-year></span> <span data-f="fcopy">${esc(businessName)}</span>. All rights reserved.</span></div></div>`;
}

export const SECTION_OPTIONS = {
  tone: [['default', 'Default'], ['surface', 'Surface'], ['tint', 'Tinted'], ['accent', 'Accent colour'], ['dark', 'Dark']],
  spacing: [['normal', 'Normal'], ['tight', 'Compact'], ['loose', 'Spacious']],
  align: [['default', 'Default'], ['center', 'Centred']]
};

export function sectionOptionClasses(options = {}) {
  const cls = [];
  if (['surface', 'tint', 'accent', 'dark'].includes(options.tone)) cls.push('is-' + options.tone);
  if (['tight', 'loose'].includes(options.spacing)) cls.push('is-' + options.spacing);
  if (options.align === 'center') cls.push('is-center');
  return cls;
}
