// Bridge between the renderer and the integrations registry.
// (The registry itself is filled in by lib/integrations/registry.js.)
import { listInstances } from './store.js';
import { getProvider } from './registry.js';

/**
 * Build what the renderer needs for a site's connected integrations:
 *   head / bodyEnd snippets (trusted provider templates only),
 *   a section renderer for integration blocks,
 *   and the extra hosts the Content-Security-Policy must allow.
 */
export async function integrationRenderContext(siteId, { editMode = false } = {}) {
  const instances = (await listInstances(siteId)).filter(i => i.status === 'connected');
  const byProvider = new Map(instances.map(i => [i.provider, i]));
  const head = [], bodyEnd = [], scriptHosts = [], frameHosts = [], connectHosts = [];
  const attrs = {};
  let relaxed = false;
  for (const inst of instances) {
    const p = getProvider(inst.provider);
    if (!p) continue;
    const ctx = { config: inst.config, siteId, editMode };
    if (!editMode) {
      if (p.head) { const h = p.head(ctx); if (h) head.push(h); }
      if (p.bodyEnd) { const b = p.bodyEnd(ctx); if (b) bodyEnd.push(b); }
      if (p.runtime) Object.assign(attrs, p.runtime(ctx) || {});
    }
    if (p.csp?.relaxed) relaxed = true;
    scriptHosts.push(...(p.csp?.script || []));
    frameHosts.push(...(p.csp?.frame || []));
    connectHosts.push(...(p.csp?.connect || []));
  }
  return {
    integrations: { head, bodyEnd, attrs },
    renderIntegration(section) {
      const inst = byProvider.get(section.integration?.provider);
      const p = inst && getProvider(inst.provider);
      if (!p?.renderSection) return '';
      try { return p.renderSection({ kind: section.integration.kind, config: inst.config, placement: section.integration.config || {}, siteId, editMode }) || ''; }
      catch { return ''; }
    },
    csp: { scriptHosts, frameHosts, connectHosts, relaxed },
    connected: instances.map(i => i.provider)
  };
}
