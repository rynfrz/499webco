// Test environment: in-process Postgres (PGlite), a fake cookie jar standing in
// for next/headers, and no real network for model calls.
import { vi, beforeEach } from 'vitest';

process.env.DATABASE_URL = 'pglite://memory';
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-0123456789';
delete process.env.POSTGRES_URL;
delete process.env.BLOB_READ_WRITE_TOKEN;

const jar = new Map();
globalThis.__cookieJar = jar;
const hdrs = new Map([['host', 'localhost:3000']]);
globalThis.__headers = hdrs;

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: k => (jar.has(k) ? { name: k, value: jar.get(k) } : undefined),
    set: (k, v, o) => { if (v === '' || o?.maxAge === 0) jar.delete(k); else jar.set(k, v); },
    delete: k => jar.delete(k)
  }),
  headers: () => ({ get: k => hdrs.get(String(k).toLowerCase()) || null })
}));

beforeEach(() => { globalThis.__wflFetch = undefined; });
