// Neutral, brand.js-driven marketing homepage. A fresh clone looks fully branded
// out of the box (name, price, colors, logo, service areas, contact) with a
// working lead form — no hand-editing. Operators can later build a custom
// homepage in the studio and set it via Settings → Homepage preview slug.
import { brand } from './brand';

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TYPES = ['Restaurant / Café', 'Bar / Brewery', 'Bakery / Dessert Shop', 'Retail / Local Shop', 'Boutique / Clothing', 'Salon / Spa', 'Insurance Agency', "Doctor's Office / Medical", 'Dentist / Orthodontist', 'Law Firm', 'Accounting / Tax', 'Real Estate', 'HVAC', 'Roofing', 'Plumbing / Electrical', 'Landscaping', 'Auto Repair', 'Fitness / Gym', 'Other Local Business'];

export function defaultHomepageHtml() {
  const c = brand.colors;
  const areas = (brand.serviceAreas || []).map(a => `<span>${esc(a)}</span>`).join('');
  const opts = TYPES.map(t => `<option${t === 'Other Local Business' ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const features = [
    ['Custom design', 'A one-of-a-kind site built around your brand — never a template.'],
    ['Mobile friendly', 'Flawless on every phone, tablet, and desktop.'],
    ['Fast turnaround', 'Designed and online in days, not months.'],
    ['SEO ready', 'Built to be found on Google with clean local structure.'],
    ['Built to convert', 'Clear calls to action, click-to-call, and booking.'],
    ['Local & trusted', `Proudly serving ${esc(brand.region)}.`]
  ].map(([h, p]) => `<div class="feat"><div class="dot"></div><h3>${h}</h3><p>${p}</p></div>`).join('');
  const steps = [
    ['1', 'We build it', 'Tell us about your business — we design a full website for you, free.'],
    ['2', 'You preview it', 'We send a private link to your finished site, live and clickable.'],
    ['3', 'You approve it', `Love it? Approve and pay one flat ${esc(brand.priceLabel)}. Not before.`],
    ['4', 'We launch it', 'We point it to your domain and you go live.']
  ].map(([n, h, p]) => `<div class="step"><div class="n">${n}</div><h3>${h}</h3><p>${p}</p></div>`).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(brand.name)} — ${esc(brand.tagline)}</title>
<meta name="description" content="${esc(brand.name)} builds premium, mobile-friendly websites for local businesses across ${esc(brand.region)} — one flat price, ${esc(brand.priceLabel)}.">
<link rel="icon" href="${brand.logoPath}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--ink:#0b0d12;--panel:#12151d;--line:#232838;--muted:#9aa3bd;--text:#eef2fb;--blue:${c.blue};--cyan:${c.cyan};--pink:${c.pink};--yellow:${c.yellow};--grad:linear-gradient(100deg,${c.cyan},${c.pink})}
*{box-sizing:border-box;margin:0}body{font-family:'Inter',-apple-system,system-ui,sans-serif;background:var(--ink);color:var(--text);-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}h1,h2,h3{font-family:'Sora',sans-serif;line-height:1.05;letter-spacing:-.02em}
.bg{position:fixed;inset:0;z-index:-1;background:radial-gradient(1100px 600px at 82% -10%,${c.blue}22,transparent 60%),radial-gradient(900px 600px at 0 8%,${c.pink}1c,transparent 55%),var(--ink)}
.wrap{max-width:1140px;margin:0 auto;padding:0 22px}
header{position:sticky;top:0;z-index:20;background:rgba(11,13,18,.72);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.nav{display:flex;align-items:center;justify-content:space-between;padding:14px 0}
.logo{height:42px;width:auto;filter:drop-shadow(0 2px 10px ${c.blue}66)}
.btn{display:inline-flex;align-items:center;gap:8px;font-family:'Sora',sans-serif;font-weight:700;font-size:15px;padding:12px 22px;border-radius:11px;color:#04121f;background:var(--grad);box-shadow:0 8px 24px ${c.blue}40;transition:transform .15s}
.btn:hover{transform:translateY(-2px)}.btn.lg{font-size:18px;padding:16px 30px}.btn.ghost{background:rgba(255,255,255,.05);color:#fff;border:1px solid var(--line);box-shadow:none}
.hero{padding:90px 0 70px;text-align:center}
.eyebrow{font-family:'Sora',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.2em;font-size:12.5px;color:var(--cyan)}
.hero h1{font-size:clamp(38px,7vw,82px);font-weight:800;margin:16px 0 10px}
.price{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p.sub{color:var(--muted);font-size:clamp(16px,1.7vw,20px);max-width:620px;margin:14px auto 28px}
.cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.areas{margin:46px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:16px 0;text-align:center;color:var(--muted);font-family:'Sora',sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:.08em;font-size:13px}
.areas span{margin:0 12px;display:inline-block}
section{padding:72px 0}
.sec-head{text-align:center;margin-bottom:40px}.sec-head h2{font-size:clamp(28px,4vw,46px);font-weight:800}.sec-head .pink{color:var(--pink)}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.feat{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:24px}
.feat .dot{width:34px;height:34px;border-radius:9px;background:var(--grad);margin-bottom:14px}
.feat h3{font-size:19px;margin-bottom:6px}.feat p{color:var(--muted);font-size:14px}
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.step{text-align:center}.step .n{width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-family:'Sora',sans-serif;font-weight:800;font-size:22px;color:#04121f;background:var(--grad)}
.step h3{font-size:18px;margin-bottom:5px}.step p{color:var(--muted);font-size:13.5px}
.price-card{max-width:460px;margin:0 auto;background:var(--panel);border:1.5px solid transparent;background:linear-gradient(var(--panel),var(--panel)) padding-box,var(--grad) border-box;border-radius:22px;padding:38px;text-align:center}
.price-card .amt{font-family:'Sora',sans-serif;font-weight:800;font-size:clamp(54px,8vw,86px);margin:6px 0}
.price-card .amt span{font-size:.3em;color:var(--muted)}.price-card ul{list-style:none;text-align:left;margin:18px 0 24px;display:grid;gap:9px}
.price-card li{padding-left:26px;position:relative;font-size:15px}.price-card li::before{content:"✓";position:absolute;left:0;color:${c.cyan};font-weight:800}
.cta-band{background:linear-gradient(120deg,#0e1730,#1a0a1f);border:1px solid var(--line);border-radius:24px;padding:clamp(34px,5vw,60px);text-align:center}
.cta-band h2{font-size:clamp(28px,4.4vw,52px);font-weight:800;margin-bottom:10px}
.finp{width:100%;background:rgba(7,9,14,.7);border:1px solid var(--line);border-radius:11px;color:#fff;padding:13px 14px;font-size:15px;font-family:inherit;outline:none}
.finp:focus{border-color:var(--cyan)}.finp::placeholder{color:#6b7390}
#leadForm{max-width:560px;margin:24px auto 0;display:grid;gap:12px;text-align:left}#leadForm .two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
footer{border-top:1px solid var(--line);background:#0a0c11;padding:40px 0;color:var(--muted);font-size:14px;text-align:center}
footer .areas2{margin-top:8px;font-size:13px}
@media(max-width:820px){.grid{grid-template-columns:1fr}.steps{grid-template-columns:1fr 1fr}#leadForm .two{grid-template-columns:1fr}}
</style></head>
<body><div class="bg"></div>
<header><div class="wrap nav">
  <a href="/" aria-label="${esc(brand.name)}"><img class="logo" src="${brand.logoPath}" alt="${esc(brand.name)}"></a>
  <a class="btn" href="#start">Get my ${esc(brand.priceLabel)} site →</a>
</div></header>

<div class="wrap">
  <section class="hero">
    <div class="eyebrow">${esc(brand.name)}</div>
    <h1>${esc(brand.tagline)}<br>For only <span class="price">${esc(brand.priceLabel)}</span></h1>
    <p class="sub">We build a stunning, modern, mobile-friendly website for your local business <b style="color:#fff">before you ever pay a dime</b> — you only say yes once you see it live.</p>
    <div class="cta"><a class="btn lg" href="#start">Start my website →</a></div>
  </section>
</div>

<div class="areas"><div class="wrap">Proudly serving ${areas || esc(brand.region)}</div></div>

<div class="wrap">
  <section>
    <div class="sec-head"><div class="eyebrow">Everything included</div><h2>Built to <span class="pink">win you customers</span></h2></div>
    <div class="grid">${features}</div>
  </section>

  <section>
    <div class="sec-head"><div class="eyebrow">How it works</div><h2>Build first. <span class="pink">Pay after.</span></h2></div>
    <div class="steps">${steps}</div>
  </section>

  <section>
    <div class="sec-head"><div class="eyebrow">Simple pricing</div><h2>One price. <span class="pink">${esc(brand.priceLabel)}.</span> That's it.</h2></div>
    <div class="price-card">
      <div class="eyebrow">Your new website</div>
      <div class="amt">${esc(brand.priceLabel)}<span> one-time</span></div>
      <ul><li>Custom, conversion-focused design</li><li>Mobile, tablet &amp; desktop ready</li><li>SEO-ready &amp; built for Google</li><li>Contact form, click-to-call &amp; maps</li><li>Launched to your domain</li><li>You see it live before you pay</li></ul>
      <a class="btn lg" href="#start" style="width:100%;justify-content:center">Get started →</a>
    </div>
  </section>

  <section id="start">
    <div class="cta-band">
      <div class="eyebrow" style="color:var(--cyan)">Ready when you are</div>
      <h2>Let's build your website.</h2>
      <p style="color:#dfe6ff">Tell us about your business and we'll start building — you'll see it before you pay a thing.</p>
      <form id="leadForm">
        <div class="two"><input class="finp" name="name" required placeholder="Business name *"><select class="finp" name="type">${opts}</select></div>
        <div class="two"><input class="finp" name="email" type="email" required placeholder="Email *"><input class="finp" name="phone" placeholder="Phone"></div>
        <div class="two"><input class="finp" name="city" placeholder="City"><input class="finp" name="currentUrl" placeholder="Current website (if any)"></div>
        <textarea class="finp" name="notes" rows="3" placeholder="Tell us about your business…"></textarea>
        <button type="submit" class="btn lg" style="justify-content:center">Get my ${esc(brand.priceLabel)} site →</button>
      </form>
      <div id="leadOk" style="display:none;background:${c.cyan}1a;border:1px solid ${c.cyan}66;border-radius:14px;padding:24px;margin-top:22px">
        <h3 style="font-size:22px;margin-bottom:6px">Thanks — we're on it! 🎉</h3>
        <p style="color:#dfe6ff;margin:0">Check your inbox for a confirmation. We'll be in touch shortly with your live preview. No payment until you love it.</p>
      </div>
      <p style="margin-top:18px;color:var(--muted);font-size:13.5px">Prefer to talk? <a href="mailto:${brand.email}" style="color:var(--cyan)">${esc(brand.email)}</a> · <a href="tel:${brand.phoneTel}" style="color:var(--cyan)">${esc(brand.phone)}</a></p>
    </div>
  </section>
</div>

<footer><div class="wrap">
  <div>© <span id="yr"></span> ${esc(brand.name)} — ${esc(brand.tagline)}</div>
  <div class="areas2">Proudly serving ${esc(brand.region)} · <a href="/portfolio" style="color:var(--cyan)">See our work</a></div>
</div></footer>

<script>
  document.getElementById('yr').textContent=new Date().getFullYear();
  (function(){var f=document.getElementById('leadForm');if(!f)return;
   f.addEventListener('submit',function(e){e.preventDefault();var b=f.querySelector('button');b.disabled=true;b.textContent='Sending…';
     var data={};new FormData(f).forEach(function(v,k){data[k]=v});
     fetch('/api/lead',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)})
       .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})})
       .then(function(res){if(res.ok){f.style.display='none';document.getElementById('leadOk').style.display='block';}else{b.disabled=false;b.textContent='Get my ${esc(brand.priceLabel)} site →';alert(res.j.error||'Something went wrong');}})
       .catch(function(){b.disabled=false;b.textContent='Get my ${esc(brand.priceLabel)} site →';alert('Network error');});});
  })();
</script>
</body></html>`;
}
