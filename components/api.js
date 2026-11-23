'use client';
// Tiny fetch helpers for the client components.

export async function api(url, opts = {}) {
  const init = { method: opts.method || 'GET', headers: {} };
  if (opts.body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  let res;
  try { res = await fetch(url, init); }
  catch { throw new Error('Could not reach the server. Check your connection and try again.'); }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status; err.details = data?.details;
    throw err;
  }
  return data;
}

export const fmtInt = n => (Number(n) || 0).toLocaleString();
export const fmtUsd = n => (n == null ? '—' : '$' + Number(n).toFixed(n < 1 ? 3 : 2));
export function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: s > 86400 * 300 ? 'numeric' : undefined });
}
export function dateTime(ts) {
  return ts ? new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}
