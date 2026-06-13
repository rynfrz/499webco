const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Public, prospect-facing portfolio gallery — styled to match the 499web.co
// marketing site (racing/neon). Each card is a live, scaled render of the real
// /preview/<slug>/ page; a category dropdown filters the grid client-side.
export function portfolioHtml(previews) {
  const items = previews.map(p => ({ slug: p.slug, name: p.business_name, category: p.category || 'Other' }));
  const categories = [...new Set(items.map(i => i.category))].sort();
  const options = ['All', ...categories]
    .map(c => `<option value="${esc(c)}">${esc(c)}${c === 'All' ? '' : ` (${items.filter(i => i.category === c).length})`}</option>`).join('');

  const cards = items.map(i => `
    <a class="card" href="/preview/${esc(i.slug)}/" data-cat="${esc(i.category)}" target="_blank" rel="noopener">
      <div class="thumb"><iframe src="/preview/${esc(i.slug)}/" loading="lazy" scrolling="no" tabindex="-1" aria-hidden="true" title="${esc(i.name)} preview"></iframe></div>
      <div class="meta"><div class="name">${esc(i.name)}</div><div class="cat">${esc(i.category)}</div></div>
    </a>`).join('\n');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Our Work · 499 Web Co.</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root{--ink:#07080c;--ink-2:#0c0e15;--panel:#0f121b;--panel-2:#141826;--line:#222840;--muted:#9aa3bd;--text:#eaf0ff;
    --blue:#1aa6ff;--cyan:#5fd8ff;--pink:#ff2e7e;--yellow:#ffd21a;--green:#4ade80;
    --grad-3:linear-gradient(100deg,var(--cyan),var(--pink) 55%,var(--yellow))}
  *{box-sizing:border-box;margin:0}
  body{font-family:'Inter',-apple-system,system-ui,sans-serif;background:var(--ink);color:var(--text);-webkit-font-smoothing:antialiased}
  a{text-decoration:none;color:inherit}
  .bg{position:fixed;inset:0;z-index:-1;background:
    radial-gradient(1100px 600px at 80% -10%,rgba(26,166,255,.16),transparent 60%),
    radial-gradient(900px 600px at 0% 5%,rgba(255,46,126,.12),transparent 55%),var(--ink)}
  .wrap{max-width:1240px;margin:0 auto;padding:0 24px}
  h1,h2,.display{font-family:'Saira Condensed',sans-serif;text-transform:uppercase;letter-spacing:-.01em;line-height:.98}
  /* header */
  header{position:sticky;top:0;z-index:30;background:rgba(7,8,12,.72);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
  .nav{display:flex;align-items:center;justify-content:space-between;padding:14px 0}
  .brand-logo{display:block;height:42px;width:auto;filter:drop-shadow(0 2px 10px rgba(26,166,255,.35))}
  .nav-r{display:flex;align-items:center;gap:18px}
  .nav-r a.home{font-family:'Saira Condensed',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-size:15px}
  .nav-r a.home:hover{color:#fff}
  .btn{display:inline-flex;align-items:center;gap:8px;font-family:'Saira Condensed',sans-serif;font-weight:800;text-transform:uppercase;
    letter-spacing:.04em;font-size:15px;padding:11px 20px;border-radius:11px;color:#04121f;background:var(--grad-3);
    box-shadow:0 8px 24px rgba(26,166,255,.3);transition:transform .18s,box-shadow .25s}
  .btn:hover{transform:translateY(-2px);box-shadow:0 14px 36px rgba(255,46,126,.4)}
  /* hero */
  .hero{padding:70px 24px 30px;max-width:1240px;margin:0 auto;text-align:center}
  .eyebrow{font-family:'Saira Condensed',sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:.22em;font-size:13px;color:var(--cyan)}
  .hero h1{font-weight:900;font-size:clamp(40px,6.5vw,84px);margin:14px 0 14px;color:#fff}
  .hero h1 .pink{color:var(--pink);text-shadow:0 0 30px rgba(255,46,126,.45)}
  .hero p{color:var(--muted);font-size:clamp(16px,1.7vw,19px);max-width:600px;margin:0 auto}
  .hero p b{color:#fff}
  /* controls */
  .controls{max-width:1240px;margin:0 auto;padding:26px 24px 30px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
  .count{color:var(--muted);font-size:14px;font-weight:600}
  .filter{display:flex;align-items:center;gap:10px}
  .filter label{font-family:'Saira Condensed',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:13px;color:var(--muted)}
  select{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:11px;padding:11px 15px;font-size:14px;font-family:inherit;cursor:pointer;outline:none}
  select:focus{border-color:var(--cyan)}
  /* grid */
  .grid{max-width:1240px;margin:0 auto;padding:0 24px 90px;display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:24px}
  .card{display:block;background:var(--panel);border:1px solid var(--line);border-radius:18px;overflow:hidden;
    transition:transform .2s,border-color .2s,box-shadow .2s}
  .card:hover{transform:translateY(-5px);border-color:var(--cyan);box-shadow:0 22px 55px rgba(26,166,255,.22)}
  .thumb{position:relative;width:100%;aspect-ratio:16/10;overflow:hidden;background:#fff;border-bottom:1px solid var(--line)}
  .thumb iframe{position:absolute;top:0;left:0;width:1440px;height:900px;border:0;transform-origin:0 0;pointer-events:none}
  .meta{padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:10px}
  .name{font-family:'Saira Condensed',sans-serif;font-weight:700;font-size:17px;color:#fff;text-transform:uppercase;letter-spacing:.01em}
  .cat{font-family:'Saira Condensed',sans-serif;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--cyan);
    background:rgba(95,216,255,.1);border:1px solid rgba(95,216,255,.28);padding:4px 9px;border-radius:999px;white-space:nowrap}
  .empty{max-width:1240px;margin:0 auto;padding:30px 24px 120px;text-align:center;color:var(--muted)}
  /* footer */
  footer{border-top:1px solid var(--line);background:var(--ink-2);padding:40px 0;text-align:center;color:var(--muted);font-size:13.5px}
  footer .cta{margin-bottom:16px}
  @media(max-width:560px){.grid{grid-template-columns:1fr}}
</style></head>
<body>
<div class="bg"></div>
<header><div class="wrap nav">
  <a href="/" aria-label="499 Web Co. home"><img src="/brand/logo.png" alt="499 Web Co." class="brand-logo"></a>
  <div class="nav-r">
    <a class="home" href="/">← Home</a>
    <a class="btn" href="/#contact">Get a $499 site →</a>
  </div>
</div></header>

<section class="hero">
  <div class="eyebrow">Our Work</div>
  <h1>Sites we've built — <span class="pink">live</span>.</h1>
  <p>Real, modern websites for local businesses across Gwinnett County &amp; Metro Atlanta. Every one is a <b>live, clickable site</b> — tap any project to explore it. All for one flat price of <b>$499</b>.</p>
</section>

<div class="controls">
  <div class="count" id="count"></div>
  <div class="filter"><label for="cat">Category</label><select id="cat">${options}</select></div>
</div>

${items.length ? `<div class="grid" id="grid">${cards}</div>` : '<div class="empty">No projects published yet — they will appear here as we publish previews.</div>'}

<footer>
  <div class="cta"><a class="btn" href="/#contact">Get my $499 website →</a></div>
  <div>© <span id="yr"></span> 499 Web Co. · Proudly serving Gwinnett County &amp; Metro Atlanta</div>
</footer>

<script>
  document.getElementById('yr').textContent=new Date().getFullYear();
  function fit(){document.querySelectorAll('.thumb').forEach(function(t){var f=t.querySelector('iframe');if(!f)return;var s=t.clientWidth/1440;f.style.transform='scale('+s+')';f.style.height=(t.clientHeight/s)+'px';});}
  window.addEventListener('load',fit);window.addEventListener('resize',fit);fit();
  var sel=document.getElementById('cat'),grid=document.getElementById('grid'),count=document.getElementById('count');
  function apply(){var v=sel.value,shown=0;(grid?grid.querySelectorAll('.card'):[]).forEach(function(c){var ok=(v==='All'||c.dataset.cat===v);c.style.display=ok?'':'none';if(ok)shown++;});count.textContent=shown+' project'+(shown===1?'':'s');setTimeout(fit,30);}
  if(sel){sel.addEventListener('change',apply);apply();}
</script>
</body></html>`;
}
