// A small fixed-window rate limiter backed by Postgres (serverless functions
// share no memory, so the counter has to live in the database).
import { sql, initDb } from './db.js';

/**
 * Allow `limit` events per `windowSeconds` for `key`; throws {status: 429} beyond that.
 * One atomic upsert per call.
 */
export async function rateLimit(key, limit, windowSeconds) {
  await initDb();
  const now = Date.now();
  const cutoff = now - windowSeconds * 1000;
  // The window starts at the first event and lasts windowSeconds; it is not
  // aligned to the clock, so a burst cannot straddle two windows.
  const rows = await sql`INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, ${now}, 1)
                         ON CONFLICT (key) DO UPDATE SET
                           count = CASE WHEN rate_limits.window_start > ${cutoff} THEN rate_limits.count + 1 ELSE 1 END,
                           window_start = CASE WHEN rate_limits.window_start > ${cutoff} THEN rate_limits.window_start ELSE ${now} END
                         RETURNING count`;
  if (rows[0].count > limit) throw { status: 429, message: 'Too many requests. Please wait a moment and try again.' };
  return rows[0].count;
}

export function clientIp(req) {
  const xf = req.headers.get('x-forwarded-for') || '';
  return (xf.split(',')[0] || req.headers.get('x-real-ip') || 'unknown').trim().slice(0, 64);
}
