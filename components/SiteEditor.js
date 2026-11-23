'use client';
// The visual website editor (shared by the studio and the customer dashboard).
//
// The canvas is the real rendered page in a sandboxed iframe. Clicking text
// edits it in place; clicking an image or a link opens a small inspector.
// Every change is sent to the server as a named, validated operation, the
// draft autosaves, and nothing reaches the public site until "Publish".
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api, dateTime, timeAgo } from './api';
import { useJobRunner } from './BuildPanel';
import './editor.css';

const DEVICES = [['desktop', 'Desktop', '100%'], ['tablet', 'Tablet', '768px'], ['phone', 'Phone', '390px']];

function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="wed-modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'wed-modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="wed-modal-head"><h2>{title}</h2><button className="wed-x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="wed-modal-body">{children}</div>
      </div>
    </div>
  );
}

function MediaPicker({ siteId, current, onPick, toast }) {
  const [media, setMedia] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api(`/api/sites/${siteId}/media`).then(d => setMedia(d.media)).catch(() => setMedia([]));
  useEffect(() => { load(); }, [siteId]); // eslint-disable-line
  async function upload(files) {
    const list = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!list.length) return;
    setBusy(true);
    let last = null;
    for (const f of list) {
      try {
        const blob = await downscale(f);
        const fd = new FormData();
        fd.append('file', blob, f.name);
        const res = await fetch(`/api/sites/${siteId}/media`, { method: 'POST', body: fd });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        last = d.media;
      } catch (e) { toast(e.message || 'Upload failed', 'error'); }
    }
    setBusy(false);
    await load();
    if (last && list.length === 1) onPick(last);
  }
  return (
    <div>
      <label className="wed-btn primary" style={{ display: 'inline-flex' }}>{busy ? 'Uploading…' : '⬆ Upload a photo'}
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple hidden onChange={e => { upload(e.target.files); e.target.value = ''; }} />
      </label>
      <p className="wed-hint">JPG, PNG or WebP. Large photos are resized automatically. Only upload images you own or have the right to use.</p>
      {!media ? <p className="wed-hint">Loading…</p> : media.length === 0 ? <p className="wed-hint">No photos yet.</p> : (
        <div className="wed-media">
          {media.map(m => (
            <button key={m.id} className={'wed-thumb' + (m.url === current ? ' on' : '')} onClick={() => onPick(m)} title={m.name}>
              <img src={m.url} alt={m.alt || ''} loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function downscale(file, maxDim = 2000, quality = 0.85) {
  return new Promise(resolve => {
    if (file.type === 'image/gif' || file.size < 350 * 1024) return resolve(file);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img;
      const s = Math.min(1, maxDim / Math.max(w, h));
      w = Math.round(w * s); h = Math.round(h * s);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob(b => resolve(b || file), file.type === 'image/png' && file.size < 1500 * 1024 ? 'image/png' : 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export default function SiteEditor({ siteId, role = 'owner', backHref = '/dashboard', backLabel = 'Dashboard', initialPage = null, openPages = false }) {
  const [serverRole, setServerRole] = useState(null);
  const staff = (serverRole || role) === 'staff';
  const [site, setSite] = useState(null);
  const [pageId, setPageId] = useState(initialPage);
  const [canvas, setCanvas] = useState('');
  const [device, setDevice] = useState('desktop');
  const [preview, setPreview] = useState(false);
  const [saveState, setSaveState] = useState('saved');     // saved | dirty | saving | error | conflict
  const [sel, setSel] = useState(null);                    // inspector selection
  const [modal, setModal] = useState(openPages ? { type: 'pages', adding: true } : null);
  const [tipOff, setTipOff] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [busy, setBusy] = useState('');
  const frame = useRef(null);
  const rev = useRef(0);
  const pending = useRef(new Map());                       // field edits waiting to be saved
  const timer = useRef(null);
  const saving = useRef(null);
  const restoreScroll = useRef(null);
  const editing = useRef(false);

  const toast = useCallback((text, type = 'ok') => { setToastMsg({ text, type }); setTimeout(() => setToastMsg(null), 4200); }, []);
  const page = useMemo(() => site?.pages?.find(p => p.id === pageId) || null, [site, pageId]);
  const livePages = useMemo(() => (site?.pages || []).filter(p => p.status !== 'archived').sort((a, b) => a.order - b.order), [site]);
  const post = msg => frame.current?.contentWindow?.postMessage({ wfl: 1, ...msg }, '*');

  // ---- loading ---------------------------------------------------------------
  const loadCanvas = useCallback(async (pid, keepScroll = false) => {
    if (keepScroll) {
      restoreScroll.current = await new Promise(resolve => {
        const t = setTimeout(() => resolve(0), 250);
        const once = e => { if (e.source === frame.current?.contentWindow && e.data?.wfl && e.data.type === 'scroll') { clearTimeout(t); window.removeEventListener('message', once); resolve(e.data.y); } };
        window.addEventListener('message', once);
        post({ type: 'getScroll' });
      });
    } else restoreScroll.current = 0;
    const d = await api(`/api/sites/${siteId}/render?page=${encodeURIComponent(pid || '')}`);
    setCanvas(d.html);
    return d;
  }, [siteId]); // eslint-disable-line

  const loadSite = useCallback(async () => {
    const d = await api('/api/sites/' + siteId);
    setSite(d.site); rev.current = d.site.rev; setServerRole(d.role);
    return d.site;
  }, [siteId]);

  useEffect(() => {
    (async () => {
      try {
        const s = await loadSite();
        if (s.legacy) return;
        const first = (s.pages.find(p => p.id === initialPage) || s.pages.filter(p => p.status !== 'archived').sort((a, b) => a.order - b.order)[0]);
        if (first) { setPageId(first.id); await loadCanvas(first.id); }
      } catch (e) { setLoadErr(e.message); }
    })();
  }, [siteId]); // eslint-disable-line

  // ---- saving ----------------------------------------------------------------
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (saving.current) await saving.current.catch(() => {});
    if (!pending.current.size) return true;
    const ops = [...pending.current.values()];
    pending.current = new Map();
    setSaveState('saving');
    saving.current = (async () => {
      try {
        const d = await api('/api/sites/' + siteId, { method: 'PATCH', body: { rev: rev.current, ops } });
        rev.current = d.rev;
        setSaveState(pending.current.size ? 'dirty' : 'saved');
        setSite(s => (s ? { ...s, dirty: true } : s));
        return true;
      } catch (e) {
        if (e.status === 409) { setSaveState('conflict'); return false; }
        // Put the edits back so nothing typed is lost, and say so.
        for (const op of ops) { const k = opKey(op); if (!pending.current.has(k)) pending.current.set(k, op); }
        setSaveState('error');
        toast(e.message, 'err');
        return false;
      } finally { saving.current = null; }
    })();
    return saving.current;
  }, [siteId, toast]);

  const opKey = op => `${op.pageId}|${op.sectionId || ''}|${op.key}`;
  const queueField = useCallback((scope, key, value) => {
    const op = { op: 'field.set', pageId: scope.pageId, sectionId: scope.sectionId, key, value };
    pending.current.set(opKey(op), op);
    setSaveState('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 900);
  }, [flush]);

  /** Structural change: save pending text first, apply, then refresh the canvas. */
  const structural = useCallback(async (ops, { reload = true, keepScroll = true, quiet = false } = {}) => {
    const ok = await flush();
    if (!ok && saveStateRef.current === 'conflict') return null;
    setBusy('op');
    try {
      const d = await api('/api/sites/' + siteId, { method: 'PATCH', body: { rev: rev.current, ops: Array.isArray(ops) ? ops : [ops] } });
      rev.current = d.rev;
      if (d.site) setSite(d.site);
      setSaveState('saved');
      if (reload) await loadCanvas(pageIdRef.current, keepScroll);
      return d;
    } catch (e) {
      if (e.status === 409) setSaveState('conflict');
      else if (!quiet) toast(e.message, 'err');
      return null;
    } finally { setBusy(''); }
  }, [flush, siteId, loadCanvas, toast]);

  const saveStateRef = useRef(saveState); saveStateRef.current = saveState;
  const pageIdRef = useRef(pageId); pageIdRef.current = pageId;
  const siteRef = useRef(site); siteRef.current = site;

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    const warn = e => { if (pending.current.size || saving.current || editing.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  // ---- messages from the canvas ------------------------------------------------
  useEffect(() => {
    const onMsg = e => {
      if (e.source !== frame.current?.contentWindow) return;
      const m = e.data;
      if (!m || !m.wfl) return;
      if (m.type === 'ready') { if (restoreScroll.current) post({ type: 'setScroll', y: restoreScroll.current }); post({ type: 'preview', on: previewRef.current }); }
      else if (m.type === 'editing') { editing.current = m.on; if (m.on) { setSel(null); setTipOff(true); } }
      else if (m.type === 'field') queueField(m.scope, m.key, m.value);
      else if (m.type === 'select') setSel(m);
      else if (m.type === 'deselect') setSel(null);
      else if (m.type === 'navigate') goToPath(m.href);
      else if (m.type === 'section') sectionAction(m.action, m.sectionId);
      else if (m.type === 'item') structural({ op: 'item.edit', pageId: m.scope.pageId, sectionId: m.scope.sectionId, index: m.index, action: m.action });
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }); // re-bound each render so handlers see current state

  const previewRef = useRef(preview); previewRef.current = preview;
  useEffect(() => { post({ type: 'preview', on: preview }); if (preview) setSel(null); }, [preview]); // eslint-disable-line

  async function switchPage(id) {
    if (id === pageId) return;
    post({ type: 'blur' });
    await flush();
    setSel(null); setPageId(id);
    try { await loadCanvas(id); } catch (e) { toast(e.message, 'err'); }
  }
  function goToPath(href) {
    const path = String(href || '').split('#')[0].split('?')[0];
    const norm = path === '/' || path === '' ? '' : path.replace(/^\/+|\/+$/g, '');
    const target = (siteRef.current?.pages || []).find(p => p.status !== 'archived' && p.slug === norm);
    if (target) switchPage(target.id);
  }

  function sectionAction(action, sectionId) {
    const pid = pageIdRef.current;
    const sec = siteRef.current?.pages.find(p => p.id === pid)?.sections.find(s => s.id === sectionId);
    if (action === 'up' || action === 'down') return structural({ op: 'section.move', pageId: pid, sectionId, dir: action });
    if (action === 'hide' || action === 'show') return structural({ op: 'section.hide', pageId: pid, sectionId, hidden: action === 'hide' });
    if (action === 'duplicate') return structural({ op: 'section.duplicate', pageId: pid, sectionId });
    if (action === 'remove') { if (confirm(`Remove “${sec?.name || 'this section'}” from the page? You can bring it back from History.`)) structural({ op: 'section.remove', pageId: pid, sectionId }); return; }
    if (action === 'options') return setModal({ type: 'options', sectionId });
    if (action === 'add') return setModal({ type: 'addSection', afterSectionId: sectionId });
    if (action === 'ai') return setModal({ type: 'ai', sectionId });
    if (action === 'html') return setModal({ type: 'html', sectionId });
  }

  function applyField(scope, key, value, live = true) {
    queueField(scope, key, value);
    if (live) post({ type: 'setField', scope, key, value });
  }

  // ---- publish -----------------------------------------------------------------
  async function publish() {
    post({ type: 'blur' });
    const ok = await flush();
    if (!ok) return;
    setPublishing(true);
    try {
      const d = await api(`/api/sites/${siteId}/publish`, { method: 'POST', body: {} });
      await loadSite();
      if (d.live && !d.live.ok) toast(d.live.error, 'err');
      else toast(d.live?.ok ? 'Published. Your live website is updated.' : 'Published. Your changes are live on the preview address.');
    } catch (e) { toast(e.message, 'err'); } finally { setPublishing(false); }
  }

  async function reloadAfterConflict() {
    pending.current = new Map();
    const s = await loadSite();
    const keep = s.pages.find(p => p.id === pageId && p.status !== 'archived') || s.pages.filter(p => p.status !== 'archived')[0];
    setPageId(keep.id);
    await loadCanvas(keep.id);
    setSaveState('saved');
  }

  if (loadErr) return <div className="wed-center"><div className="wed-card"><h2>We couldn’t open the editor</h2><p>{loadErr}</p><a className="wed-btn" href={backHref}>← {backLabel}</a></div></div>;
  if (!site) return <div className="wed-center"><div className="wed-spin" /></div>;
  if (site.legacy) return (
    <div className="wed-center"><div className="wed-card">
      <h2>This website needs a one-time upgrade first</h2>
      <p>It was built with the classic single-page builder, so it can’t be edited here yet. {staff ? 'Run a Platform Conversion (keeps the look) or an upgrade from the project’s Website tab.' : 'Your web team can upgrade it for you, usually the same day.'}</p>
      <a className="wed-btn" href={backHref}>← {backLabel}</a>
    </div></div>
  );

  const saveLabel = { saved: site.dirty ? 'All changes saved · not published yet' : 'Everything is published', dirty: 'Unsaved changes…', saving: 'Saving…', error: 'Not saved, retrying when you edit', conflict: 'Changed elsewhere' }[saveState];
  const width = DEVICES.find(d => d[0] === device)[2];

  return (
    <div className="wed">
      {/* ---------------------------------------------------------------- top bar */}
      <header className="wed-top">
        <a className="wed-back" href={backHref}>← {backLabel}</a>
        <select className="wed-pages" value={pageId || ''} onChange={e => switchPage(e.target.value)} aria-label="Page">
          {livePages.map(p => <option key={p.id} value={p.id}>{p.title}{p.status === 'draft' ? '  (draft)' : ''}</option>)}
        </select>
        <button className="wed-btn" onClick={() => setModal({ type: 'pages' })}>Pages</button>
        <button className="wed-btn" onClick={() => setModal({ type: 'pageSettings', pageId })} disabled={!page}>Page settings</button>
        <div className="wed-seg" role="group" aria-label="Screen size">
          {DEVICES.map(([k, l]) => <button key={k} className={device === k ? 'on' : ''} onClick={() => setDevice(k)}>{l}</button>)}
        </div>
        <div className="wed-seg"><button className={!preview ? 'on' : ''} onClick={() => setPreview(false)}>Edit</button><button className={preview ? 'on' : ''} onClick={() => setPreview(true)}>Preview</button></div>
        <span className={'wed-save ' + saveState} role="status">{saveLabel}</span>
        <button className="wed-btn" onClick={() => setModal({ type: 'history' })}>History</button>
        <button className="wed-btn" onClick={() => setModal({ type: 'style' })}>{staff ? 'Design' : 'Brand colours'}</button>
        <button className="wed-btn primary" onClick={publish} disabled={publishing || saveState === 'conflict' || (!site.dirty && saveState === 'saved' && site.published)}>{publishing ? 'Publishing…' : 'Publish'}</button>
      </header>

      {saveState === 'conflict' && (
        <div className="wed-banner">This website was changed in another window or by your web team. <button className="wed-btn" onClick={reloadAfterConflict}>Load the latest version</button></div>
      )}
      {page?.status === 'draft' && <div className="wed-banner info">This page is a draft. It is not part of your public website until you set it to “Published” in Page settings and publish. <button className="wed-btn" onClick={() => setModal({ type: 'pageSettings', pageId })}>Page settings</button></div>}

      {/* ---------------------------------------------------------------- canvas */}
      <div className="wed-stage">
        <div className="wed-frame" style={{ width }}>
          <iframe ref={frame} title="Your website" sandbox="allow-scripts" srcDoc={canvas} />
          {busy === 'op' && <div className="wed-veil"><div className="wed-spin" /></div>}
        </div>

        {!preview && !sel && !tipOff && (
          <aside className="wed-tip">
            <b>How to edit</b>
            <span>Click any text to change it.</span>
            <span>Click a photo to replace it.</span>
            <span>Click a button to change where it goes.</span>
            <span>Hover a section for move, hide and more.</span>
          </aside>
        )}

        {/* ---- inspector: link ---- */}
        {sel?.kind === 'link' && (
          <LinkInspector key={sel.key + sel.scope.sectionId} sel={sel} pages={livePages} onClose={() => setSel(null)}
            onApply={v => { applyField(sel.scope, sel.key, v); setSel(null); }} />
        )}
        {/* ---- inspector: image ---- */}
        {(sel?.kind === 'image' || sel?.kind === 'bg') && (
          <aside className="wed-inspector">
            <div className="wed-ins-head"><b>{sel.kind === 'bg' ? 'Background image' : 'Photo'}</b><button className="wed-x" onClick={() => setSel(null)} aria-label="Close">×</button></div>
            {sel.kind === 'image' && (
              <>
                <label className="wed-label">Description (for accessibility and Google)</label>
                <input className="wed-input" defaultValue={sel.alt} placeholder="What is in this photo?" onBlur={e => { if (e.target.value !== sel.alt) { applyField(sel.scope, sel.key, { src: sel.src, alt: e.target.value }); setSel({ ...sel, alt: e.target.value }); } }} />
              </>
            )}
            <MediaPicker siteId={siteId} current={sel.src} toast={toast} onPick={m => { applyField(sel.scope, sel.key, sel.kind === 'bg' ? { src: m.url } : { src: m.url, alt: sel.alt || m.alt || '' }); setSel({ ...sel, src: m.url }); }} />
          </aside>
        )}
      </div>

      {/* ---------------------------------------------------------------- modals */}
      {modal?.type === 'pages' && <PagesModal site={site} staff={staff} siteId={siteId} current={pageId} startAdding={!!modal.adding} onClose={() => setModal(null)} toast={toast}
        onOpen={id => { setModal(null); switchPage(id); }} onSettings={id => setModal({ type: 'pageSettings', pageId: id })}
        run={async ops => structural(ops, { reload: false })}
        onAdded={async id => { const s = await loadSite(); setModal(null); if (s.pages.some(p => p.id === id)) { setPageId(id); await loadCanvas(id); } }} />}

      {modal?.type === 'pageSettings' && (() => {
        const pg = site.pages.find(p => p.id === modal.pageId);
        return pg ? <PageSettings page={pg} published={site.published} onClose={() => setModal(null)} onSave={async patch => {
          const d = await structural({ op: 'page.update', pageId: pg.id, ...patch }, { reload: pg.id === pageId });
          if (d) { setModal(null); const r = d.results?.[0]; toast(r?.redirect ? `Saved. The old address ${r.redirect.from} now redirects here.` : 'Page settings saved'); }
        }} /> : null;
      })()}

      {modal?.type === 'options' && (() => {
        const sec = page?.sections.find(s => s.id === modal.sectionId);
        if (!sec) return null;
        const set = (k, v) => structural({ op: 'section.options', pageId, sectionId: sec.id, options: { [k]: v } });
        return (
          <Modal title={`Style: ${sec.name}`} onClose={() => setModal(null)}>
            <p className="wed-hint">These presets use your site’s own colours and spacing, so the section always stays on-brand.</p>
            {[['tone', 'Background'], ['spacing', 'Spacing'], ['align', 'Alignment']].map(([k, label]) => (
              <div key={k} style={{ marginBottom: 14 }}>
                <label className="wed-label">{label}</label>
                <div className="wed-seg wrap">{site.options.section[k].map(([v, l]) => <button key={v} className={(sec.options[k] || 'default') === v || (k === 'spacing' && sec.options[k] === v) ? 'on' : ''} onClick={() => set(k, v)}>{l}</button>)}</div>
              </div>
            ))}
            <div className="wed-actions"><button className="wed-btn primary" onClick={() => setModal(null)}>Done</button></div>
          </Modal>
        );
      })()}

      {modal?.type === 'addSection' && (
        <Modal title="Add a section" onClose={() => setModal(null)}>
          <p className="wed-hint">New sections automatically match your site’s design.</p>
          {site.integrationBlocks?.length > 0 && (
            <>
              <label className="wed-label">From your integrations</label>
              <div className="wed-grid" style={{ marginBottom: 14 }}>
                {site.integrationBlocks.map(b => (
                  <button key={b.provider + b.kind} className="wed-tile" title={b.description} onClick={async () => { const d = await structural({ op: 'integration.place', pageId, provider: b.provider, kind: b.kind, afterSectionId: modal.afterSectionId }); setModal(null); const id = d?.results?.[0]?.sectionId; if (id) setTimeout(() => post({ type: 'scrollTo', sectionId: id }), 400); }}>{b.label}<br /><span style={{ fontWeight: 400, color: '#667085', fontSize: 12 }}>{b.name}</span></button>
                ))}
              </div>
              <label className="wed-label">Content sections</label>
            </>
          )}
          <div className="wed-grid">
            {site.options.sectionTemplates.map(t => (
              <button key={t.key} className="wed-tile" onClick={async () => { const d = await structural({ op: 'section.add', pageId, template: t.key, afterSectionId: modal.afterSectionId }); setModal(null); const id = d?.results?.[0]?.sectionId; if (id) setTimeout(() => post({ type: 'scrollTo', sectionId: id }), 400); }}>{t.label}</button>
            ))}
          </div>
        </Modal>
      )}

      {modal?.type === 'history' && <HistoryModal siteId={siteId} staff={staff} onClose={() => setModal(null)} toast={toast}
        onChanged={async () => { setModal(null); await reloadAfterConflict(); }} />}

      {modal?.type === 'style' && <StyleModal site={site} staff={staff} onClose={() => setModal(null)}
        onApply={async ops => { const d = await structural(ops); if (d) { setModal(null); toast('Design updated'); } }} />}

      {modal?.type === 'ai' && staff && <AiSectionModal siteId={siteId} pageId={pageId} section={page?.sections.find(s => s.id === modal.sectionId)} onClose={() => setModal(null)} toast={toast}
        onDone={async () => { setModal(null); await loadSite(); await loadCanvas(pageId, true); toast('Section reworked'); }} flush={flush} />}

      {modal?.type === 'html' && staff && <HtmlModal siteId={siteId} pageId={pageId} sectionId={modal.sectionId} onClose={() => setModal(null)}
        onSave={async html => { const d = await structural({ op: 'section.html', pageId, sectionId: modal.sectionId, html }); if (d) { setModal(null); toast('Markup saved (sanitised)'); } }} />}

      {toastMsg && <div className={'wed-toast ' + toastMsg.type} role="status">{toastMsg.text}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------

function LinkInspector({ sel, pages, onApply, onClose }) {
  const [label, setLabel] = useState(() => (sel.html == null ? null : stripTags(sel.html)));
  const kindOf = h => (/^tel:/.test(h) ? 'tel' : /^mailto:/.test(h) ? 'mail' : /^https?:/.test(h) ? 'url' : 'page');
  const [kind, setKind] = useState(kindOf(sel.href));
  const [href, setHref] = useState(sel.href);
  const pageHref = pages.some(p => p.path === href.split('#')[0]) ? href.split('#')[0] : '/';
  const value = () => {
    if (kind === 'page') return pageHref;
    if (kind === 'tel') return 'tel:' + href.replace(/^tel:/, '').replace(/[^\d+]/g, '');
    if (kind === 'mail') return 'mailto:' + href.replace(/^mailto:/, '').trim();
    return /^https?:\/\//.test(href) ? href : 'https://' + href.replace(/^\/+/, '');
  };
  return (
    <aside className="wed-inspector">
      <div className="wed-ins-head"><b>Button or link</b><button className="wed-x" onClick={onClose} aria-label="Close">×</button></div>
      {label != null && (<><label className="wed-label">Text</label><input className="wed-input" value={label} onChange={e => setLabel(e.target.value)} autoFocus /></>)}
      <label className="wed-label">When clicked, go to</label>
      <div className="wed-seg wrap" style={{ marginBottom: 8 }}>
        {[['page', 'A page'], ['url', 'A web address'], ['tel', 'Phone call'], ['mail', 'Email']].map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); if (k !== kindOf(href)) setHref(k === 'page' ? '/' : ''); }}>{l}</button>)}
      </div>
      {kind === 'page' && <select className="wed-input" value={pageHref} onChange={e => setHref(e.target.value)}>{pages.map(p => <option key={p.id} value={p.path}>{p.title}{p.status === 'draft' ? ' (draft)' : ''}</option>)}</select>}
      {kind === 'url' && <input className="wed-input" value={href} onChange={e => setHref(e.target.value)} placeholder="https://…" />}
      {kind === 'tel' && <input className="wed-input" value={href.replace(/^tel:/, '')} onChange={e => setHref(e.target.value)} placeholder="(404) 555-0100" inputMode="tel" />}
      {kind === 'mail' && <input className="wed-input" value={href.replace(/^mailto:/, '')} onChange={e => setHref(e.target.value)} placeholder="hello@yourbusiness.com" inputMode="email" />}
      <div className="wed-actions"><button className="wed-btn primary" onClick={() => onApply({ href: value(), ...(label != null ? { html: escapeText(label) } : {}) })}>Apply</button><button className="wed-btn" onClick={onClose}>Cancel</button></div>
    </aside>
  );
}
const stripTags = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent || ''; };
const escapeText = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function PageSettings({ page, onSave, onClose, published }) {
  const [f, setF] = useState({ title: page.title, navLabel: page.navLabel, slug: page.slug, inNav: page.inNav, status: page.status, seoTitle: page.seo.title, seoDesc: page.seo.description, noindex: page.seo.noindex });
  const [busy, setBusy] = useState(false);
  const home = page.slug === '';
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  async function save() {
    setBusy(true);
    const patch = { title: f.title, navLabel: f.navLabel, inNav: f.inNav, seo: { title: f.seoTitle, description: f.seoDesc, noindex: f.noindex } };
    if (!home) { patch.status = f.status; if (f.slug !== page.slug) { patch.slug = f.slug; patch.wasPublished = published && page.status === 'published'; } }
    await onSave(patch);
    setBusy(false);
  }
  return (
    <Modal title={`Page settings: ${page.title}`} onClose={onClose}>
      <div className="wed-row">
        <div><label className="wed-label">Page title</label><input className="wed-input" value={f.title} onChange={e => set('title', e.target.value)} /></div>
        <div><label className="wed-label">Name in the menu</label><input className="wed-input" value={f.navLabel} onChange={e => set('navLabel', e.target.value)} /></div>
      </div>
      <label className="wed-label">Page address</label>
      <div className="wed-addr"><span>yourwebsite.com/</span><input className="wed-input" value={home ? '' : f.slug} disabled={home} onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9/\-]+/g, '-'))} placeholder={home ? '(home page)' : 'page-address'} /></div>
      {!home && f.slug !== page.slug && published && page.status === 'published' && <p className="wed-hint">The old address will automatically send visitors (and Google) to the new one.</p>}
      <div className="wed-row">
        <label className="wed-check"><input type="checkbox" checked={f.inNav} onChange={e => set('inNav', e.target.checked)} /> Show in the menu</label>
        {!home && (
          <div><label className="wed-label">Status</label>
            <div className="wed-seg"><button className={f.status === 'published' ? 'on' : ''} onClick={() => set('status', 'published')}>Published</button><button className={f.status === 'draft' ? 'on' : ''} onClick={() => set('status', 'draft')}>Draft (hidden)</button></div></div>
        )}
      </div>
      <h3 className="wed-h3">How this page appears on Google</h3>
      <label className="wed-label">Search title <span className="wed-count">{f.seoTitle.length}/60</span></label>
      <input className="wed-input" value={f.seoTitle} onChange={e => set('seoTitle', e.target.value)} placeholder={page.title} />
      <label className="wed-label">Search description <span className="wed-count">{f.seoDesc.length}/155</span></label>
      <textarea className="wed-input" rows={3} value={f.seoDesc} onChange={e => set('seoDesc', e.target.value)} placeholder="One or two sentences that make someone want to click." />
      <label className="wed-check"><input type="checkbox" checked={f.noindex} onChange={e => set('noindex', e.target.checked)} /> Hide this page from search engines</label>
      <div className="wed-actions"><button className="wed-btn primary" onClick={save} disabled={busy || !f.title.trim()}>{busy ? 'Saving…' : 'Save'}</button><button className="wed-btn" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}

function PagesModal({ site, staff, siteId, current, onClose, onOpen, onSettings, run, onAdded, toast, startAdding = false }) {
  const [adding, setAdding] = useState(startAdding);
  const [form, setForm] = useState({ type: 'standard', title: '', request: '', useAi: false });
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const pump = useJobRunner(useCallback(j => setJob(j), []));
  const pages = site.pages.filter(p => p.status !== 'archived').sort((a, b) => a.order - b.order);
  const archived = site.pages.filter(p => p.status === 'archived');
  const hasAi = site.engine !== 'demo';

  async function add() {
    if (!form.title.trim()) return toast('Give the page a title', 'err');
    setBusy(true);
    try {
      if (form.useAi && form.request.trim()) {
        const d = await api(`/api/sites/${siteId}/regen`, { method: 'POST', body: { kind: 'add', title: form.title, type: form.type, instruction: form.request } });
        setJob(d.job);
        const done = await pump(d.job.id);
        if (done?.status === 'done' && done.result?.pageId) { toast('Your new page is ready to review'); await onAdded(done.result.pageId); }
        else toast(done?.error || 'The page could not be built. Please try again.', 'err');
      } else {
        const d = await run({ op: 'page.add', type: form.type, title: form.title });
        const id = d?.results?.[0]?.pageId;
        if (id) { toast('Page added as a draft'); await onAdded(id); }
      }
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); setJob(null); }
  }

  return (
    <Modal title="Pages" onClose={onClose} wide>
      {!adding ? (
        <>
          <ul className="wed-list">
            {pages.map((p, i) => (
              <li key={p.id} className={p.id === current ? 'on' : ''}>
                <div className="wed-ord"><button disabled={i < 2} onClick={() => run({ op: 'page.move', pageId: p.id, dir: 'up' })} aria-label="Move up">▲</button><button disabled={i === 0 || i === pages.length - 1} onClick={() => run({ op: 'page.move', pageId: p.id, dir: 'down' })} aria-label="Move down">▼</button></div>
                <div className="wed-pg"><b>{p.title}</b><span>{p.path}{p.status === 'draft' ? ' · draft' : ''}{!p.inNav ? ' · not in menu' : ''}</span></div>
                <button className="wed-btn" onClick={() => onOpen(p.id)}>Edit</button>
                <button className="wed-btn" onClick={() => onSettings(p.id)}>Settings</button>
                {p.slug !== '' && <button className="wed-btn danger" onClick={() => { if (confirm(`Archive “${p.title}”? It will be removed from your website when you next publish. You can restore it later.`)) run({ op: 'page.archive', pageId: p.id }); }}>Archive</button>}
              </li>
            ))}
          </ul>
          {archived.length > 0 && (
            <details className="wed-details"><summary>Archived pages ({archived.length})</summary>
              <ul className="wed-list">{archived.map(p => (
                <li key={p.id}><div className="wed-pg"><b>{p.title}</b><span>archived</span></div>
                  <button className="wed-btn" onClick={() => run({ op: 'page.restore', pageId: p.id })}>Restore as draft</button>
                  <button className="wed-btn danger" onClick={() => { if (confirm(`Permanently delete “${p.title}”? This cannot be undone.`)) run({ op: 'page.delete', pageId: p.id }); }}>Delete</button></li>))}</ul>
            </details>
          )}
          <div className="wed-actions"><button className="wed-btn primary" onClick={() => setAdding(true)}>+ Add a page</button></div>
        </>
      ) : (
        <>
          <p className="wed-hint">A new page uses your site’s colours, fonts, menu and footer automatically. It starts as a draft, so you can get it right before it goes public.</p>
          <label className="wed-label">What kind of page?</label>
          <div className="wed-grid">{site.options.pageTypes.map(([k, l]) => <button key={k} className={'wed-tile' + (form.type === k ? ' on' : '')} onClick={() => setForm(f => ({ ...f, type: k }))}>{l}</button>)}</div>
          <label className="wed-label" style={{ marginTop: 14 }}>Page title</label>
          <input className="wed-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Commercial Roof Repair" autoFocus />
          {hasAi && (
            <>
              <label className="wed-check" style={{ marginTop: 12 }}><input type="checkbox" checked={form.useAi} onChange={e => setForm(f => ({ ...f, useAi: e.target.checked }))} /> Write this page for me</label>
              {form.useAi && (<><textarea className="wed-input" rows={3} value={form.request} onChange={e => setForm(f => ({ ...f, request: e.target.value }))} placeholder="Describe the page in a sentence or two. e.g. “Add a page for our commercial roof repair service.”" />
                <p className="wed-hint">We’ll write and design the page from what we know about your business. It takes about a minute, and you review it before anything is published.</p></>)}
            </>
          )}
          {job && <div className="wed-progress"><i style={{ width: Math.max(8, job.progress || 0) + '%' }} /><span>{job.stage || 'Working…'}</span></div>}
          <div className="wed-actions"><button className="wed-btn primary" onClick={add} disabled={busy}>{busy ? (form.useAi ? 'Building your page…' : 'Adding…') : 'Add page'}</button><button className="wed-btn" onClick={() => setAdding(false)} disabled={busy}>Back</button></div>
        </>
      )}
    </Modal>
  );
}

function HistoryModal({ siteId, staff, onClose, onChanged, toast }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const load = () => api(`/api/sites/${siteId}/versions`).then(setData).catch(e => toast(e.message, 'err'));
  useEffect(() => { load(); }, []); // eslint-disable-line
  async function act(action, v) {
    const msg = action === 'rollback'
      ? `Put the version from ${dateTime(v.createdAt)} back on your public website? Your current version stays in History.`
      : `Load the version from ${dateTime(v.createdAt)} into the editor? Your current draft is saved to History first. Nothing public changes until you publish.`;
    if (!confirm(msg)) return;
    setBusy(v.id + action);
    try {
      const d = await api(`/api/sites/${siteId}/versions`, { method: 'POST', body: { action, versionId: v.id } });
      if (d.live && !d.live.ok) toast(d.live.error, 'err'); else toast(action === 'rollback' ? 'That version is live again.' : 'Version loaded into the editor.');
      await onChanged();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(''); }
  }
  async function savePoint() {
    const label = prompt('Name this restore point', 'Before my changes');
    if (!label) return;
    try { await api(`/api/sites/${siteId}/versions`, { method: 'POST', body: { action: 'snapshot', label } }); toast('Restore point saved'); load(); } catch (e) { toast(e.message, 'err'); }
  }
  const kindLabel = { publish: 'Published', snapshot: 'Restore point', legacy: 'Original site', staging: 'Upgrade (staging)' };
  return (
    <Modal title="History" onClose={onClose} wide>
      <p className="wed-hint">Every time you publish, a copy is kept. You can put any earlier version back.</p>
      <div className="wed-actions" style={{ marginTop: 0, marginBottom: 12 }}><button className="wed-btn" onClick={savePoint}>+ Save a restore point now</button></div>
      {!data ? <div className="wed-spin" /> : (
        <ul className="wed-list">
          {data.versions.filter(v => staff || v.kind !== 'staging').map(v => (
            <li key={v.id}>
              <div className="wed-pg"><b>{kindLabel[v.kind] || v.kind}{v.id === data.publishedVersionId ? ' · on your website now' : ''}</b><span>{dateTime(v.createdAt)}{v.label ? ' · ' + v.label : ''}{v.createdByName ? ' · ' + v.createdByName : ''}</span></div>
              <a className="wed-btn" href={`/api/sites/${siteId}/preview/${v.id}`} target="_blank" rel="noopener">View</a>
              <button className="wed-btn" disabled={!!busy} onClick={() => act('restore', v)}>{busy === v.id + 'restore' ? '…' : 'Edit from this'}</button>
              {v.id !== data.publishedVersionId && v.kind !== 'staging' && <button className="wed-btn" disabled={!!busy} onClick={() => act('rollback', v)}>{busy === v.id + 'rollback' ? '…' : 'Make live'}</button>}
            </li>
          ))}
        </ul>
      )}
      {staff && data?.events?.length > 0 && (
        <details className="wed-details"><summary>Activity log ({data.events.length})</summary>
          <ul className="wed-log">{data.events.map(e => <li key={e.id}><span>{timeAgo(e.at)}</span> {e.type}{e.actor ? ' · ' + e.actor : ''}</li>)}</ul>
        </details>
      )}
    </Modal>
  );
}

function StyleModal({ site, staff, onClose, onApply }) {
  const t = site.tokens;
  const [c, setC] = useState({ ...t.colors });
  const [fonts, setFonts] = useState({ head: t.fonts.head, body: t.fonts.body });
  const [css, setCss] = useState(site.design?.css || '');
  const [motion, setMotion] = useState(t.motion);
  const hex = v => (/^#[0-9a-f]{6}$/i.test(v) ? v : '#000000');
  const color = (key, label) => (
    <div key={key}><label className="wed-label">{label}</label>
      <div className="wed-color"><input type="color" value={hex(c[key])} onChange={e => setC(x => ({ ...x, [key]: e.target.value }))} /><input className="wed-input" value={c[key]} onChange={e => setC(x => ({ ...x, [key]: e.target.value }))} /></div></div>
  );
  if (!staff) {
    return (
      <Modal title="Brand colours" onClose={onClose}>
        <p className="wed-hint">Change the two colours used for buttons and highlights across your whole website. Text colours adjust automatically so everything stays readable.</p>
        <div className="wed-row">{color('accent', 'Main colour')}{color('accent2', 'Second colour')}</div>
        <div className="wed-swatch" style={{ background: c.accent, color: '#fff' }}>Button preview</div>
        <div className="wed-actions"><button className="wed-btn primary" onClick={() => onApply({ op: 'brand.colors', accent: c.accent, accent2: c.accent2 })}>Apply to my website</button><button className="wed-btn" onClick={onClose}>Cancel</button></div>
      </Modal>
    );
  }
  return (
    <Modal title="Design system" onClose={onClose} wide>
      {site.design?.concept && <p className="wed-hint">{site.design.concept}</p>}
      <div className="wed-row3">{[['bg', 'Background'], ['surface', 'Surface'], ['text', 'Text'], ['muted', 'Muted text'], ['accent', 'Accent'], ['accent2', 'Accent 2'], ['border', 'Border'], ['onAccent', 'Text on accent']].map(([k, l]) => color(k, l))}</div>
      <div className="wed-row3" style={{ marginTop: 12 }}>
        <div><label className="wed-label">Heading font (Google Fonts)</label><input className="wed-input" value={fonts.head} onChange={e => setFonts(f => ({ ...f, head: e.target.value }))} /></div>
        <div><label className="wed-label">Body font</label><input className="wed-input" value={fonts.body} onChange={e => setFonts(f => ({ ...f, body: e.target.value }))} /></div>
        <div><label className="wed-label">Motion</label><select className="wed-input" value={motion} onChange={e => setMotion(e.target.value)}>{['none', 'subtle', 'moderate', 'expressive'].map(m => <option key={m}>{m}</option>)}</select></div>
      </div>
      <details className="wed-details"><summary>Design stylesheet (advanced)</summary>
        <textarea className="wed-input mono" rows={16} value={css} onChange={e => setCss(e.target.value)} spellCheck={false} />
        <p className="wed-hint">Sanitised on save. Shared by every page.</p>
      </details>
      <div className="wed-actions">
        <button className="wed-btn primary" onClick={() => onApply([{ op: 'design.tokens', tokens: { colors: c, fonts, motion } }, ...(css !== (site.design?.css || '') ? [{ op: 'design.css', css }] : [])])}>Save design</button>
        <button className="wed-btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

function AiSectionModal({ siteId, pageId, section, onClose, onDone, toast, flush }) {
  const [text, setText] = useState('');
  const [job, setJob] = useState(null);
  const pump = useJobRunner(useCallback(j => setJob(j), []));
  async function go() {
    await flush();
    try {
      const d = await api(`/api/sites/${siteId}/regen`, { method: 'POST', body: { kind: 'section', pageId, sectionId: section.id, instruction: text } });
      setJob(d.job);
      const done = await pump(d.job.id);
      if (done?.status === 'done') await onDone(); else toast(done?.error || 'Could not rework the section', 'err');
    } catch (e) { toast(e.message, 'err'); setJob(null); }
  }
  return (
    <Modal title={`Rework with AI: ${section?.name || ''}`} onClose={onClose}>
      <label className="wed-label">Direction (optional)</label>
      <textarea className="wed-input" rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="e.g. “Make this a two-column layout with the services as a ruled list; tighten the copy.” Leave blank for a fresh take." />
      <p className="wed-hint">Only this section is regenerated, inside the site’s design system. The current version is saved to History first.</p>
      {job && <div className="wed-progress"><i style={{ width: Math.max(8, job.progress || 0) + '%' }} /><span>{job.stage || 'Working…'}</span></div>}
      <div className="wed-actions"><button className="wed-btn primary" onClick={go} disabled={!!job}>{job ? 'Working…' : 'Rework section'}</button><button className="wed-btn" onClick={onClose} disabled={!!job}>Cancel</button></div>
    </Modal>
  );
}

function HtmlModal({ siteId, pageId, sectionId, onClose, onSave }) {
  const [html, setHtml] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api(`/api/sites/${siteId}/section?page=${pageId}&section=${sectionId}`).then(d => setHtml(d.html)).catch(() => setHtml('')); }, []); // eslint-disable-line
  return (
    <Modal title="Edit section markup" onClose={onClose} wide>
      <p className="wed-hint">Repair tool for staff. The markup is sanitised and its editable fields are re-detected when you save. Scripts, event handlers and unknown embeds are removed.</p>
      {html == null ? <div className="wed-spin" /> : <textarea className="wed-input mono" rows={20} value={html} onChange={e => setHtml(e.target.value)} spellCheck={false} />}
      <div className="wed-actions"><button className="wed-btn primary" disabled={busy || html == null} onClick={async () => { setBusy(true); await onSave(html); setBusy(false); }}>{busy ? 'Saving…' : 'Save markup'}</button><button className="wed-btn" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}
