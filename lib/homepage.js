// 499web.co marketing homepage, served at the site root by app/route.js.
export const HOMEPAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>499 Web Co. — Great Websites, Live Right Now. For Only $499.</title>
<meta name="description" content="499 Web Co. builds premium, mobile-friendly, SEO-ready websites for local businesses across Gwinnett County & Metro Atlanta — one flat price, just $499. Live right now.">
<meta property="og:title" content="499 Web Co. — Great Websites for $499">
<meta property="og:description" content="Premium local-business websites, built fast and live right now. One price: $499. Proudly serving Gwinnett County & Metro Atlanta.">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{
  --ink:#07080c; --ink-2:#0c0e15; --panel:#0f121b; --panel-2:#141826;
  --line:#222840; --muted:#9aa3bd; --text:#eaf0ff; --white:#ffffff;
  --blue:#1aa6ff; --cyan:#5fd8ff; --pink:#ff2e7e; --yellow:#ffd21a; --green:#4ade80;
  --grad:linear-gradient(100deg,var(--blue),var(--pink));
  --grad-3:linear-gradient(100deg,var(--cyan),var(--pink) 55%,var(--yellow));
  --radius:18px; --maxw:1200px;
  --speed-fast:.18s; --ease:cubic-bezier(.2,.7,.2,1);
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{
  background:var(--ink); color:var(--text);
  font-family:'Inter',-apple-system,system-ui,sans-serif; font-size:16px; line-height:1.6;
  -webkit-font-smoothing:antialiased; overflow-x:hidden;
}
a{color:inherit;text-decoration:none}
img{max-width:100%;display:block}
h1,h2,h3,.display{font-family:'Saira Condensed',sans-serif;line-height:.98;letter-spacing:-.01em;text-transform:uppercase}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 22px}
.section{padding:clamp(64px,9vw,130px) 0;position:relative}
.eyebrow{font-family:'Saira Condensed',sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:.22em;font-size:13px;color:var(--cyan)}
.lead{color:var(--muted);font-size:clamp(16px,1.6vw,19px);max-width:60ch}
.center{text-align:center}.center .lead{margin-inline:auto}

/* ---------- background atmosphere ---------- */
.bg-grid{position:fixed;inset:0;z-index:-3;background:
  radial-gradient(1200px 700px at 80% -10%, rgba(26,166,255,.18), transparent 60%),
  radial-gradient(1000px 700px at 0% 10%, rgba(255,46,126,.14), transparent 55%),
  var(--ink);}
.bg-grid::after{content:"";position:absolute;inset:0;opacity:.5;
  background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);
  background-size:54px 54px;mask-image:radial-gradient(circle at 50% 0,#000,transparent 75%)}
.noise{position:fixed;inset:0;z-index:-2;pointer-events:none;opacity:.04;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}

/* ---------- 499 logo (pure CSS/SVG) ---------- */
.logo{display:inline-flex;flex-direction:column;align-items:flex-start;gap:3px;transform:skewX(-8deg);line-height:1;user-select:none}
.logo .num{position:relative;font-family:'Saira Condensed',sans-serif;font-weight:900;font-size:var(--logo-size,30px);font-style:italic;
  color:#fff;-webkit-text-stroke:1.5px rgba(26,166,255,.0);
  text-shadow:-1px -1px 0 #cfe9ff, 0 2px 0 #7fb6e6, 0 3px 6px rgba(26,166,255,.55), 0 0 18px rgba(26,166,255,.35);
  letter-spacing:.02em}
.logo .num::before{content:"";position:absolute;left:-26px;top:14%;width:22px;height:62%;
  background:repeating-linear-gradient(0deg,var(--cyan) 0 3px,transparent 3px 7px);
  -webkit-mask:linear-gradient(90deg,transparent,#000);mask:linear-gradient(90deg,transparent,#000);opacity:.9}
.logo .bar{display:inline-flex;align-items:center;gap:6px;background:var(--yellow);color:#0a0a0a;
  font-family:'Saira Condensed',sans-serif;font-weight:800;font-size:calc(var(--logo-size,30px)*.34);letter-spacing:.12em;
  padding:2px 9px;border-radius:3px;box-shadow:0 0 14px rgba(255,210,26,.35)}
.logo .flag{width:16px;height:11px;background:
  conic-gradient(#111 25%,#fff 0 50%,#111 0 75%,#fff 0) ; background-size:5px 5px;border-radius:2px}
.logo.big{--logo-size:64px}
.brand{display:inline-flex;align-items:center}
.brand-logo{height:46px;aspect-ratio:560/246;background:url(/brand/logo.png) left center/contain no-repeat;filter:drop-shadow(0 2px 10px rgba(26,166,255,.35))}
.hero-img{width:100%;max-width:430px;border-radius:20px;border:1px solid var(--line);
  box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 60px rgba(26,166,255,.18);animation:floaty 6s ease-in-out infinite}

/* ---------- buttons ---------- */
.btn{--c:var(--blue);display:inline-flex;align-items:center;gap:9px;font-family:'Saira Condensed',sans-serif;font-weight:800;
  text-transform:uppercase;letter-spacing:.04em;font-size:16px;padding:14px 26px;border-radius:12px;cursor:pointer;border:0;
  transition:transform var(--speed-fast) var(--ease),box-shadow .25s var(--ease),filter .2s;position:relative;white-space:nowrap}
.btn.primary{color:#04121f;background:var(--grad-3);box-shadow:0 8px 24px rgba(26,166,255,.35),0 0 0 1px rgba(255,255,255,.06) inset}
.btn.primary:hover{transform:translateY(-2px);box-shadow:0 14px 40px rgba(255,46,126,.45)}
.btn.ghost{color:#fff;background:rgba(255,255,255,.04);border:1px solid var(--line)}
.btn.ghost:hover{border-color:var(--cyan);transform:translateY(-2px);box-shadow:0 0 26px rgba(95,216,255,.25)}
.btn.lg{font-size:19px;padding:17px 34px}
.btn .arrow{transition:transform var(--speed-fast)}
.btn:hover .arrow{transform:translateX(4px)}

/* ---------- announcement + nav ---------- */
.topbar{background:linear-gradient(90deg,var(--blue),var(--pink));color:#fff;text-align:center;font-family:'Saira Condensed',sans-serif;
  font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:13px;padding:8px 14px;position:relative;overflow:hidden}
.topbar span{position:relative;z-index:1}
header{position:sticky;top:0;z-index:50;transition:background .3s,backdrop-filter .3s,border-color .3s;border-bottom:1px solid transparent}
header.scrolled{background:rgba(7,8,12,.78);backdrop-filter:blur(14px);border-bottom-color:var(--line)}
.nav{display:flex;align-items:center;justify-content:space-between;padding:16px 0}
.nav-links{display:flex;gap:30px;align-items:center}
.nav-links a{font-family:'Saira Condensed',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:15px;color:var(--muted);transition:color .2s}
.nav-links a:hover{color:#fff}
.nav-cta{display:flex;align-items:center;gap:14px}
.burger{display:none;background:none;border:1px solid var(--line);border-radius:10px;width:44px;height:42px;cursor:pointer;flex-direction:column;gap:5px;align-items:center;justify-content:center}
.burger span{width:20px;height:2px;background:#fff;transition:.25s}

/* ---------- hero ---------- */
.hero{position:relative;padding:clamp(56px,8vw,96px) 0 clamp(60px,9vw,120px);overflow:hidden}
.speedlines{position:absolute;inset:0;z-index:-1;overflow:hidden;opacity:.5}
.speedlines i{position:absolute;height:2px;left:-40%;width:40%;border-radius:2px;
  background:linear-gradient(90deg,transparent,var(--cyan));animation:zoom linear infinite}
.speedlines i:nth-child(2){background:linear-gradient(90deg,transparent,var(--pink))}
.speedlines i:nth-child(4){background:linear-gradient(90deg,transparent,var(--yellow))}
@keyframes zoom{from{transform:translateX(0)}to{transform:translateX(360%)}}
.hero-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:40px;align-items:center}
.shield{display:inline-flex;align-items:center;gap:9px;border:1.5px solid rgba(95,216,255,.5);border-radius:999px;padding:7px 16px;
  font-family:'Saira Condensed',sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:.18em;font-size:12px;color:var(--cyan);
  background:rgba(26,166,255,.07);box-shadow:0 0 22px rgba(26,166,255,.18) inset}
.shield .dot{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 10px var(--green);animation:pulse 1.6s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
.hero h1{font-weight:900;font-size:clamp(46px,8vw,104px);margin:20px 0 6px}
.hero h1 .stroke{color:transparent;-webkit-text-stroke:2px var(--white);text-stroke:2px var(--white)}
.hero h1 .pink{color:var(--pink);text-shadow:0 0 30px rgba(255,46,126,.5)}
.price-pop{font-weight:900;font-size:clamp(58px,11vw,150px);display:inline-block;
  background:var(--grad-3);-webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 6px 30px rgba(26,166,255,.4));transform:skewX(-6deg)}
.hero .lead{margin:18px 0 30px}
.hero-cta{display:flex;gap:14px;flex-wrap:wrap}
.hero-stats{display:flex;gap:26px;margin-top:34px;flex-wrap:wrap}
.hero-stats .s{display:flex;flex-direction:column}
.hero-stats .s b{font-family:'Saira Condensed',sans-serif;font-weight:900;font-size:30px;color:#fff;line-height:1}
.hero-stats .s span{font-size:12.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-top:3px}

/* hero visual: neon route shield + browser mockup */
.hero-art{position:relative;display:flex;justify-content:center;align-items:center;min-height:340px}
.route-shield{position:absolute;top:-6px;right:6px;z-index:3;width:150px;aspect-ratio:1/1.15;
  background:radial-gradient(circle at 50% 35%,rgba(26,166,255,.18),transparent 70%);
  border:2px solid var(--cyan);border-radius:26px 26px 40px 40px/22px 22px 60px 60px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
  box-shadow:0 0 30px rgba(26,166,255,.5),0 0 60px rgba(255,46,126,.25);animation:floaty 5s ease-in-out infinite}
.route-shield .r{font-family:'Saira Condensed',sans-serif;font-weight:800;letter-spacing:.2em;font-size:13px;color:var(--cyan);text-shadow:0 0 10px var(--cyan)}
.route-shield .n{font-family:'Saira Condensed',sans-serif;font-weight:900;font-style:italic;font-size:46px;color:var(--pink);text-shadow:0 0 18px rgba(255,46,126,.7)}
@keyframes floaty{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-12px) rotate(-2deg)}}
.mock{width:100%;max-width:430px;background:var(--panel-2);border:1px solid var(--line);border-radius:16px;overflow:hidden;
  box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.03) inset;transform:perspective(1200px) rotateY(-9deg) rotateX(3deg)}
.mock .bar{display:flex;gap:6px;padding:11px 14px;background:#0a0c12;border-bottom:1px solid var(--line)}
.mock .bar i{width:10px;height:10px;border-radius:50%;background:#333a52}
.mock .bar i:first-child{background:var(--pink)}.mock .bar i:nth-child(2){background:var(--yellow)}.mock .bar i:nth-child(3){background:var(--green)}
.mock .screen{padding:18px;display:flex;flex-direction:column;gap:12px}
.mock .hbar{height:52px;border-radius:10px;background:var(--grad-3);opacity:.9}
.mock .ln{height:11px;border-radius:6px;background:#222a40}
.mock .ln.s{width:60%}.mock .ln.m{width:85%}
.mock .row{display:flex;gap:10px}.mock .row>div{flex:1;height:54px;border-radius:10px;background:#1a2236;border:1px solid var(--line)}

/* ---------- marquee ---------- */
.marquee{border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:rgba(255,255,255,.02);padding:16px 0;overflow:hidden;display:flex;gap:0}
.marquee .track{display:flex;gap:42px;white-space:nowrap;animation:scrollx 28s linear infinite;padding-right:42px}
.marquee .track span{font-family:'Saira Condensed',sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:.12em;font-size:18px;color:var(--muted);display:inline-flex;align-items:center;gap:42px}
.marquee .track span::after{content:"";width:14px;height:14px;background:conic-gradient(#fff 25%,var(--ink) 0 50%,#fff 0 75%,var(--ink) 0);background-size:7px 7px;border-radius:2px;opacity:.6}
@keyframes scrollx{to{transform:translateX(-50%)}}

/* ---------- feature badges ---------- */
.grid-badges{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.badge-card{background:linear-gradient(180deg,var(--panel),var(--ink-2));border:1px solid var(--line);border-radius:var(--radius);
  padding:24px 22px;position:relative;overflow:hidden;transition:transform .3s var(--ease),border-color .3s,box-shadow .3s}
.badge-card::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;background:var(--grad);opacity:0;transition:opacity .3s;
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.badge-card:hover{transform:translateY(-6px);box-shadow:0 22px 50px rgba(0,0,0,.5)}
.badge-card:hover::before{opacity:1}
.badge-ic{width:50px;height:50px;border-radius:13px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;
  background:rgba(26,166,255,.1);border:1px solid rgba(95,216,255,.3);color:var(--cyan)}
.badge-card:nth-child(3n) .badge-ic{background:rgba(255,46,126,.1);border-color:rgba(255,46,126,.35);color:var(--pink)}
.badge-card:nth-child(3n+1) .badge-ic{background:rgba(255,210,26,.1);border-color:rgba(255,210,26,.35);color:var(--yellow)}
.badge-card h3{font-size:21px;font-weight:800;color:#fff;margin-bottom:7px}
.badge-card p{font-size:14px;color:var(--muted);line-height:1.5}
.badge-ic svg{width:26px;height:26px}

/* ---------- how it works ---------- */
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;position:relative;margin-top:48px}
.steps::before{content:"";position:absolute;top:32px;left:6%;right:6%;height:3px;border-radius:3px;
  background:repeating-linear-gradient(90deg,var(--line) 0 12px,transparent 12px 22px)}
.step{position:relative;text-align:center;padding:0 8px}
.step .n{width:66px;height:66px;margin:0 auto 18px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-family:'Saira Condensed',sans-serif;font-weight:900;font-size:28px;color:#04121f;background:var(--grad-3);position:relative;z-index:1;
  box-shadow:0 0 26px rgba(26,166,255,.4)}
.step h3{font-size:20px;color:#fff;margin-bottom:6px}
.step p{font-size:14px;color:var(--muted)}

/* ---------- pricing ---------- */
.pricing{display:grid;grid-template-columns:1.4fr 1fr;gap:22px;align-items:stretch}
.price-card{position:relative;background:linear-gradient(180deg,var(--panel-2),var(--ink-2));border:1px solid var(--line);border-radius:24px;padding:40px;overflow:hidden}
.price-card.feature{border:1.5px solid transparent;background:
  linear-gradient(var(--ink-2),var(--ink-2)) padding-box,var(--grad-3) border-box;box-shadow:0 0 50px rgba(26,166,255,.2)}
.price-card .tag{position:absolute;top:20px;right:-42px;transform:rotate(45deg);background:var(--pink);color:#fff;
  font-family:'Saira Condensed',sans-serif;font-weight:800;letter-spacing:.1em;font-size:12px;padding:7px 54px;text-transform:uppercase}
.price-card .plan{font-family:'Saira Condensed',sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--cyan);font-size:15px}
.price-card .amt{font-family:'Saira Condensed',sans-serif;font-weight:900;font-size:clamp(64px,9vw,104px);line-height:1;margin:8px 0 4px;color:#fff}
.price-card .amt sup{font-size:.4em;vertical-align:super;color:var(--muted)}
.price-card .amt .per{font-size:.22em;color:var(--muted);letter-spacing:.05em}
.price-card .sub{color:var(--muted);margin-bottom:22px}
.checks{list-style:none;display:flex;flex-direction:column;gap:12px;margin:22px 0 28px}
.checks li{display:flex;gap:11px;align-items:flex-start;font-size:15.5px}
.checks li svg{flex:none;width:20px;height:20px;color:var(--green);margin-top:2px}
.price-card.alt .amt{font-size:clamp(46px,6vw,64px)}

/* ---------- showcase ---------- */
.showcase{background:linear-gradient(180deg,transparent,rgba(26,166,255,.05),transparent)}
.show-cta{background:linear-gradient(120deg,var(--panel-2),var(--ink-2));border:1px solid var(--line);border-radius:24px;
  padding:clamp(34px,5vw,60px);display:flex;align-items:center;justify-content:space-between;gap:30px;flex-wrap:wrap;position:relative;overflow:hidden}
.show-cta::after{content:"";position:absolute;right:-60px;top:-60px;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(255,46,126,.25),transparent 65%)}

/* ---------- crew ---------- */
.crew{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center}
.crew-photo{aspect-ratio:4/3;border-radius:20px;border:1px solid var(--line);position:relative;overflow:hidden;
  background:
    radial-gradient(circle at 30% 30%,rgba(26,166,255,.3),transparent 50%),
    radial-gradient(circle at 75% 70%,rgba(255,46,126,.3),transparent 50%),
    repeating-linear-gradient(135deg,rgba(255,255,255,.03) 0 14px,transparent 14px 28px),var(--panel-2);
  display:flex;align-items:center;justify-content:center}
.crew-photo .ph{font-family:'Saira Condensed',sans-serif;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;font-size:13px;text-align:center;padding:20px;opacity:.7}
.crew-emoji{font-size:54px;letter-spacing:6px}

/* ---------- FAQ ---------- */
.faq{max-width:820px;margin:40px auto 0}
.q{border:1px solid var(--line);border-radius:14px;margin-bottom:12px;overflow:hidden;background:var(--panel)}
.q summary{list-style:none;cursor:pointer;padding:20px 22px;font-family:'Saira Condensed',sans-serif;font-weight:700;font-size:19px;color:#fff;
  display:flex;justify-content:space-between;align-items:center;gap:16px}
.q summary::-webkit-details-marker{display:none}
.q summary .pl{width:26px;height:26px;flex:none;position:relative;transition:transform .3s}
.q summary .pl::before,.q summary .pl::after{content:"";position:absolute;background:var(--cyan);border-radius:2px}
.q summary .pl::before{top:12px;left:4px;right:4px;height:2px}
.q summary .pl::after{left:12px;top:4px;bottom:4px;width:2px;transition:opacity .3s}
.q[open] summary .pl::after{opacity:0}
.q .a{padding:0 22px 20px;color:var(--muted);font-size:15.5px}

/* ---------- final CTA ---------- */
.cta-band{position:relative;border-radius:28px;overflow:hidden;padding:clamp(44px,6vw,84px);text-align:center;
  background:linear-gradient(120deg,#0b1730,#1a0a1f);border:1px solid var(--line)}
.cta-band::before{content:"";position:absolute;inset:0;background:
  radial-gradient(600px 300px at 20% 0,rgba(26,166,255,.35),transparent 60%),
  radial-gradient(600px 300px at 80% 100%,rgba(255,46,126,.3),transparent 60%)}
.cta-band>*{position:relative;z-index:1}
.cta-band h2{font-size:clamp(34px,5.5vw,68px);font-weight:900;color:#fff;margin-bottom:16px}

/* ---------- footer ---------- */
footer{border-top:1px solid var(--line);padding:56px 0 30px;background:var(--ink-2)}
.foot-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr 1.2fr;gap:30px}
.foot-grid h4{font-family:'Saira Condensed',sans-serif;text-transform:uppercase;letter-spacing:.1em;font-size:14px;color:#fff;margin-bottom:14px}
.foot-grid a,.foot-grid p{color:var(--muted);font-size:14.5px;display:block;margin-bottom:9px;transition:color .2s}
.foot-grid a:hover{color:var(--cyan)}
.foot-bottom{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-top:40px;padding-top:22px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
.ga{display:inline-flex;align-items:center;gap:7px;color:var(--cyan);font-family:'Saira Condensed',sans-serif;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:13px}

/* ---------- reveal animation ---------- */
.reveal{opacity:0;transform:translateY(26px);transition:opacity .7s var(--ease),transform .7s var(--ease)}
.reveal.in{opacity:1;transform:none}
.section-head{margin-bottom:14px}
.section-head h2{font-size:clamp(32px,4.6vw,58px);font-weight:900;color:#fff}
.section-head .pink{color:var(--pink)}

/* ---------- responsive ---------- */
@media(max-width:980px){
  .hero-grid{grid-template-columns:1fr;gap:30px}
  .hero-art{min-height:300px;margin-top:10px}
  .pricing{grid-template-columns:1fr}
  .crew{grid-template-columns:1fr}
  .grid-badges{grid-template-columns:repeat(2,1fr)}
  .steps{grid-template-columns:repeat(2,1fr);gap:30px}
  .steps::before{display:none}
  .foot-grid{grid-template-columns:1fr 1fr}
}
@media(max-width:760px){
  .nav-links{display:none}
  .nav-links.open{display:flex;position:absolute;top:100%;left:0;right:0;flex-direction:column;gap:0;background:rgba(7,8,12,.97);
    backdrop-filter:blur(14px);border-bottom:1px solid var(--line);padding:10px 22px 18px}
  .nav-links.open a{padding:13px 0;border-bottom:1px solid var(--line);width:100%}
  .burger{display:flex}
  .nav-cta .btn:not(.burger){display:none}
  .grid-badges{grid-template-columns:1fr}
  .foot-grid{grid-template-columns:1fr}
  .show-cta{flex-direction:column;text-align:center}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.reveal{opacity:1;transform:none}}
</style>
</head>
<body>
<div class="bg-grid"></div><div class="noise"></div>

<div class="topbar"><span>🏁 Great websites, live right now — for one flat price of just $499</span></div>

<header id="hdr">
  <div class="wrap nav">
    <a href="#top" class="brand" aria-label="499 Web Co."><span class="brand-logo" role="img" aria-label="499 Web Co."></span></a>
    <nav class="nav-links" id="navlinks">
      <a href="#how">How it works</a>
      <a href="#features">What you get</a>
      <a href="#pricing">Pricing</a>
      <a href="#work">Our work</a>
      <a href="#faq">FAQ</a>
    </nav>
    <div class="nav-cta">
      <a href="#contact" class="btn primary">Get my $499 site <span class="arrow">→</span></a>
      <button class="burger" id="burger" aria-label="Menu"><span></span><span></span><span></span></button>
    </div>
  </div>
</header>

<main id="top">
<!-- HERO -->
<section class="hero">
  <div class="speedlines" aria-hidden="true"></div>
  <div class="wrap hero-grid">
    <div>
      <span class="shield"><span class="dot"></span> Route 499 · Built in Georgia</span>
      <h1>Great websites.<br><span class="pink">Live right now.</span></h1>
      <div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap">
        <span class="display" style="font-size:clamp(26px,4vw,46px);color:#fff;font-weight:800">For only</span>
        <span class="price-pop">$499</span>
      </div>
      <p class="lead">We build a stunning, modern, mobile-friendly website for your local business <b style="color:#fff">before you ever pay a dime</b> — you only say yes once you see it live. One flat price. No subscriptions to get started, no surprises.</p>
      <div class="hero-cta">
        <a href="#contact" class="btn primary lg">Start my website <span class="arrow">→</span></a>
        <a href="#work" class="btn ghost lg">See our work</a>
      </div>
      <div class="hero-stats">
        <div class="s"><b data-count="499" data-prefix="$">$499</b><span>One flat price</span></div>
        <div class="s"><b data-count="72" data-suffix="hr">72hr</b><span>Typical turnaround</span></div>
        <div class="s"><b data-count="100" data-suffix="%">100%</b><span>Built before you buy</span></div>
      </div>
    </div>
    <div class="hero-art">
      <img src="/brand/jax.jpg" alt="Built to impress, designed to convert — 499 Web Co." class="hero-img">
    </div>
  </div>
</section>

<!-- SERVICE AREA MARQUEE -->
<div class="marquee" aria-label="Service areas">
  <div class="track" id="track">
    <span>Gwinnett County</span><span>Dacula</span><span>Buford</span><span>Auburn</span><span>Braselton</span><span>Lawrenceville</span><span>Suwanee</span><span>Flowery Branch</span><span>Metro Atlanta</span>
  </div>
</div>

<!-- FEATURES / BADGES -->
<section class="section" id="features">
  <div class="wrap">
    <div class="section-head center reveal">
      <span class="eyebrow">Everything included</span>
      <h2>Built to <span class="pink">win you customers</span></h2>
      <p class="lead">Every $499 site ships with all of this — no upsells, no add-on menu.</p>
    </div>
    <div class="grid-badges" style="margin-top:46px">
      <div class="badge-card reveal"><div class="badge-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg></div><h3>Custom Website Design</h3><p>A one-of-a-kind design built around your brand — never a cookie-cutter template.</p></div>
      <div class="badge-card reveal"><div class="badge-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10.5 18h3"/></svg></div><h3>Mobile Friendly</h3><p>Looks flawless on every phone, tablet, and desktop. Most of your customers are on mobile.</p></div>
      <div class="badge-card reveal"><div class="badge-ic"><svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg></div><h3>Fast Turnaround</h3><p>Live right now — most sites are designed and online within days, not months.</p></div>
      <div class="badge-card reveal"><div class="badge-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M8 12l2-2 1.6 1.5L15 9"/></svg></div><h3>SEO Ready</h3><p>Built to be found on Google with clean, local-search-friendly structure baked in.</p></div>
      <div class="badge-card reveal"><div class="badge-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/></svg></div><h3>Built to Convert</h3><p>Clear calls to action, click-to-call, and booking — designed to turn visitors into customers.</p></div>
      <div class="badge-card reveal"><div class="badge-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg></div><h3>Local &amp; Trusted</h3><p>Gwinnett County based. We know the area and the customers you're trying to reach.</p></div>
      <div class="badge-card reveal"><div class="badge-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/></svg></div><h3>Small Business Focused</h3><p>Built for restaurants, shops, and local services — the businesses that make the area great.</p></div>
      <div class="badge-card reveal"><div class="badge-ic"><svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3l2.7 5.5 6 .9-4.35 4.2 1.03 6L12 16.9 6.62 19.6l1.03-6L3.3 9.4l6-.9z"/></svg></div><h3>Built in Georgia</h3><p>Proudly local, proudly hands-on. Real people you can actually reach.</p></div>
    </div>
  </div>
</section>

<!-- HOW IT WORKS -->
<section class="section" id="how" style="background:linear-gradient(180deg,transparent,rgba(255,46,126,.04),transparent)">
  <div class="wrap">
    <div class="section-head center reveal">
      <span class="eyebrow">Your pit stop to a new site</span>
      <h2>How it <span class="pink">works</span></h2>
      <p class="lead">We flip the script: we build first, you decide after. Zero risk.</p>
    </div>
    <div class="steps">
      <div class="step reveal"><div class="n">1</div><h3>We build it</h3><p>Tell us about your business. We design a full, modern website for you — on the house.</p></div>
      <div class="step reveal"><div class="n">2</div><h3>You preview it</h3><p>We send you a private link to your finished site, live and clickable. No mockups — the real thing.</p></div>
      <div class="step reveal"><div class="n">3</div><h3>You love it</h3><p>Want tweaks? We refine it with you until it's exactly right. Only then do we talk price — $499.</p></div>
      <div class="step reveal"><div class="n">4</div><h3>We launch it</h3><p>We point it to your domain and you're live. Optional $99/mo keeps it fresh and maintained.</p></div>
    </div>
  </div>
</section>

<!-- PRICING -->
<section class="section" id="pricing">
  <div class="wrap">
    <div class="section-head center reveal">
      <span class="eyebrow">Simple, honest pricing</span>
      <h2>One price. <span class="pink">$499.</span> That's it.</h2>
      <p class="lead">No tiers, no hidden fees, no "starting at." The whole site, one flat price.</p>
    </div>
    <div class="pricing" style="margin-top:44px">
      <div class="price-card feature reveal">
        <div class="tag">Most popular</div>
        <div class="plan">The 499 Website</div>
        <div class="amt"><sup>$</sup>499<span class="per"> one-time</span></div>
        <div class="sub">A complete, custom, modern website — built before you pay.</div>
        <ul class="checks">
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.4 2.4 4.6-4.8"/></svg> Custom, conversion-focused design</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.4 2.4 4.6-4.8"/></svg> Mobile, tablet &amp; desktop ready</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.4 2.4 4.6-4.8"/></svg> SEO-ready & built for Google</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.4 2.4 4.6-4.8"/></svg> Click-to-call, maps, contact form &amp; reviews</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.4 2.4 4.6-4.8"/></svg> Connected to your domain &amp; launched for you</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.4 2.4 4.6-4.8"/></svg> You see it live before you pay a cent</li>
        </ul>
        <a href="#contact" class="btn primary lg" style="width:100%;justify-content:center">Get my $499 site <span class="arrow">→</span></a>
      </div>
      <div class="price-card alt reveal">
        <div class="plan">Growth Plan</div>
        <div class="amt"><sup>$</sup>99<span class="per">/mo</span></div>
        <div class="sub">Optional. Keep your site fresh, updated &amp; handled.</div>
        <ul class="checks">
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.4 2.4 4.6-4.8"/></svg> Monthly content &amp; photo updates</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.4 2.4 4.6-4.8"/></svg> New services, specials &amp; testimonials</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.4 2.4 4.6-4.8"/></svg> Hosting, security &amp; backups</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.4 2.4 4.6-4.8"/></svg> Priority support from a real local team</li>
        </ul>
        <a href="#contact" class="btn ghost lg" style="width:100%;justify-content:center">Add Growth</a>
      </div>
    </div>
  </div>
</section>

<!-- SHOWCASE / OUR WORK -->
<section class="section showcase" id="work">
  <div class="wrap">
    <div class="show-cta reveal">
      <div>
        <span class="eyebrow">Our work</span>
        <h2 style="font-size:clamp(30px,4vw,52px);font-weight:900;color:#fff;margin:10px 0 12px">See real sites we've built — <span style="color:var(--cyan)">live</span>.</h2>
        <p class="lead">Browse our portfolio of modern local-business websites. Every one is a real, live site you can click through.</p>
      </div>
      <a href="/portfolio" class="btn primary lg">View the portfolio <span class="arrow">→</span></a>
    </div>
  </div>
</section>

<!-- CREW -->
<section class="section" id="crew">
  <div class="wrap crew">
    <div class="reveal">
      <span class="eyebrow">Meet the crew</span>
      <h2 style="font-size:clamp(30px,4.4vw,54px);font-weight:900;color:#fff;margin:10px 0 14px">The 499 Crew has <span class="pink">your back</span></h2>
      <p class="lead">We're a small, local team obsessed with making neighborhood businesses look incredible online. No call centers, no overseas handoffs — just real people in Georgia who pick up the phone and build great websites, fast.</p>
      <div class="hero-cta" style="margin-top:24px">
        <a href="#contact" class="btn primary">Work with us <span class="arrow">→</span></a>
      </div>
    </div>
    <div class="crew-photo reveal" style="padding:0">
      <img src="/brand/crew.jpg" alt="The 499 Crew" style="width:100%;height:100%;object-fit:cover">
    </div>
  </div>
</section>

<!-- FAQ -->
<section class="section" id="faq" style="background:linear-gradient(180deg,transparent,rgba(26,166,255,.04),transparent)">
  <div class="wrap">
    <div class="section-head center reveal">
      <span class="eyebrow">Good questions</span>
      <h2>Frequently <span class="pink">asked</span></h2>
    </div>
    <div class="faq">
      <details class="q reveal"><summary>Do I really see the site before I pay? <span class="pl"></span></summary><div class="a">Yes. We build your full website first and send you a private live link. You only pay the $499 once you've seen it and you're happy. There's zero risk to you.</div></details>
      <details class="q reveal"><summary>What does the $499 actually include? <span class="pl"></span></summary><div class="a">A complete custom website: design, mobile optimization, SEO-ready structure, contact form, click-to-call, maps, reviews, and launch to your domain. It's a one-time flat price — not "starting at."</div></details>
      <details class="q reveal"><summary>How fast can my site be live? <span class="pl"></span></summary><div class="a">Most sites are designed and previewable within a few days. Once you approve it, launch to your domain usually happens within 24–48 hours.</div></details>
      <details class="q reveal"><summary>Do I need to provide content and photos? <span class="pl"></span></summary><div class="a">It helps, but it's not required. Share what you have and we'll craft the rest with professional copy and on-brand visuals. You can swap in real photos anytime.</div></details>
      <details class="q reveal"><summary>What's the $99/month for? <span class="pl"></span></summary><div class="a">It's optional. The Growth Plan keeps your site updated with new content, specials, and testimonials, plus hosting, security, and priority support. Skip it and your $499 site is still yours.</div></details>
      <details class="q reveal"><summary>Which areas do you serve? <span class="pl"></span></summary><div class="a">We're based in Gwinnett County and proudly serve Dacula, Buford, Auburn, Braselton, Lawrenceville, Suwanee, Flowery Branch, and all of Metro Atlanta.</div></details>
    </div>
  </div>
</section>

<!-- FINAL CTA / CONTACT -->
<section class="section" id="contact">
  <div class="wrap">
    <div class="cta-band reveal">
      <span class="eyebrow" style="color:var(--cyan)">Ready when you are</span>
      <h2>Let's build your<br>website — <span style="color:var(--yellow)">live right now.</span></h2>
      <p class="lead center" style="color:#dfe6ff">Tell us about your business and we'll start building. You'll see it before you pay a thing.</p>
      <style>
        .finp{width:100%;background:rgba(7,8,12,.7);border:1px solid var(--line);border-radius:11px;color:#fff;padding:13px 14px;font-size:15px;font-family:inherit;outline:none}
        .finp:focus{border-color:var(--cyan)} .finp::placeholder{color:#6b7390}
        #leadForm .two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        @media(max-width:560px){#leadForm .two{grid-template-columns:1fr}}
      </style>
      <form id="leadForm" style="max-width:580px;margin:26px auto 0;text-align:left;display:grid;gap:12px">
        <div class="two">
          <input class="finp" name="name" required placeholder="Business name *">
          <select class="finp" name="type">
            <option>Restaurant / Café</option><option>Bar / Brewery</option><option>Bakery / Dessert Shop</option>
            <option>Retail / Local Shop</option><option>Boutique / Clothing</option><option>Salon / Spa</option>
            <option>Insurance Agency</option><option>Doctor's Office / Medical</option><option>Dentist / Orthodontist</option>
            <option>Law Firm</option><option>Accounting / Tax</option><option>Real Estate</option>
            <option>HVAC</option><option>Roofing</option><option>Plumbing / Electrical</option>
            <option>Landscaping</option><option>Auto Repair</option><option>Fitness / Gym</option>
            <option selected>Other Local Business</option>
          </select>
        </div>
        <div class="two">
          <input class="finp" name="email" type="email" required placeholder="Email *">
          <input class="finp" name="phone" placeholder="Phone">
        </div>
        <div class="two">
          <input class="finp" name="city" placeholder="City">
          <input class="finp" name="currentUrl" placeholder="Current website (if any)">
        </div>
        <textarea class="finp" name="notes" rows="3" placeholder="Tell us about your business and what you're after…"></textarea>
        <button type="submit" class="btn primary lg" style="justify-content:center">Get my $499 site →</button>
      </form>
      <div id="leadOk" style="display:none;max-width:580px;margin:26px auto 0;background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.4);border-radius:14px;padding:26px;text-align:center">
        <div class="display" style="font-size:26px;color:#fff;margin-bottom:8px">🏁 You're in the pit lane!</div>
        <p style="color:#dfe6ff;margin:0">Thanks — we got your request and we're on it. Check your inbox for a confirmation; we'll be in touch shortly with your live preview. No payment until you love it.</p>
      </div>
      <p style="margin-top:20px;color:var(--muted);font-size:13.5px">Prefer to talk? <a href="mailto:hello@499web.co" style="color:var(--cyan)">hello@499web.co</a> · <a href="tel:+14046206517" style="color:var(--cyan)">(404) 620-6517</a></p>
      <script>
      (function(){
        var f=document.getElementById('leadForm'); if(!f) return;
        f.addEventListener('submit',function(e){
          e.preventDefault();
          var b=f.querySelector('button'); b.disabled=true; b.textContent='Sending…';
          var data={}; new FormData(f).forEach(function(v,k){data[k]=v});
          fetch('/api/lead',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)})
            .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})})
            .then(function(res){
              if(res.ok){ f.style.display='none'; document.getElementById('leadOk').style.display='block'; document.getElementById('leadOk').scrollIntoView({behavior:'smooth',block:'center'}); }
              else { b.disabled=false; b.textContent='Get my $499 site →'; alert(res.j.error||'Something went wrong'); }
            }).catch(function(){ b.disabled=false; b.textContent='Get my $499 site →'; alert('Network error — please try again.'); });
        });
      })();
      </script>
    </div>
  </div>
</section>
</main>

<footer>
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <a href="#top" class="brand" style="margin-bottom:16px"><span class="brand-logo" role="img" aria-label="499 Web Co." style="height:40px"></span></a>
        <p style="max-width:30ch">Great websites for local businesses — live right now, for one flat price of $499.</p>
        <span class="ga">📍 Built in Georgia</span>
      </div>
      <div>
        <h4>Company</h4>
        <a href="#how">How it works</a><a href="#features">What you get</a><a href="#pricing">Pricing</a><a href="#work">Our work</a>
      </div>
      <div>
        <h4>Service area</h4>
        <a href="#">Dacula</a><a href="#">Buford</a><a href="#">Auburn</a><a href="#">Braselton</a><a href="#">Lawrenceville</a><a href="#">Suwanee</a><a href="#">Flowery Branch</a>
      </div>
      <div>
        <h4>Get started</h4>
        <a href="mailto:hello@499web.co">hello@499web.co</a>
        <a href="tel:+14046206517">(404) 620-6517</a>
        <a href="#contact" class="btn primary" style="margin-top:8px">Get my $499 site →</a>
      </div>
    </div>
    <div class="foot-bottom">
      <span>© <span id="yr"></span> 499 Web Co. All rights reserved.</span>
      <span>Proudly serving Gwinnett County &amp; Metro Atlanta</span>
    </div>
  </div>
</footer>

<script>
(function(){
  var d=document;
  // year
  d.getElementById('yr').textContent=new Date().getFullYear();
  // sticky header
  var hdr=d.getElementById('hdr');
  var onScroll=function(){hdr.classList.toggle('scrolled',window.scrollY>20)};
  onScroll();addEventListener('scroll',onScroll,{passive:true});
  // mobile menu
  var b=d.getElementById('burger'),nl=d.getElementById('navlinks');
  b.addEventListener('click',function(){nl.classList.toggle('open')});
  nl.addEventListener('click',function(e){if(e.target.tagName==='A')nl.classList.remove('open')});
  // duplicate marquee for seamless loop
  var t=d.getElementById('track');if(t)t.innerHTML+=t.innerHTML;
  // reveal on scroll
  var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){en.target.classList.add('in');io.unobserve(en.target)}})},{threshold:.12});
  d.querySelectorAll('.reveal').forEach(function(el,i){el.style.transitionDelay=(i%4*60)+'ms';io.observe(el)});
  // hero speed lines
  var sl=d.querySelector('.speedlines');
  if(sl){for(var i=0;i<14;i++){var s=d.createElement('i');s.style.top=(Math.random()*100)+'%';s.style.width=(20+Math.random()*45)+'%';s.style.animationDuration=(1.6+Math.random()*2.6)+'s';s.style.animationDelay=(-Math.random()*4)+'s';s.style.opacity=.3+Math.random()*.5;sl.appendChild(s);} }
  // count-up stats
  var counted=false;
  var hero=d.querySelector('.hero-stats');
  function countUp(){
    if(counted||!hero)return;var r=hero.getBoundingClientRect();if(r.top>innerHeight)return;counted=true;
    hero.querySelectorAll('[data-count]').forEach(function(el){
      var end=+el.getAttribute('data-count'),pre=el.getAttribute('data-prefix')||'',suf=el.getAttribute('data-suffix')||'',cur=0,step=end/40;
      var iv=setInterval(function(){cur+=step;if(cur>=end){cur=end;clearInterval(iv)}el.textContent=pre+Math.round(cur)+suf},22);
    });
  }
  countUp();addEventListener('scroll',countUp,{passive:true});
})();
</script>
</body>
</html>
`;
