'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { BUSINESS_TYPES, makeDesignSeed } from '@/lib/promptBuilder';

const ALL_PAGES = ['About Us', 'Contact Us', 'Services', 'Locations', 'Hours', 'Menu', 'Shop', 'Reviews', 'FAQ', 'Gallery'];

// Extract a few dominant brand colors from a loaded logo image (client-side).
function extractLogoColors(img) {
  try {
    const c = document.createElement('canvas');
    const w = c.width = 64, h = c.height = Math.max(1, Math.round(64 * (img.height || 1) / (img.width || 1)));
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const buckets = {};
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 128) continue;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max > 244 && min > 244) continue;     // skip near-white
      if (max < 18) continue;                    // skip near-black
      const key = (r >> 5) + ',' + (g >> 5) + ',' + (b >> 5);
      const bk = buckets[key] || (buckets[key] = { n: 0, r: 0, g: 0, b: 0, sat: 0 });
      bk.n++; bk.r += r; bk.g += g; bk.b += b; bk.sat += (max - min);
    }
    const hex = (r, g, b) => '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
    return Object.values(buckets)
      .map(bk => ({ n: bk.n, sat: bk.sat / bk.n, r: bk.r / bk.n, g: bk.g / bk.n, b: bk.b / bk.n }))
      .sort((a, b) => (b.n * (b.sat + 12)) - (a.n * (a.sat + 12)))
      .slice(0, 4)
      .map(v => hex(v.r, v.g, v.b));
  } catch { return []; }
}

// Downscale a photo to a web-friendly size before upload (keeps sites fast and
// uploads small). SVG/GIF are passed through untouched.
function downscalePhoto(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml' || file.type === 'image/gif') return resolve(file);
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Could not read file'));
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        c.toBlob(b => b ? resolve(b) : reject(new Error('Could not process image')), 'image/jpeg', quality);
      };
      img.onerror = () => reject(new Error('Not a valid image'));
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

// Read a logo file → { dataUrl, colors }. Rasters are downscaled to ≤512px; SVGs kept as-is.
function processLogo(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file'));
    if (file.size > 4 * 1024 * 1024) return reject(new Error('Logo is too large (max 4MB)'));
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Could not read that file'));
    fr.onload = () => {
      const original = fr.result;
      const img = new Image();
      img.onload = () => {
        const colors = extractLogoColors(img);
        let dataUrl = original;
        if (file.type !== 'image/svg+xml') {
          const maxDim = 512; let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          dataUrl = c.toDataURL('image/png');
        }
        resolve({ dataUrl, colors });
      };
      img.onerror = () => reject(new Error('That file is not a valid image'));
      img.src = original;
    };
    fr.readAsDataURL(file);
  });
}
const INTEGRATIONS = [
  { key: 'shopify', name: 'Shopify', desc: 'Link/embed their store', fields: [['url', 'Store URL'], ['token', 'Storefront token (optional)']] },
  { key: 'stripe', name: 'Stripe', desc: 'Payment link CTA', fields: [['url', 'Payment link URL']] },
  { key: 'trustpilot', name: 'Trustpilot', desc: 'Rating + reviews link', fields: [['url', 'Profile URL']] },
  { key: 'socialWall', name: 'Social wall', desc: 'Follow-us section', fields: [['instagram', 'Instagram', 'handles'], ['facebook', 'Facebook', 'handles'], ['tiktok', 'TikTok', 'handles'], ['x', 'X / Twitter', 'handles']] },
  { key: 'jotform', name: 'Jotform', desc: 'Form + chatbot', fields: [['formId', 'Form ID'], ['chatbot', 'AI Agent ID (optional)']] },
  { key: 'googleMaps', name: 'Google Maps', desc: 'Embedded map (no key)', fields: [] },
  { key: 'calendly', name: 'Calendly', desc: 'Inline booking', fields: [['url', 'Calendly link']] },
  { key: 'opentable', name: 'Reservations', desc: 'OpenTable/Resy CTA', fields: [['url', 'Reservation URL']] },
  { key: 'doordash', name: 'Online ordering', desc: 'DoorDash/Toast link', fields: [['url', 'Ordering URL']] },
  { key: 'googleBusiness', name: 'Google reviews', desc: '“Review us” CTA', fields: [['url', 'Review link (optional)']] }
];
const STEPS = ['Business', 'Brief', 'Generate', 'Preview', 'Deliver', 'Launch'];

export default function Workspace() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [step, setStep] = useState(0);
  const [msg, setMsg] = useState(null);
  const saveTimer = useRef(null);
  const toast = (text, type = 'success') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 4000); };

  useEffect(() => { fetch('/api/projects/' + id).then(r => r.json()).then(d => setP(d.project)); }, [id]);

  // Debounced autosave
  const save = (next) => {
    const data = next || p;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch('/api/projects/' + id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    }, 600);
  };
  const update = (mut) => { const np = structuredClone(p); mut(np); setP(np); save(np); };

  if (!p) return <div className="inner"><span className="spinner" /></div>;

  return (
    <div className="inner wide">
      <h1>{p.business.name || 'New Business'}</h1>
      <p className="subtitle">{p.business.type}{p.business.city ? ' · ' + p.business.city : ''}</p>
      <div className="chips" style={{ marginBottom: 24 }}>
        {STEPS.map((s, i) => (
          <div key={s} className={'chip' + (step === i ? ' on' : '')} onClick={() => setStep(i)}>{i + 1}. {s}</div>
        ))}
      </div>

      {step === 0 && <Business p={p} update={update} toast={toast} go={() => setStep(1)} />}
      {step === 1 && <Brief p={p} update={update} toast={toast} go={() => setStep(2)} />}
      {step === 2 && <Generate p={p} setP={setP} id={id} toast={toast} go={() => setStep(3)} />}
      {step === 3 && <Preview p={p} setP={setP} id={id} toast={toast} go={() => setStep(4)} />}
      {step === 4 && <Deliver p={p} setP={setP} id={id} toast={toast} go={() => setStep(5)} />}
      {step === 5 && <Launch p={p} setP={setP} id={id} toast={toast} />}

      {msg && <div className={'toast ' + msg.type}>{msg.text}</div>}
    </div>
  );
}

function Field({ label, value, onChange, textarea, type, placeholder, hint }) {
  return (
    <div className="field">
      <label>{label}</label>
      {textarea
        ? <textarea rows={textarea} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
        : <input type={type || 'text'} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

/* ---------- Photo library (Brief step) ---------- */
function PhotoLibrary({ p, update, toast }) {
  const [uploading, setUploading] = useState(0);
  const photos = p.business.photos || [];

  async function addFiles(fileList) {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    setUploading(u => u + files.length);
    for (const file of files) {
      try {
        const blob = await downscalePhoto(file);
        const fd = new FormData();
        const base = (file.name || 'photo').replace(/\.\w+$/, '') || 'photo';
        fd.append('file', blob, base + (blob.type === 'image/jpeg' ? '.jpg' : ''));
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        update(np => { np.business.photos = [...(np.business.photos || []), d.url]; });
      } catch (err) {
        toast('Upload failed: ' + err.message, 'error');
      } finally {
        setUploading(u => u - 1);
      }
    }
  }

  function remove(url) {
    update(np => { np.business.photos = (np.business.photos || []).filter(u => u !== url); });
    fetch('/api/upload?url=' + encodeURIComponent(url), { method: 'DELETE' }).catch(() => {});
  }

  return (
    <div className="card">
      <div className="card-title">Photo library (optional)</div>
      <div className="hint" style={{ marginBottom: 12 }}>Upload real photos of the business — they're hosted and used throughout the generated site (hero, gallery, about). Large images are auto-optimized. JPG, PNG, WebP.</div>
      <label className="btn">📷 Upload photos
        <input type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
      </label>
      {uploading > 0 && <span className="small muted" style={{ marginLeft: 12 }}><span className="spinner" /> Uploading {uploading}…</span>}
      {photos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 10, marginTop: 14 }}>
          {photos.map((url, i) => (
            <div key={url + i} style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <button onClick={() => remove(url)} title="Remove"
                style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: '22px', padding: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Step 1: Business + Analyze ---------- */
function Business({ p, update, toast, go }) {
  const b = p.business;
  const [analyzing, setAnalyzing] = useState(false);
  const setB = (k, v) => update(np => { np.business[k] = v; });

  async function analyze() {
    if (!b.currentUrl) return toast('Enter the current website URL first', 'error');
    setAnalyzing(true);
    try {
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ business: b }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      update(np => {
        np.analysis = d.analysis;
        const ex = d.analysis.extracted || {};
        if (ex.services?.length && !np.business.services?.length) np.business.services = ex.services;
        if (ex.about && !np.business.description) np.business.description = ex.about;
        if (ex.phone && !np.business.phone) np.business.phone = ex.phone;
        if (ex.address && !np.business.address) np.business.address = ex.address;
        if (ex.hours && !np.business.hours) np.business.hours = ex.hours;
      });
    } catch (e) { toast(e.message, 'error'); } finally { setAnalyzing(false); }
  }

  const a = p.analysis;
  const flags = a ? [...(a.redFlags || []), ...(a.designIssues || []), ...(a.seoIssues || []), ...(a.conversionIssues || [])] : [];

  return (
    <>
      <div className="card">
        <div className="card-title">Business</div>
        <div className="row">
          <Field label="Business name *" value={b.name} onChange={v => setB('name', v)} />
          <div className="field"><label>Business type *</label>
            <select value={b.type} onChange={e => { const t = e.target.value; update(np => { np.business.type = t; np.designSeed = makeDesignSeed(t); }); }}>
              {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select></div>
        </div>
        <div className="row">
          <Field label="Current website URL" value={b.currentUrl} onChange={v => setB('currentUrl', v)} placeholder="https://oldsite.com" />
          <Field label="Phone" value={b.phone} onChange={v => setB('phone', v)} />
        </div>
        <div className="row">
          <Field label="City" value={b.city} onChange={v => setB('city', v)} />
          <Field label="Email" value={b.email} onChange={v => setB('email', v)} type="email" />
        </div>
        <Field label="Street address" value={b.address} onChange={v => setB('address', v)} />
      </div>

      <div className="card">
        <div className="card-title">Analyze current website</div>
        <button className="btn primary" onClick={analyze} disabled={analyzing}>{analyzing ? <><span className="spinner" /> Analyzing…</> : '⚡ Analyze'}</button>
        {a && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: a.score >= 70 ? 'var(--green)' : a.score >= 45 ? 'var(--amber)' : 'var(--red)' }}>{a.score}<span style={{ fontSize: 14, color: 'var(--muted)' }}>/100</span></div>
              <div><strong>{a.verdict}</strong><div className="small muted">{flags.length} issues{flags.length >= 3 ? ' — 3+ red flags: BUILD IT.' : ''}</div></div>
            </div>
            <ul className="small" style={{ marginTop: 12 }}>{flags.map((f, i) => <li key={i}>{f}</li>)}</ul>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Details (auto-filled where possible — edit freely)</div>
        <Field label="What they do / story" value={b.description} onChange={v => setB('description', v)} textarea={3} />
        <Field label="Tagline / vibe" value={b.tagline} onChange={v => setB('tagline', v)} />
        <Field label="Services (one per line)" value={(b.services || []).join('\n')} onChange={v => setB('services', v.split('\n').map(x => x.trim()).filter(Boolean))} textarea={5} />
        <Field label="Hours" value={b.hours} onChange={v => setB('hours', v)} textarea={2} />
        <Field label="Menu highlights (one per line)" value={b.menu} onChange={v => setB('menu', v)} textarea={4} />
        <Field label="Top reviews (text | author | stars — one per line)" value={(b.reviews || []).map(r => [r.text, r.author, r.rating].filter(Boolean).join(' | ')).join('\n')}
          onChange={v => setB('reviews', v.split('\n').filter(Boolean).map(l => { const [text, author, rating] = l.split('|').map(x => x.trim()); return { text, author, rating }; }))} textarea={5}
          hint="Copy from Google Maps. Example: Fixed it same day | Maria G. | 5" />
        <Field label="Photo URLs (one per line, optional)" value={(b.photos || []).join('\n')} onChange={v => setB('photos', v.split('\n').map(x => x.trim()).filter(Boolean))} textarea={2} />
      </div>

      <div className="btn-row"><button className="btn primary" onClick={() => { if (!b.name) return toast('Business name is required', 'error'); go(); }}>Continue → Brief</button></div>
    </>
  );
}

/* ---------- Step 2: Brief ---------- */
function Brief({ p, update, toast, go }) {
  const q = p.questionnaire;
  // designSeed is always set by blankProject; fall back defensively without
  // calling setState during render.
  const seed = p.designSeed || makeDesignSeed(p.business.type);
  useEffect(() => {
    if (!p.designSeed) update(np => { np.designSeed = makeDesignSeed(np.business.type); });
  }, []); // eslint-disable-line

  return (
    <>
      <div className="card">
        <div className="card-title">Pages & navigation</div>
        <div className="chips">
          {ALL_PAGES.map(pg => (
            <div key={pg} className={'chip' + (q.pages.includes(pg) ? ' on' : '')}
              onClick={() => update(np => { const s = new Set(np.questionnaire.pages); s.has(pg) ? s.delete(pg) : s.add(pg); np.questionnaire.pages = [...s]; })}>{pg}</div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Integrations</div>
        <div className="hint" style={{ marginBottom: 12 }}>Toggle on what the business uses; fill in what you have.</div>
        {INTEGRATIONS.map(integ => {
          const state = q.integrations[integ.key] || { enabled: false };
          return (
            <div key={integ.key} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 10, background: 'var(--bg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => update(np => { np.questionnaire.integrations[integ.key] = { ...state, enabled: !state.enabled }; if (integ.key === 'socialWall') np.questionnaire.integrations[integ.key].handles = state.handles || {}; })}>
                <div><div style={{ fontWeight: 600 }}>{integ.name}</div><div className="small muted">{integ.desc}</div></div>
                <input type="checkbox" checked={!!state.enabled} readOnly style={{ width: 'auto' }} />
              </div>
              {state.enabled && integ.fields.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {integ.fields.map(([k, label, nested]) => {
                    const val = nested ? (state[nested] || {})[k] : state[k];
                    return <Field key={k} label={label} value={val || ''} onChange={v => update(np => {
                      const ig = np.questionnaire.integrations[integ.key];
                      if (nested) { ig[nested] = ig[nested] || {}; ig[nested][k] = v; } else ig[k] = v;
                    })} />;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-title">Brand logo (optional)</div>
        <div className="hint" style={{ marginBottom: 12 }}>Used as the site's header logo and favicon, and its colors steer the palette. PNG, SVG, or JPG.</div>
        {p.business.logo ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ background: '#fff', borderRadius: 10, padding: 12, border: '1px solid var(--border)' }}>
              <img src={p.business.logo} alt="logo" style={{ height: 56, width: 'auto', maxWidth: 200, display: 'block' }} />
            </div>
            {p.business.logoColors?.length > 0 && (
              <div>
                <div className="small muted" style={{ marginBottom: 6 }}>Detected brand colors (feed the palette):</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {p.business.logoColors.map((c, i) => (
                    <span key={i} title={c} style={{ width: 26, height: 26, borderRadius: 6, background: c, border: '1px solid var(--border)' }} />
                  ))}
                </div>
              </div>
            )}
            <button className="btn ghost small danger" onClick={() => update(np => { np.business.logo = ''; np.business.logoColors = []; })}>Remove</button>
          </div>
        ) : (
          <label className="btn">📁 Upload logo
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
              const file = e.target.files?.[0]; if (!file) return;
              try {
                const { dataUrl, colors } = await processLogo(file);
                update(np => { np.business.logo = dataUrl; np.business.logoColors = colors; });
                toast('Logo added — it\'ll appear in the header & favicon', 'success');
              } catch (err) { toast(err.message, 'error'); }
              e.target.value = '';
            }} />
          </label>
        )}
      </div>

      <PhotoLibrary p={p} update={update} toast={toast} />

      <div className="card">
        <div className="card-title">Design direction (optional)</div>
        <div className="hint" style={{ marginBottom: 10 }}>Free-form notes that go straight into the AI prompt at high priority. Reference sites, layout ideas, brand personality, specific sections, do's and don'ts — anything.</div>
        <textarea rows={6} value={q.designNotes || ''} onChange={e => update(np => { np.questionnaire.designNotes = e.target.value; })}
          placeholder={'e.g. "Make it feel premium and minimal like an Apple product page. Big full-width food photos, lots of negative space, a sticky Order Online button. Avoid anything cartoonish. Emphasize that they\'re family-owned since 1998."'} />
      </div>

      <div className="card">
        <div className="card-title">Look & feel (optional)</div>
        <div className="row">
          <Field label="Tone" value={q.vibe.tone} onChange={v => update(np => { np.questionnaire.vibe.tone = v; })} placeholder="upscale, family-friendly…" />
          <Field label="Color preferences" value={q.vibe.colors} onChange={v => update(np => { np.questionnaire.vibe.colors = v; })} />
        </div>
        <div className="row">
          <Field label="Must include" value={q.vibe.mustHave} onChange={v => update(np => { np.questionnaire.vibe.mustHave = v; })} />
          <Field label="Avoid" value={q.vibe.avoid} onChange={v => update(np => { np.questionnaire.vibe.avoid = v; })} />
        </div>
      </div>

      <div className="card">
        <div className="card-title">🎲 Art direction seed</div>
        <div className="hint" style={{ marginBottom: 12 }}>Each generation gets a unique direction so no two sites look alike.</div>
        <ul className="small">
          <li>🎨 {seed.direction}</li>
          <li>🔤 {seed.type.head} / {seed.type.body}</li>
          <li>🌈 {seed.color}</li>
          <li>🖼 {seed.hero}</li>
          <li>📐 {seed.motif}</li>
          <li>✨ {seed.signatures.join(' + ')}</li>
        </ul>
        <button className="btn" onClick={() => update(np => { np.designSeed = makeDesignSeed(np.business.type, Math.floor(Math.random() * 2147483647)); })}>🎲 Reroll direction</button>
      </div>

      <div className="btn-row"><button className="btn primary" onClick={() => { if (!q.pages.length) return toast('Pick at least one page', 'error'); go(); }}>Continue → Generate</button></div>
    </>
  );
}

/* ---------- Step 3: Generate ---------- */
function Generate({ p, setP, id, toast, go }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function generate() {
    setBusy(true); setStatus('Sending brief to Claude…');
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: id }) });
      if (!res.ok && !res.body) { const d = await res.json(); throw new Error(d.error); }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === 'progress') setStatus(`Claude is designing… ${ev.kb} KB written`);
          if (ev.type === 'status') setStatus(ev.text);
          if (ev.type === 'error') throw new Error(ev.error);
          if (ev.type === 'done') setStatus(`Done — ${ev.kb} KB generated.`);
        }
      }
      const fresh = await fetch('/api/projects/' + id).then(r => r.json());
      setP(fresh.project);
      toast('Website generated', 'success');
      go();
    } catch (e) { setStatus('✖ ' + e.message); toast('Generation failed: ' + e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="card-title">Generate website</div>
      <div className="hint" style={{ marginBottom: 14 }}>Claude builds a complete, one-of-a-kind site from your brief. This can take 1–4 minutes; the result is saved even if you navigate away.</div>
      <div className="btn-row" style={{ margin: 0 }}>
        <button className="btn primary" onClick={generate} disabled={busy}>{busy ? <><span className="spinner" /> Generating…</> : (p.generatedHtml ? '↻ Regenerate' : '✦ Generate Website')}</button>
        {p.generatedHtml && !busy && <button className="btn" onClick={go}>View current site →</button>}
      </div>
      {status && <pre className="mono small" style={{ marginTop: 14, whiteSpace: 'pre-wrap', color: 'var(--muted)' }}>{status}</pre>}
    </div>
  );
}

/* ---------- Step 4: Preview ---------- */
function Preview({ p, setP, id, toast, go }) {
  const [device, setDevice] = useState('100%');
  const [instruction, setInstruction] = useState('');
  const [revising, setRevising] = useState(false);
  if (!p.generatedHtml) return <div className="card">Generate the site first.</div>;

  async function revise() {
    if (!instruction.trim()) return;
    setRevising(true);
    try {
      const res = await fetch('/api/revise', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: id, instruction }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setP({ ...p, generatedHtml: d.html });
      setInstruction('');
      toast('Revision applied', 'success');
    } catch (e) { toast('Revision failed: ' + e.message, 'error'); } finally { setRevising(false); }
  }

  return (
    <>
      <div className="preview-toolbar" style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {[['Desktop', '100%'], ['Tablet', '768px'], ['Phone', '390px']].map(([n, w]) =>
          <button key={n} className={'btn' + (device === w ? ' primary' : ' ghost')} onClick={() => setDevice(w)}>{n}</button>)}
        <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={go}>Continue → Deliver</button>
      </div>
      <div className="preview-toolbar" style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <input value={instruction} onChange={e => setInstruction(e.target.value)} onKeyDown={e => e.key === 'Enter' && revise()} placeholder='Ask for a change… e.g. "make the hero darker, add a catering section"' />
        <button className="btn" onClick={revise} disabled={revising}>{revising ? <span className="spinner" /> : '✦ Revise'}</button>
      </div>
      <div style={{ width: device, margin: '0 auto', transition: 'width .2s' }}>
        <iframe className="preview" srcDoc={p.generatedHtml} title="preview" />
      </div>
    </>
  );
}

/* ---------- Step 5: Deliver ---------- */
function Deliver({ p, setP, id, toast, go }) {
  const [pubBusy, setPubBusy] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);
  if (!p.generatedHtml) return <div className="card">Generate the site first.</div>;

  async function publish() {
    setPubBusy(true);
    try {
      const res = await fetch('/api/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: id }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setP({ ...p, publish: d.publish, status: 'published' });
      toast('Preview is live', 'success');
    } catch (e) { toast('Publish failed: ' + e.message, 'error'); } finally { setPubBusy(false); }
  }
  async function outreach() {
    setMailBusy(true);
    try {
      const res = await fetch('/api/outreach', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: id }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setP({ ...p, outreach: d.outreach });
      toast('Email ready', 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setMailBusy(false); }
  }
  async function audit() {
    setAuditBusy(true);
    try {
      const res = await fetch('/api/audit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: id }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      const w = window.open('', '_blank');
      w.document.write(d.auditHtml + '<script>setTimeout(()=>window.print(),600)<\/script>');
      w.document.close();
      toast('Audit opened — use “Save as PDF”', 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setAuditBusy(false); }
  }
  const copy = (t) => navigator.clipboard.writeText(t).then(() => toast('Copied', 'success'));

  return (
    <>
      <div className="card">
        <div className="card-title">1 · Publish preview</div>
        <button className="btn primary" onClick={publish} disabled={pubBusy}>{pubBusy ? <span className="spinner" /> : (p.publish ? '↻ Republish' : '🚀 Publish preview')}</button>
        {p.publish && (
          <div style={{ marginTop: 12 }}>
            <a href={p.publish.directUrl} target="_blank" className="badge published" style={{ textDecoration: 'none' }}>🔗 {p.publish.previewUrl}</a>{' '}
            <button className="btn ghost small" onClick={() => copy(p.publish.previewUrl)}>Copy</button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">2 · Audit (printable PDF)</div>
        <div className="hint" style={{ marginBottom: 10 }}>Opens a one-page audit in a new tab and triggers your browser’s “Save as PDF”.</div>
        <button className="btn primary" onClick={audit} disabled={auditBusy}>{auditBusy ? <span className="spinner" /> : '📄 Generate audit'}</button>
      </div>

      <div className="card">
        <div className="card-title">3 · Outreach email</div>
        <button className="btn primary" onClick={outreach} disabled={mailBusy}>{mailBusy ? <span className="spinner" /> : (p.outreach ? '↻ Rewrite' : '✉ Generate email')}</button>
        {p.outreach && (
          <div style={{ marginTop: 12 }}>
            <div className="card" style={{ background: 'var(--bg)', whiteSpace: 'pre-wrap' }}><strong>Subject: {p.outreach.subject}</strong>{'\n\n' + p.outreach.body}</div>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => copy(`Subject: ${p.outreach.subject}\n\n${p.outreach.body}`)}>⧉ Copy</button>
              <a className="btn" href={`mailto:${p.business.email || ''}?subject=${encodeURIComponent(p.outreach.subject)}&body=${encodeURIComponent(p.outreach.body)}`}>✉ Open in Mail</a>
            </div>
          </div>
        )}
      </div>

      <div className="btn-row">
        <button className="btn primary" onClick={go}>They said yes → Launch</button>
        <span className="small muted">Starter $499 · Professional $1,499 · Growth $99/mo — always offer Growth.</span>
      </div>
    </>
  );
}

/* ---------- Step 6: Launch ---------- */
function Launch({ p, setP, id, toast }) {
  const [domain, setDomain] = useState(p.launch?.domain || '');
  const [mode, setMode] = useState('existing');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  if (!p.generatedHtml) return <div className="card">Generate the site first.</div>;

  async function launch() {
    const d = mode === 'existing' ? domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '') : null;
    if (mode === 'existing' && !d) return toast('Enter the client’s domain', 'error');
    setBusy(true);
    try {
      const res = await fetch('/api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: id, domain: d }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setP({ ...p, launch: j.launch, status: 'launched' });
      toast('Site deployed 🎉', 'success');
    } catch (e) { toast('Launch failed: ' + e.message, 'error'); } finally { setBusy(false); }
  }
  async function check() {
    setChecking(true);
    try {
      const res = await fetch('/api/launch/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectName: p.launch.projectName, domain: p.launch.domain }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast(j.verified ? `✅ ${p.launch.domain} is verified and live` : 'Not verified yet — DNS still propagating.', j.verified ? 'success' : 'info');
    } catch (e) { toast(e.message, 'error'); } finally { setChecking(false); }
  }
  const copy = (t) => navigator.clipboard.writeText(t).then(() => toast('Copied', 'success'));
  const L = p.launch;

  return (
    <>
      <div className="card">
        <div className="card-title">Domain</div>
        <div className="chips" style={{ marginBottom: 14 }}>
          {[['existing', 'Existing domain'], ['new', 'Needs a new domain'], ['none', 'No domain — deploy only']].map(([m, label]) =>
            <div key={m} className={'chip' + (mode === m ? ' on' : '')} onClick={() => setMode(m)}>{label}</div>)}
        </div>
        {mode === 'new' && <div className="hint" style={{ marginBottom: 12 }}>Buy the domain first (Namecheap, Porkbun, ~$10/yr), then pick “Existing domain”.</div>}
        {mode === 'existing' && <Field label="Client's domain" value={domain} onChange={setDomain} placeholder="supertacos.com" />}
      </div>

      <div className="card">
        <div className="card-title">Deploy live site</div>
        <button className="btn primary" onClick={launch} disabled={busy}>{busy ? <><span className="spinner" /> Deploying…</> : (L ? '↻ Redeploy' : '🚀 Launch site')}</button>
        {L && (
          <div style={{ marginTop: 14 }}>
            <a href={L.liveUrl} target="_blank" className="badge launched" style={{ textDecoration: 'none' }}>🟢 {L.liveUrl}</a>
            {L.domain && L.records?.length > 0 && (
              <>
                <h2>DNS records for {L.domain}</h2>
                <div className="hint" style={{ marginBottom: 10 }}>Add these at the client’s registrar. Propagation takes minutes to a few hours.</div>
                <table>
                  <thead><tr><th>Type</th><th>Name</th><th>Value</th><th></th></tr></thead>
                  <tbody>{L.records.map((r, i) => (
                    <tr key={i}><td>{r.type}</td><td className="mono">{r.name}</td><td className="mono">{r.value}</td>
                      <td><button className="btn ghost small" style={{ padding: '3px 8px' }} onClick={() => copy(r.value)}>⧉</button></td></tr>
                  ))}</tbody>
                </table>
                <div className="btn-row"><button className="btn" onClick={check} disabled={checking}>{checking ? <span className="spinner" /> : '⟳ Check domain status'}</button></div>
              </>
            )}
            <div className="card" style={{ marginTop: 18, background: 'var(--bg)' }}>
              <div className="card-title">✓ Post-launch checklist</div>
              {['Test on desktop, mobile, and tablet', 'Submit a test contact form', 'Tap every phone link on a real phone', 'Check the map pin is exact', 'Confirm reviews display correctly', 'Set the monthly maintenance reminder (Growth plan)'].map(s => <div key={s} className="small">☐ {s}</div>)}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
