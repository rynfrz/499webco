// ─────────────────────────────────────────────────────────────────────────────
//  BRAND CONFIG — the only file you edit to rebrand this whole studio.
//  Change these values and drop your logo at public/brand/logo.png. Everything
//  (emails, portfolio, client review/pay pages, checkout) reads from here.
//  Secrets/integrations (API keys, domains) are set in the app at /admin → Settings.
// ─────────────────────────────────────────────────────────────────────────────
export const brand = {
  // Identity
  name: '499 Web Co.',            // full name shown in emails, footers, titles
  tagline: 'Great websites for local businesses — live right now.',

  // Pricing
  priceCents: 49900,              // one-time site price in cents (49900 = $499)
  priceLabel: '$499',             // how the price is written in copy
  growthLabel: '$99/mo',          // optional maintenance plan label

  // Contact (your real Google Workspace inbox + phone)
  email: 'hello@499web.co',
  phone: '404-620-6517',
  phoneTel: '+14046206517',       // E.164 for tel: links

  // Location / service area
  region: 'Gwinnett County & Metro Atlanta',
  serviceAreas: ['Dacula', 'Buford', 'Auburn', 'Braselton', 'Lawrenceville', 'Suwanee', 'Flowery Branch'],

  // Brand colors (used by the portfolio + client pages)
  colors: { blue: '#1aa6ff', cyan: '#5fd8ff', pink: '#ff2e7e', yellow: '#ffd21a' },

  // Logo (put your file here; transparent PNG recommended)
  logoPath: '/brand/logo.png',

  // Homepage at the site root:
  //   'custom' → serve the hand-built lib/homepage.js (499's racing site)
  //   'auto'   → serve the clean, brand-driven default (lib/defaultHomepage.js)
  // Either way, setting a "Homepage preview slug" in Settings overrides both
  // (serves a homepage you generated in the studio). New brands: use 'auto'.
  homepageMode: 'custom'
};
