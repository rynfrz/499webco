// Hands a form submission to every connected integration that handles leads.
import { listInstances, getInstance, setInstanceStatus } from './store.js';
import { getProvider } from './registry.js';

export async function deliverToIntegrations(siteId, submission) {
  const out = [];
  const instances = (await listInstances(siteId)).filter(i => i.status === 'connected');
  for (const meta of instances) {
    const p = getProvider(meta.provider);
    if (!p?.onFormSubmission) continue;
    if (p.forms && !p.forms.includes(submission.form) && !p.forms.includes('*')) continue;
    const inst = await getInstance(siteId, meta.provider, { withSecrets: true });
    try {
      // Each delivery is time-boxed so one slow provider cannot hold up the visitor.
      await Promise.race([
        p.onFormSubmission({ config: inst.config, secrets: inst.secrets, submission }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Timed out')), 8000))
      ]);
      out.push({ provider: meta.provider, ok: true });
    } catch (e) {
      const msg = String(e.message || e).slice(0, 200);
      out.push({ provider: meta.provider, ok: false, error: msg });
      if (e.auth) await setInstanceStatus(siteId, meta.provider, 'error', msg).catch(() => {});
    }
  }
  return out;
}
