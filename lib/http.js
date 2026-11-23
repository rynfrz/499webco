// Small helpers shared by route handlers.
import { NextResponse } from 'next/server';
import { getSettings } from './db.js';

/** Wrap a handler so thrown {status, message} objects and errors become JSON responses. */
export function handle(fn) {
  return async (req, ctx) => {
    try { return await fn(req, ctx || {}); }
    catch (e) {
      const status = Number.isInteger(e?.status) ? e.status : 500;
      if (status >= 500) console.error('[api]', req?.method, req?.url, e);
      return NextResponse.json({ error: e?.message || 'Something went wrong', ...(e?.errors ? { details: e.errors } : {}) }, { status });
    }
  };
}

export async function readJson(req) {
  try { return await req.json(); } catch { throw { status: 400, message: 'Invalid request body' }; }
}

/** The public origin of this platform (used in rendered sites and emails). */
export async function platformOrigin(req) {
  const s = await getSettings();
  if (s.previewDomain) return 'https://' + String(s.previewDomain).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return new URL(req.url).origin;
}

export const json = (data, init) => NextResponse.json(data, init);
