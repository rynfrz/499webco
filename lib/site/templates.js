// Structured page templates built from the platform layouts.
//
// Used for: customer "Add page" (no AI needed), demo mode (no API key), and as
// the guaranteed-safe fallback shape. Because the layouts use only the shared
// primitives and design tokens, a page built here inherits the site's colours,
// typography, spacing, navigation and footer automatically.
//
// Copy is assembled from supplied facts. Nothing claims credentials, reviews
// or numbers the business did not give us.
import { LAYOUTS } from './foundation.js';
import { ingestSection } from './clean.js';
import { sid, slugify } from './schema.js';
import { primaryAction } from '../gen/brief.js';

function sec(layout, content, extra = {}) {
  const L = LAYOUTS[layout];
  const { section } = ingestSection({ type: L.type, name: extra.name || L.name, className: extra.className || '', html: L.build(content), options: { ...(L.options || {}), ...(extra.options || {}) } });
  return section;
}

const where = f => [f.city, f.state].filter(Boolean).join(', ');
const first = (s, n = 180) => { const t = String(s || '').trim(); return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t; };
const sentences = s => String(s || '').split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);

function ctaBlock(f, title) {
  const act = primaryAction(f);
  return sec('cta', {
    title: title || (f.city ? `Ready when you are, ${f.city}.` : 'Ready when you are.'),
    lead: f.phone || f.email ? `Reach ${f.name} directly — we reply to every enquiry.` : `Tell us what you need and ${f.name} will take it from there.`,
    cta: { label: act.label, href: act.href },
    cta2: act.kind === 'contact' ? null : { label: 'Send a message', href: '/contact/' }
  });
}

function serviceItems(f, hrefFor) {
  return f.services.slice(0, 9).map(s => {
    const [title, ...rest] = s.split(/\s[-–—:]\s/);
    return { title: title.trim(), body: rest.join(' — ').trim() || `Talk to ${f.name} about ${title.trim().toLowerCase()}${f.city ? ' in ' + f.city : ''}.`, href: hrefFor ? hrefFor(title.trim()) : '', linkLabel: 'Details' };
  });
}

export const PAGE_TEMPLATES = {
  home(f, ctx = {}) {
    const act = primaryAction(f);
    const out = [];
    out.push(sec('hero', {
      eyebrow: [f.type, where(f)].filter(Boolean).join(' · '),
      title: f.tagline || (f.city ? `${f.name}: trusted in ${f.city}` : f.name),
      lead: first(f.description, 220) || `${f.name}${where(f) ? ' serves ' + where(f) : ''}. Get in touch and tell us what you need.`,
      cta: { label: act.label, href: act.href },
      cta2: ctx.has?.services ? { label: 'See what we do', href: '/services/' } : (act.kind === 'contact' ? null : { label: 'Contact us', href: '/contact/' }),
      image: f.photos[0], imageAlt: `${f.name}${f.city ? ' in ' + f.city : ''}`
    }));
    if (f.services.length) {
      out.push(sec('features', {
        eyebrow: 'What we do', title: `How ${f.name} can help`,
        items: serviceItems(f).slice(0, 6).map(it => ({ ...it, href: ctx.has?.services ? '/services/' : '', linkLabel: 'Learn more' }))
      }, { options: { tone: 'surface' } }));
    }
    if (f.description) {
      const s = sentences(f.description);
      out.push(sec('split', {
        eyebrow: 'About us', title: `Get to know ${f.name}`,
        paragraphs: [s.slice(0, 2).join(' '), s.slice(2, 5).join(' ')].filter(Boolean),
        cta: ctx.has?.about ? { label: 'Our story', href: '/about/' } : null,
        image: f.photos[1], imageAlt: `Inside ${f.name}`, reverse: true
      }));
    }
    if (f.reviews.length) {
      out.push(sec('quotes', { eyebrow: 'In their words', title: 'What customers say', items: f.reviews.slice(0, 3).map(r => ({ text: r.text, author: r.author || 'Customer' })) }, { options: { tone: 'tint' } }));
    }
    out.push(ctaBlock(f));
    return out;
  },

  about(f) {
    const s = sentences(f.description);
    const out = [sec('pageHeader', { eyebrow: 'About', title: `About ${f.name}`, lead: f.tagline || (where(f) ? `Proudly serving ${where(f)}.` : '') })];
    out.push(sec('split', {
      title: 'Our story',
      paragraphs: s.length ? [s.slice(0, 3).join(' '), s.slice(3).join(' ')].filter(Boolean) : [`${f.name} is a ${f.type.toLowerCase()}${where(f) ? ' based in ' + where(f) : ''}.`, 'Add your story here: how you started, who is behind the business and what you care about.'],
      image: f.photos[1] || f.photos[0], imageAlt: `The team at ${f.name}`
    }));
    const diffs = String(f.differentiators || '').split(/\n|;/).map(x => x.trim()).filter(Boolean);
    if (diffs.length) out.push(sec('features', { eyebrow: 'Why us', title: `What sets ${f.name} apart`, items: diffs.slice(0, 6).map(d => ({ title: first(d, 60), body: d.length > 60 ? d : '' })) }, { options: { tone: 'surface' } }));
    out.push(ctaBlock(f, 'Let’s talk'));
    return out;
  },

  services(f) {
    const out = [sec('pageHeader', { eyebrow: 'Services', title: f.menu ? 'Menu & services' : 'What we offer', lead: where(f) ? `Everything ${f.name} offers in ${where(f)}.` : `Everything ${f.name} offers.` })];
    if (f.services.length) out.push(sec('features', { title: 'Our services', items: serviceItems(f) }));
    if (f.menu) {
      const items = f.menu.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 24).map(l => {
        const m = l.match(/^(.*?)(?:\s*[-–—|]\s*|\s{2,})(\$?[\d.,]+.*)$/);
        return m ? { title: m[1].trim(), meta: m[2].trim() } : { title: l };
      });
      out.push(sec('list', { eyebrow: 'Menu', title: 'Highlights', items }, { options: { tone: 'surface' } }));
    }
    if (!f.services.length && !f.menu) out.push(sec('text', { title: 'Services', paragraphs: ['List your services here so customers can see exactly how you can help.'] }));
    out.push(ctaBlock(f, 'Not sure what you need?'));
    return out;
  },

  service(f, ctx = {}) {
    const title = ctx.title || f.services[0] || 'Service';
    return [
      sec('pageHeader', { eyebrow: 'Service', title, lead: ctx.intro || `${title} from ${f.name}${f.city ? ' in ' + f.city : ''}.` }),
      sec('split', { title: `About our ${title.toLowerCase()}`, paragraphs: [ctx.body || `Describe what is included in ${title.toLowerCase()}, who it is for and what customers can expect.`], bullets: ctx.bullets || ['What is included', 'How long it takes', 'How to get started'], image: f.photos[2] || f.photos[0], imageAlt: title }),
      ctaBlock(f, `Ask about ${title.toLowerCase()}`)
    ];
  },

  product(f, ctx = {}) { return PAGE_TEMPLATES.service(f, { ...ctx, title: ctx.title || 'Product' }); },
  products(f) { return PAGE_TEMPLATES.services(f); },

  gallery(f, ctx = {}) {
    const out = [sec('pageHeader', { eyebrow: 'Gallery', title: ctx.title || 'Our work', lead: `A look at ${f.name}.` })];
    if (f.photos.length) out.push(sec('gallery', { images: f.photos.slice(0, 12).map((src, i) => ({ src, alt: `${f.name} photo ${i + 1}` })) }));
    else out.push(sec('text', { paragraphs: ['Add photos of your work here. Open this page in the editor and use “Add section → Gallery”, or replace this text.'] }));
    out.push(ctaBlock(f));
    return out;
  },

  testimonials(f) {
    const out = [sec('pageHeader', { eyebrow: 'Reviews', title: 'What customers say', lead: `Real feedback from ${f.name} customers.` })];
    if (f.reviews.length) out.push(sec('quotes', { items: f.reviews.map(r => ({ text: r.text, author: r.author || 'Customer' })) }));
    else out.push(sec('text', { paragraphs: ['Customer reviews will appear here once you add them. We never publish made-up testimonials.'] }));
    out.push(ctaBlock(f));
    return out;
  },

  faq(f, ctx = {}) {
    const items = ctx.items?.length ? ctx.items : [
      f.hours && { q: 'When are you open?', a: f.hours },
      f.address && { q: 'Where are you located?', a: f.address },
      (f.phone || f.email) && { q: 'How do I get in touch?', a: [f.phone && `Call ${f.phone}`, f.email && `email ${f.email}`].filter(Boolean).join(' or ') + '.' },
      f.serviceArea && { q: 'Which areas do you serve?', a: f.serviceArea }
    ].filter(Boolean);
    return [
      sec('pageHeader', { eyebrow: 'FAQ', title: 'Questions & answers', lead: `Quick answers about ${f.name}.` }),
      sec('faq', { items: items.length ? items : [{ q: 'Add your first question', a: 'Write the answer here.' }] }),
      ctaBlock(f, 'Still have a question?')
    ];
  },

  contact(f) {
    const out = [sec('contact', {
      eyebrow: 'Contact', title: `Contact ${f.name}`,
      lead: 'Send a message and we will get back to you as soon as we can.',
      phone: f.phone, email: f.email, address: f.address, hours: f.hours
    }, { options: { spacing: 'normal' } })];
    if (f.address) out.push(sec('map', { address: f.address }, { options: { spacing: 'tight' } }));
    return out;
  },

  booking(f) {
    const act = primaryAction(f);
    return [
      sec('pageHeader', { eyebrow: 'Booking', title: 'Book with us', lead: `Choose a time that suits you, or contact ${f.name} directly.` }),
      sec('cta', { title: 'Ready to book?', lead: 'Connect a booking tool in Integrations to take bookings right on this page.', cta: { label: act.label, href: act.href } }, { options: { tone: 'tint', align: 'center' } })
    ];
  },

  locations(f) {
    return [
      sec('pageHeader', { eyebrow: 'Locations', title: 'Find us', lead: f.serviceArea ? `Serving ${f.serviceArea}.` : (where(f) ? `Serving ${where(f)}.` : '') }),
      ...(f.address ? [sec('map', { address: f.address })] : []),
      sec('contact', { title: 'Visit or call', phone: f.phone, email: f.email, address: f.address, hours: f.hours })
    ];
  },

  landing(f, ctx = {}) {
    const act = primaryAction(f);
    return [
      sec('hero', { eyebrow: f.name, title: ctx.title || 'A focused offer', lead: ctx.intro || 'Describe the offer in one or two sentences.', cta: { label: act.label, href: act.href }, image: f.photos[0], imageAlt: ctx.title || f.name }),
      sec('features', { title: 'Why choose this', items: [{ title: 'Benefit one', body: 'Explain the first benefit.' }, { title: 'Benefit two', body: 'Explain the second benefit.' }, { title: 'Benefit three', body: 'Explain the third benefit.' }] }, { options: { tone: 'surface' } }),
      ctaBlock(f, 'Take the next step')
    ];
  },

  standard(f, ctx = {}) {
    return [
      sec('pageHeader', { title: ctx.title || 'New page', lead: ctx.intro || '' }),
      sec('text', { paragraphs: [ctx.body || 'Write your content here. Click any text to edit it.', 'Add more paragraphs, or use “Add section” to bring in images, lists and calls to action.'] }),
      ctaBlock(f)
    ];
  },
  custom(f, ctx = {}) { return PAGE_TEMPLATES.standard(f, ctx); },
  blog(f, ctx = {}) { return PAGE_TEMPLATES.standard(f, { ...ctx, title: ctx.title || 'Resources' }); }
};

/** Layouts a customer can add as a new section, each with starter content. */
export const SECTION_TEMPLATES = {
  text: { label: 'Text', build: () => sec('text', { title: 'A new heading', paragraphs: ['Write something here. Click to edit.'] }) },
  split: { label: 'Text with image', build: f => sec('split', { title: 'A new heading', paragraphs: ['Describe this part of your business.'], image: f.photos[0], imageAlt: f.name }) },
  features: { label: 'Cards', build: () => sec('features', { title: 'A new heading', items: [{ title: 'First item', body: 'Describe it.' }, { title: 'Second item', body: 'Describe it.' }, { title: 'Third item', body: 'Describe it.' }] }) },
  list: { label: 'List with details', build: () => sec('list', { title: 'A new heading', items: [{ title: 'First item', meta: '', body: 'Describe it.' }, { title: 'Second item', meta: '', body: 'Describe it.' }] }) },
  steps: { label: 'Steps', build: () => sec('steps', { title: 'How it works', items: [{ title: 'First', body: 'What happens first.' }, { title: 'Next', body: 'What happens next.' }, { title: 'Done', body: 'How it finishes.' }] }) },
  faq: { label: 'Questions & answers', build: () => sec('faq', { title: 'Questions & answers', items: [{ q: 'A question', a: 'The answer.' }, { q: 'Another question', a: 'The answer.' }] }) },
  quotes: { label: 'Testimonials', build: f => sec('quotes', { title: 'What customers say', items: f.reviews.length ? f.reviews.slice(0, 3).map(r => ({ text: r.text, author: r.author || 'Customer' })) : [{ text: 'Paste a real customer review here.', author: 'Customer name' }] }) },
  gallery: { label: 'Gallery', build: f => sec('gallery', { title: 'Gallery', images: (f.photos.length ? f.photos.slice(0, 6) : []).map((src, i) => ({ src, alt: `${f.name} photo ${i + 1}` })) }) },
  cta: { label: 'Call to action', build: f => ctaBlock(f) },
  contact: { label: 'Contact form', build: f => sec('contact', { title: 'Get in touch', phone: f.phone, email: f.email, address: f.address, hours: f.hours }) },
  map: { label: 'Map', build: f => sec('map', { title: 'Find us', address: f.address || f.city || '' }) }
};

/** Build a full page object (sections included) from a template type. */
export function buildTemplatePage(type, facts, ctx = {}) {
  const fn = PAGE_TEMPLATES[type] || PAGE_TEMPLATES.standard;
  const sections = fn(facts, ctx).filter(Boolean);
  const defaults = {
    home: ['Home', ''], about: ['About', 'about'], services: [facts.menu && !facts.services.length ? 'Menu' : 'Services', 'services'], products: ['Products', 'products'],
    gallery: ['Gallery', 'gallery'], testimonials: ['Reviews', 'reviews'], faq: ['FAQ', 'faq'], contact: ['Contact', 'contact'],
    booking: ['Book', 'book'], locations: ['Locations', 'locations'], blog: ['Resources', 'resources']
  }[type] || [ctx.title || 'New page', slugify(ctx.title || 'new-page')];
  const title = ctx.title || defaults[0];
  return {
    id: ctx.id || sid('p'), slug: ctx.slug ?? (ctx.title && type !== 'home' ? slugify(ctx.title) : defaults[1]), title, navLabel: ctx.navLabel || title, type,
    status: ctx.status || 'published', inNav: ctx.inNav !== false, order: ctx.order ?? 99, purpose: ctx.purpose || '',
    seo: { title: '', description: ctx.description || '' }, css: '', sections
  };
}

/**
 * Rule-based sitemap proposal (demo mode, and the starting point shown to the
 * administrator before any model call). Only proposes pages there is real
 * material for — no empty pages to hit a count.
 */
export function proposeSitemap(f) {
  const want = new Set((f.requestedPages || []).map(p => p.toLowerCase()));
  const pages = [{ type: 'home', title: 'Home', slug: '', navLabel: 'Home', purpose: 'Who the business is, what it offers and the main action to take.' }];
  if (f.description || want.has('about us')) pages.push({ type: 'about', title: 'About', slug: 'about', navLabel: 'About', purpose: 'The story, people and values behind the business.' });
  if (f.services.length || f.menu || want.has('services') || want.has('menu')) {
    const menuOnly = f.menu && !f.services.length;
    pages.push({ type: 'services', title: menuOnly ? 'Menu' : 'Services', slug: menuOnly ? 'menu' : 'services', navLabel: menuOnly ? 'Menu' : 'Services', purpose: 'Every service or product, with enough detail to choose.' });
  }
  if (f.photos.length >= 4 || want.has('gallery')) pages.push({ type: 'gallery', title: 'Gallery', slug: 'gallery', navLabel: 'Gallery', purpose: 'Photos of the work, place or products.' });
  if (f.reviews.length >= 3 || want.has('reviews')) pages.push({ type: 'testimonials', title: 'Reviews', slug: 'reviews', navLabel: 'Reviews', purpose: 'Real customer feedback.' });
  if (want.has('faq')) pages.push({ type: 'faq', title: 'FAQ', slug: 'faq', navLabel: 'FAQ', purpose: 'Answers to common questions.' });
  if (want.has('locations')) pages.push({ type: 'locations', title: 'Locations', slug: 'locations', navLabel: 'Locations', purpose: 'Where to find the business and the areas served.' });
  pages.push({ type: 'contact', title: 'Contact', slug: 'contact', navLabel: 'Contact', purpose: 'Every way to reach the business, plus a contact form.' });
  let list = pages;
  if (f.desiredPageCount && list.length > f.desiredPageCount) {
    const keep = ['home', 'contact', 'services', 'about', 'gallery', 'testimonials', 'faq', 'locations'];
    list = [...list].sort((a, b) => keep.indexOf(a.type) - keep.indexOf(b.type)).slice(0, Math.max(1, f.desiredPageCount));
    list.sort((a, b) => pages.indexOf(a) - pages.indexOf(b));
  }
  return list.map((p, i) => ({ id: sid('p'), ...p, inNav: true, order: i, sections: [] }));
}
