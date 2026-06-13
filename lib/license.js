// Offline license verification (Ed25519). You hold the PRIVATE key and mint
// signed licenses bound to each buyer's domain; the app embeds only the PUBLIC
// key and verifies. A key can't be forged without your private key.
//
// LICENSING IS OFF until you paste your public key below — so this file is safe
// to ship/commit without locking anyone out. Once PUBLIC_KEY_PEM is set, every
// instance must provide a valid LICENSE_KEY (env var) for the admin studio.
import crypto from 'crypto';

// Paste your Ed25519 public key here (run: node scripts/generate-keypair.mjs).
// Leave blank to disable licensing entirely (open/dev mode).
const PUBLIC_KEY_PEM = ``;

/**
 * @returns {{enforced:boolean, ok:boolean, reason?:string, data?:object}}
 */
export function licenseStatus(license, host) {
  if (!PUBLIC_KEY_PEM.trim()) return { enforced: false, ok: true };
  const h = String(host || '').toLowerCase().split(':')[0];
  if (h === 'localhost' || h.startsWith('127.')) return { enforced: true, ok: true }; // local dev
  if (!license) return { enforced: true, ok: false, reason: 'No LICENSE_KEY is set on this deployment.' };
  try {
    const [p, s] = String(license).split('.');
    if (!p || !s) return { enforced: true, ok: false, reason: 'Malformed license key.' };
    const payload = Buffer.from(p, 'base64url');
    const sig = Buffer.from(s, 'base64url');
    if (!crypto.verify(null, payload, PUBLIC_KEY_PEM, sig)) {
      return { enforced: true, ok: false, reason: 'License signature is invalid.' };
    }
    const data = JSON.parse(payload.toString('utf8'));
    if (data.expires && Date.now() > data.expires) return { enforced: true, ok: false, reason: 'License has expired.' };
    const d = String(data.domain || '').toLowerCase();
    const domainOk = !d || h === d || h.endsWith('.' + d);
    if (!domainOk) return { enforced: true, ok: false, reason: `This license is registered to ${d}, not ${h}.` };
    return { enforced: true, ok: true, data };
  } catch {
    return { enforced: true, ok: false, reason: 'License key could not be read.' };
  }
}
