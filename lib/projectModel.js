// Shared project shape + helpers used by both API and client.
import { makeDesignSeed } from './promptBuilder.js';

export function blankProject(id, type = 'Restaurant / Café') {
  return {
    id,
    status: 'draft',
    business: { name: '', type, city: '', state: '', address: '', phone: '', email: '', currentUrl: '', description: '', tagline: '', hours: '', menu: '', services: [], reviews: [], photos: [], logo: '', logoColors: [] },
    questionnaire: { pages: ['About Us', 'Services', 'Contact Us'], integrations: {}, vibe: { tone: '', colors: '', mustHave: '', avoid: '' } },
    designSeed: makeDesignSeed(type),
    analysis: null,
    generatedHtml: '',
    auditHtml: '',
    outreach: null,
    publish: null,
    launch: null
  };
}

export function slugify(name = '') {
  return name.toLowerCase().trim()
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'business';
}

// Friendly grouping used by the public portfolio filter.
const GROUP = {
  'Restaurant / Café': 'Restaurants & Food', 'Bar / Brewery': 'Restaurants & Food', 'Bakery / Dessert Shop': 'Restaurants & Food',
  'Retail / Local Shop': 'Shops & Retail', 'Boutique / Clothing': 'Shops & Retail', 'Salon / Spa': 'Shops & Retail',
  'Insurance Agency': 'Professional Services', "Doctor's Office / Medical": 'Professional Services', 'Dentist / Orthodontist': 'Professional Services',
  'Law Firm': 'Professional Services', 'Accounting / Tax': 'Professional Services', 'Real Estate': 'Professional Services',
  'HVAC': 'Home & Trade Services', 'Roofing': 'Home & Trade Services', 'Plumbing / Electrical': 'Home & Trade Services',
  'Landscaping': 'Home & Trade Services', 'Auto Repair': 'Home & Trade Services', 'Fitness / Gym': 'Home & Trade Services',
  'Other Local Business': 'Other'
};
export function categoryLabel(type) { return GROUP[type] || 'Other'; }

// The generated HTML references the logo via the literal token {{LOGO_SRC}} so we
// never send a giant base64 data URL through the model. We swap it for the real
// data URL after generation, and swap it back before a revision to save tokens.
const LOGO_TOKEN = '{{LOGO_SRC}}';

export function injectLogo(html, logoDataUrl) {
  if (!html) return html;
  if (!logoDataUrl) return html.split(LOGO_TOKEN).join(''); // no logo: drop the token
  return html.split(LOGO_TOKEN).join(logoDataUrl);
}

export function stripLogo(html, logoDataUrl) {
  if (!html || !logoDataUrl) return html;
  return html.split(logoDataUrl).join(LOGO_TOKEN);
}
