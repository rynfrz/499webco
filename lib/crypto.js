// Encryption at rest for integration credentials (AES-256-GCM).
// The key is derived from INTEGRATION_SECRET if set, otherwise SESSION_SECRET,
// so no extra setup is needed; rotating that secret invalidates stored
// credentials (integrations then show "Configuration Required").
import crypto from 'crypto';

function key() {
  const s = process.env.INTEGRATION_SECRET || process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET is missing or too short; cannot protect credentials.');
  return crypto.createHash('sha256').update('wfl-integrations:' + s).digest();
}

export function encryptJson(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return 'v1.' + [iv, cipher.getAuthTag(), data].map(b => b.toString('base64url')).join('.');
}

export function decryptJson(token) {
  try {
    const [v, iv, tag, data] = String(token).split('.');
    if (v !== 'v1') return {};
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8'));
  } catch { return {}; }
}

export function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
export function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }

/** Sign a small payload (OAuth state, etc.) so it cannot be forged or replayed after expiry. */
export function signState(payload, ttlMs = 15 * 60 * 1000) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString('base64url');
  const sig = crypto.createHmac('sha256', key()).update(body).digest('base64url');
  return body + '.' + sig;
}
export function verifyState(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', key()).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return p.exp > Date.now() ? p : null; } catch { return null; }
}
