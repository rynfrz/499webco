const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function portfolioHtml(previews) {
  const cards = previews
    .map(p => `<a class="card" href="/preview/${esc(p.slug)}/"><h2>${esc(p.business_name)}</h2><span>/preview/${esc(p.slug)}</span></a>`)
    .join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Previews · Websites For Locals</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#0e0f12;color:#f2f2f2;margin:0;padding:60px 24px}
h1{font-size:28px;max-width:880px;margin:0 auto 8px}p{color:#9a9aa3;max-width:880px;margin:0 auto 40px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;max-width:880px;margin:0 auto}
.card{display:block;background:#17181d;border:1px solid #26272e;border-radius:14px;padding:22px;text-decoration:none;color:inherit;transition:.15s}
.card:hover{border-color:#5b66f5;transform:translateY(-2px)}
.card h2{font-size:17px;margin:0 0 6px}.card span{font-size:13px;color:#7a7b85}</style></head>
<body><h1>Websites For Locals — Live Previews</h1><p>Modern websites built for local businesses, before asking for the sale.</p>
<div class="grid">${cards || '<p>No previews published yet.</p>'}</div></body></html>`;
}
