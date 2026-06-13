// Demo-mode site generator — lets Jax walk the full pipeline before adding an
// Anthropic API key. Seed-driven so even demo sites differ from each other.
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PALETTES = [
  { bg: '#faf7f2', ink: '#1d1a16', accent: '#c2542b', soft: '#efe6d8' },
  { bg: '#101418', ink: '#f2efe9', accent: '#e8b34b', soft: '#1c2229' },
  { bg: '#f4f6f8', ink: '#16202b', accent: '#1f6f5c', soft: '#e2ebe7' },
  { bg: '#fffdf8', ink: '#232020', accent: '#4a5ad6', soft: '#eceefb' },
  { bg: '#171518', ink: '#f5f1ee', accent: '#d96aa0', soft: '#241f26' }
];

export function makeDemoSite(project) {
  const b = project.business;
  const seed = project.designSeed;
  const p = PALETTES[seed.seedNum % PALETTES.length];
  const services = (b.services || []).filter(Boolean);
  const reviews = (b.reviews || []).filter(r => r.text).slice(0, 3);
  const fonts = `${seed.type.head.replaceAll(' ', '+')}:wght@600;800&family=${seed.type.body.replaceAll(' ', '+')}:wght@400;600`;
  const phoneDigits = (b.phone || '').replace(/[^\d+]/g, '');

  const serviceCards = (services.length ? services : ['Quality service', 'Local expertise', 'Honest pricing']).slice(0, 6)
    .map((s, i) => `<div class="svc"><span class="num">0${i + 1}</span><h3>${esc(s)}</h3><p>Done right, every time — by a local team that cares.</p></div>`).join('');

  const reviewBlocks = (reviews.length ? reviews : [
    { text: 'Could not have asked for a better experience. Highly recommend to anyone local.', author: 'Local customer' },
    { text: 'Friendly, fast, and fair. This is why you shop local.', author: 'Local customer' }
  ]).map(r => `<blockquote><p>“${esc(r.text)}”</p><cite>— ${esc(r.author || 'Verified customer')}</cite></blockquote>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(b.name)} — ${esc(b.type)}${b.city ? ' in ' + esc(b.city) : ''}</title>
<meta name="description" content="${esc(b.name)} — ${esc(b.type)}${b.city ? ' serving ' + esc(b.city) : ''}. ${esc(b.description || '').slice(0, 120)}">
${b.logo ? '<link rel="icon" href="{{LOGO_SRC}}">' : ''}
<link href="https://fonts.googleapis.com/css2?family=${fonts}&display=swap" rel="stylesheet">
<style>
:root{--bg:${p.bg};--ink:${p.ink};--accent:${p.accent};--soft:${p.soft}}
*{box-sizing:border-box;margin:0}
body{font-family:'${seed.type.body}',sans-serif;background:var(--bg);color:var(--ink);line-height:1.6}
h1,h2,h3{font-family:'${seed.type.head}',serif;line-height:1.1}
header{display:flex;justify-content:space-between;align-items:center;padding:20px 6vw;position:sticky;top:0;background:var(--bg);z-index:10;border-bottom:1px solid var(--soft)}
.logo{font-family:'${seed.type.head}',serif;font-weight:800;font-size:20px}
nav a{margin-left:22px;color:var(--ink);text-decoration:none;font-size:14px;font-weight:600}
nav a:hover{color:var(--accent)}
.hero{padding:12vh 6vw 10vh;max-width:1100px}
.kicker{color:var(--accent);font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:13px}
.hero h1{font-size:clamp(40px,7vw,76px);margin:14px 0 18px}
.hero p{font-size:18px;max-width:560px;opacity:.85}
.cta{display:inline-block;margin-top:28px;background:var(--accent);color:var(--bg);padding:15px 32px;border-radius:999px;text-decoration:none;font-weight:700}
section{padding:9vh 6vw;max-width:1100px;margin:0 auto}
.band{background:var(--soft);max-width:none}
.band>div{max-width:1100px;margin:0 auto}
h2{font-size:clamp(28px,4vw,44px);margin-bottom:30px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}
.svc{background:var(--bg);border:1px solid var(--soft);border-radius:16px;padding:26px;position:relative}
.svc .num{font-family:'${seed.type.head}',serif;font-size:44px;opacity:.12;font-weight:800}
.svc h3{margin:8px 0 8px;font-size:19px}
blockquote{border-left:3px solid var(--accent);padding:6px 0 6px 20px;margin-bottom:22px;max-width:640px}
cite{font-style:normal;font-weight:700;font-size:13px;opacity:.7}
footer{padding:50px 6vw;border-top:1px solid var(--soft);display:flex;flex-wrap:wrap;gap:30px;justify-content:space-between;font-size:14px}
.callbar{display:none}
@media(max-width:700px){nav{display:none}
.callbar{display:flex;position:fixed;bottom:0;left:0;right:0;background:var(--accent);color:var(--bg);justify-content:center;padding:14px;font-weight:800;text-decoration:none;z-index:20}}
</style></head><body>
<header>${b.logo ? `<img class="logo" src="{{LOGO_SRC}}" alt="${esc(b.name)} logo" style="height:40px;width:auto">` : `<div class="logo">${esc(b.name)}</div>`}
<nav>${(project.questionnaire.pages || []).map(pg => `<a href="#${pg.toLowerCase().replace(/[^a-z]/g, '')}">${esc(pg)}</a>`).join('')}</nav></header>
<div class="hero"><div class="kicker">${esc(b.type)}${b.city ? ' · ' + esc(b.city) : ''}</div>
<h1>${esc(b.tagline || b.name)}</h1>
<p>${esc(b.description || `Proudly serving ${b.city || 'the neighborhood'} with quality you can count on.`)}</p>
${b.phone ? `<a class="cta" href="tel:${phoneDigits}">Call ${esc(b.phone)}</a>` : `<a class="cta" href="#contactus">Get in touch</a>`}</div>
<section id="services"><h2>What we do</h2><div class="grid">${serviceCards}</div></section>
<section class="band"><div id="aboutus"><h2>Why ${esc(b.city || 'locals')} choose us</h2>${reviewBlocks}</div></section>
<section id="contactus"><h2>Visit or call</h2>
<p>${b.address ? esc(b.address) + '<br>' : ''}${b.phone ? `<a href="tel:${phoneDigits}" style="color:var(--accent);font-weight:700">${esc(b.phone)}</a><br>` : ''}${esc(b.hours || '')}</p>
${b.address ? `<iframe title="map" src="https://www.google.com/maps?q=${encodeURIComponent(b.address)}&output=embed" style="width:100%;height:320px;border:0;border-radius:16px;margin-top:24px"></iframe>` : ''}</section>
<footer><div>© ${new Date().getFullYear()} ${esc(b.name)}</div><div>Site by Websites For Locals</div></footer>
${b.phone ? `<a class="callbar" href="tel:${phoneDigits}">📞 Call now</a>` : ''}
</body></html>`;
}
