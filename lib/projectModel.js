// Shared project shape + helpers used by both API and client.
import { makeDesignSeed } from './promptBuilder.js';

export function blankProject(id, type = 'Restaurant / Café') {
  return {
    id,
    status: 'draft',
    business: { name: '', type, city: '', state: '', address: '', phone: '', email: '', currentUrl: '', description: '', tagline: '', hours: '', menu: '', services: [], reviews: [], photos: [] },
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
