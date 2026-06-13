const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Public, prospect-facing portfolio gallery.
// Each card shows a LIVE, scaled-down render of the real /preview/<slug>/ page
// (no screenshot service needed) and links to the full site. A category
// dropdown filters the grid client-side.
export function portfolioHtml(previews) {
  const items = previews.map(p => ({
    slug: p.slug,
    name: p.business_name,
    category: p.category || 'Other'
  }));

  const categories = [...new Set(items.map(i => i.category))].sort();
  const options = ['All', ...categories]
    .map(c => `<option value="${esc(c)}">${esc(c)}${c === 'All' ? '' : ` (${items.filter(i => i.category === c).length})`}</option>`)
    .join('');

  const cards = items.map(i => `
    <a class="card" href="/preview/${esc(i.slug)}/" data-cat="${esc(i.category)}" target="_blank" rel="noopener">
      <div class="thumb"><iframe src="/preview/${esc(i.slug)}/" loading="lazy" scrolling="no" tabindex="-1" aria-hidden="true" title="${esc(i.name)} preview"></iframe><span class="thumb-overlay"></span></div>
      <div class="meta"><div class="name">${esc(i.name)}</div><div class="cat">${esc(i.category)}</div></div>
    </a>`).join('\n');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Our Work · 499web.co</title>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{--bg:#0c0d11;--panel:#16181f;--border:#262932;--text:#f3f4f8;--muted:#9b9da8;--accent:#6c4df6;--accent2:#22d3ee}
  *{box-sizing:border-box;margin:0}
  body{font-family:'Inter',-apple-system,system-ui,sans-serif;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased}
  .hero{padding:64px 24px 36px;max-width:1240px;margin:0 auto;text-align:center}
  .eyebrow{font-size:13px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--accent2);margin-bottom:14px}
  h1{font-family:'Sora',sans-serif;font-size:clamp(32px,5vw,56px);font-weight:800;line-height:1.05;letter-spacing:-.02em;margin-bottom:14px;
     background:linear-gradient(120deg,#fff 30%,#b9aaff 70%,#7fe9ff);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
  .sub{color:var(--muted);font-size:17px;max-width:560px;margin:0 auto}
  .controls{max-width:1240px;margin:0 auto;padding:8px 24px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
  .count{color:var(--muted);font-size:14px}
  .filter{display:flex;align-items:center;gap:10px}
  .filter label{font-size:13px;color:var(--muted);font-weight:600}
  select{background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:10px 14px;font-size:14px;font-family:inherit;cursor:pointer;outline:none}
  select:focus{border-color:var(--accent)}
  .grid{max-width:1240px;margin:0 auto;padding:0 24px 80px;display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:24px}
  .card{display:block;background:var(--panel);border:1px solid var(--border);border-radius:18px;overflow:hidden;text-decoration:none;color:inherit;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}
  .card:hover{transform:translateY(-4px);border-color:var(--accent);box-shadow:0 18px 50px rgba(108,77,246,.25)}
  .thumb{position:relative;width:100%;aspect-ratio:16/10;overflow:hidden;background:#fff}
  .thumb iframe{position:absolute;top:0;left:0;width:1440px;height:900px;border:0;transform-origin:0 0;pointer-events:none}
  .thumb-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 70%,rgba(0,0,0,.04))}
  .meta{padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:10px}
  .name{font-family:'Sora',sans-serif;font-weight:600;font-size:16px}
  .cat{font-size:11.5px;font-weight:600;color:var(--accent2);background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.25);padding:4px 9px;border-radius:999px;white-space:nowrap}
  .empty{max-width:1240px;margin:0 auto;padding:40px 24px 100px;text-align:center;color:var(--muted)}
  footer{border-top:1px solid var(--border);text-align:center;padding:28px;color:var(--muted);font-size:13px}
  @media(max-width:560px){.grid{grid-template-columns:1fr}}
</style></head>
<body>
  <section class="hero">
    <div class="eyebrow">499web.co</div>
    <h1>Our Work</h1>
    <p class="sub">Modern website facelifts for local businesses — just $499. Tap any project to explore it live.</p>
  </section>
  <div class="controls">
    <div class="count" id="count"></div>
    <div class="filter"><label for="cat">Category</label>
      <select id="cat">${options}</select>
    </div>
  </div>
  ${items.length ? `<div class="grid" id="grid">${cards}</div>` : '<div class="empty">No projects published yet — they will appear here as you publish previews.</div>'}
  <footer>Built with care by 499web.co</footer>
  <script>
    function fit(){
      document.querySelectorAll('.thumb').forEach(function(t){
        var f=t.querySelector('iframe'); if(!f)return;
        var s=t.clientWidth/1440;
        f.style.transform='scale('+s+')';
        f.style.height=(t.clientHeight/s)+'px';
      });
    }
    window.addEventListener('load',fit); window.addEventListener('resize',fit); fit();
    var sel=document.getElementById('cat'), grid=document.getElementById('grid'), count=document.getElementById('count');
    function apply(){
      var v=sel.value, shown=0;
      (grid?grid.querySelectorAll('.card'):[]).forEach(function(c){
        var ok=(v==='All'||c.dataset.cat===v); c.style.display=ok?'':'none'; if(ok)shown++;
      });
      count.textContent=shown+' project'+(shown===1?'':'s');
      setTimeout(fit,30);
    }
    if(sel){sel.addEventListener('change',apply); apply();}
  </script>
</body></html>`;
}
