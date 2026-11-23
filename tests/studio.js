// A scripted stand-in for the model: returns well-formed stage outputs so the
// real pipeline code (prompting, parsing, validation, ingestion) is exercised.
import { mockAnthropic } from './helpers';

const sys = body => (Array.isArray(body.system) ? body.system.map(b => b.text).join('\n') : String(body.system || ''));
const user = body => body.messages.map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');

export const DESIGN_CSS = `
.w-btn{border-radius:2px;text-transform:uppercase;letter-spacing:.08em;font-size:.82rem}
.w-btn--primary{background:var(--c-accent);color:var(--c-on-accent)}
.w-header{background:var(--c-bg);border-bottom:1px solid var(--c-border)}
.site-nav{display:flex;gap:28px;align-items:center}
.site-nav a{text-decoration:none}
.site-nav a.is-active{color:var(--c-accent)}
.w-card{border:1px solid var(--c-border);padding:28px}
.band{border-top:1px solid var(--c-text);padding-top:24px}
.lede-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:24px}
.lede-grid > .lede-main{grid-column:1 / 9}
.lede-grid > .lede-side{grid-column:9 / 13}
.rule-list{list-style:none;padding:0;margin:0}
.rule-list li{padding:18px 0;border-top:1px solid var(--c-border)}
.kicker{font-size:.75rem;letter-spacing:.2em;text-transform:uppercase;color:var(--c-accent)}
.foot-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:32px}
@media (max-width:860px){.lede-grid > *{grid-column:1 / -1}.site-nav{display:none}.is-open .site-nav{display:flex;flex-direction:column}}
` + Array.from({ length: 30 }, (_, i) => `.u-space-${i}{margin-top:${i * 4}px}`).join('\n');

export function designOutput({ header } = {}) {
  return `<w-json>
{"concept":"An editorial, rule-based system: ink on warm paper, one signal colour, numbered sections.",
 "system":{"typography":"Display serif over a plain grotesk","colour":"Accent only on actions","spacing":"8pt rhythm","layout":"12-column editorial grid","components":"Square buttons, ruled lists","imagery":"Framed photos","iconography":"1.5px line icons","motion":"Subtle rise","navigation":"Text links, sticky","footer":"Three columns","responsive":"Single column under 860px"},
 "tokens":{"colors":{"bg":"#f7f3ec","surface":"#ffffff","text":"#16130f","muted":"#5c554b","accent":"#b4421c","accent2":"#27413a","border":"#ddd5c7","onAccent":"#ffffff"},
           "fonts":{"head":"Fraunces","body":"Inter","headWeights":"400;600","bodyWeights":"400;500;600"},
           "radius":{"base":"2px","lg":"4px","btn":"2px"},"type":{"display":"clamp(2.8rem, 7vw, 5.6rem)","headWeight":"600"},"motion":"subtle"}}
</w-json>
<w-css>${DESIGN_CSS}</w-css>
<w-header class="site-header">
${header ?? `<div class="w-container w-header-in"><a class="w-brand" href="/"><span data-f="brand">Summit Ridge Roofing</span></a>
<button class="w-nav-toggle" type="button" data-nav-toggle aria-expanded="false" aria-label="Menu"><span></span></button>
<nav class="site-nav" aria-label="Main"><ul data-nav style="display:contents"><li><a data-nav-item href="/">Home</a></li></ul>
<a class="w-btn w-btn--primary" data-f="nav-cta" href="tel:4045550142">Call now</a></nav></div>`}
</w-header>
<w-footer>
<div class="w-container foot-grid"><p data-f="foot-name">Summit Ridge Roofing</p><nav class="w-footer-nav" data-nav><a data-nav-item href="/">Home</a></nav>
<p><a data-f="foot-phone" href="tel:4045550142">(404) 555-0142</a></p><p>© <span data-year></span> Summit Ridge Roofing</p></div>
</w-footer>
<w-patterns><div class="band"><p class="kicker">Label</p><h2 class="w-h2">Heading</h2></div></w-patterns>`;
}

export function pageOutput(title, { extra = '', sections = 3, slugLinks = ['/contact/'] } = {}) {
  const out = [];
  out.push(`<w-section type="hero" name="${title} intro" class="page-lede">
<div class="w-container lede-grid"><div class="lede-main"><p class="kicker" data-f="kicker">Dacula, GA</p><h1 class="w-display" data-f="title">${title} for Summit Ridge Roofing</h1>
<p class="w-lead" data-f="lead">Family-owned since 2009. Every job is led by an owner.</p>
<div class="w-actions"><a class="w-btn w-btn--primary" data-f="cta" href="${slugLinks[0]}">Get a free inspection</a></div></div>
<div class="lede-side"><img data-f="photo" src="https://img.example.test/a.jpg" alt="A finished roof"></div></div>
</w-section>`);
  for (let i = 1; i < sections; i++) {
    out.push(`<w-section type="${i === 1 ? 'services' : 'content'}" name="${title} block ${i}" class="band-section">
<div class="w-container band"><h2 class="w-h2" data-f="h-${i}">What we do, part ${i}</h2>
<ul class="rule-list"><li data-item><h3 class="w-h3" data-f="item-${i}-a">Roof repair</h3><p data-f="item-${i}-a-body">Leaks, storm damage and missing shingles fixed fast.</p></li>
<li data-item><h3 class="w-h3" data-f="item-${i}-b">Roof replacement</h3><p data-f="item-${i}-b-body">Full replacements for homes and businesses.</p></li></ul>${extra}</div>
</w-section>`);
  }
  out.push(`<w-css>.page-lede{padding-top:120px}</w-css>`);
  out.push(`<w-seo>{"title":"${title} | Summit Ridge Roofing, Dacula GA","description":"${title}: family-owned roofing in Dacula, GA. Repairs, replacements and free inspections from Summit Ridge Roofing."}</w-seo>`);
  return out.join('\n');
}

export const BRIEF_JSON = `<w-json>{"summary":"Summit Ridge Roofing is a family-owned roofer in Dacula, GA, founded in 2009.","positioning":"Owner-led jobs with photo proof.","audience":"Homeowners in Gwinnett County.","goals":["Generate inspection requests"],"primaryAction":{"label":"Get a free inspection","kind":"quote"},"secondaryActions":["Call"],"keyMessages":["Owner-led","Photo documentation"],"differentiators":["Owner on every job"],"tone":"Plain and confident","voiceGuidelines":["Short sentences"],"seoKeywords":["roofing dacula ga"],"contentInventory":{"services":true,"reviews":true,"photos":true,"story":true,"hours":true,"location":true},"cautions":["Do not claim awards"],"questionsForClient":["Licence number?"]}</w-json>`;

export const SITEMAP_JSON = `<w-json>{"rationale":"Four focused pages.","pages":[
 {"type":"home","title":"Home","navLabel":"Home","slug":"","inNav":true,"purpose":"Introduce the business","sections":[{"type":"hero","intent":"Who and what"},{"type":"services","intent":"Overview"},{"type":"cta","intent":"Inspection"}]},
 {"type":"services","title":"Roofing Services","navLabel":"Services","slug":"services","inNav":true,"purpose":"All services","sections":[{"type":"header","intent":"Intro"},{"type":"list","intent":"Each service"}]},
 {"type":"about","title":"About","navLabel":"About","slug":"about","inNav":true,"purpose":"The story","sections":[{"type":"header","intent":"Intro"},{"type":"story","intent":"History"}]},
 {"type":"contact","title":"Contact","navLabel":"Contact","slug":"contact","inNav":true,"purpose":"Get in touch","sections":[{"type":"header","intent":"Intro"},{"type":"form","intent":"Message form"}]}
]}</w-json>`;

/** Install a scripted model. `over` lets a test replace or break any stage. */
export function fakeStudio(over = {}) {
  const seen = { brief: 0, sitemap: 0, design: 0, page: 0, seo: 0, revise: 0, other: 0 };
  const api = mockAnthropic(async (body, n) => {
    if (body.models) return { data: [], has_more: false };
    const s = sys(body), u = user(body);
    let stage = 'other';
    if (s.includes('strategy lead')) stage = 'brief';
    else if (s.includes('information architect')) stage = 'sitemap';
    else if (s.includes('design director')) stage = 'design';
    else if (s.includes('search metadata')) stage = 'seo';
    else if (u.includes('CHANGE REQUEST') || u.includes('Rework ONE section')) stage = 'revise';
    else if (s.includes('senior designer-developer')) stage = 'page';
    seen[stage]++;
    if (over[stage]) { const r = await over[stage](body, seen[stage], { s, u }); if (r !== undefined) return r; }
    if (stage === 'brief') return BRIEF_JSON;
    if (stage === 'sitemap') return SITEMAP_JSON;
    if (stage === 'design') return designOutput();
    if (stage === 'seo') return `<w-json>{"pages":[]}</w-json>`;
    if (stage === 'page' || stage === 'revise') {
      const m = u.match(/Build the "([^"]+)" page/) || u.match(/Revise the "([^"]+)" page/);
      return pageOutput(m ? m[1] : 'Page');
    }
    return 'ok';
  });
  return { ...api, seen };
}
