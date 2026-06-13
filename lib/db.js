// Postgres access via Neon's serverless driver (works on Vercel functions).
// One lazy schema-init guarded by a flag so it runs once per cold start.
import { neon } from '@neondatabase/serverless';

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;

export const sql = neon(connectionString);

let initialized = false;

export async function initDb() {
  if (initialized) return;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      full_name   TEXT NOT NULL DEFAULT '',
      email       TEXT UNIQUE NOT NULL,
      username    TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'designer',
      created_at  BIGINT NOT NULL
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      id    INT PRIMARY KEY DEFAULT 1,
      data  JSONB NOT NULL DEFAULT '{}'::jsonb
    )`;
  await sql`INSERT INTO settings (id, data) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`;
  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      owner_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
      data        JSONB NOT NULL,
      created_at  BIGINT NOT NULL,
      updated_at  BIGINT NOT NULL
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS previews (
      slug          TEXT PRIMARY KEY,
      business_name TEXT NOT NULL,
      html          TEXT NOT NULL,
      published_at  BIGINT NOT NULL
    )`;
  // Background generation jobs (so long AI calls survive serverless limits).
  await sql`
    CREATE TABLE IF NOT EXISTS jobs (
      id          TEXT PRIMARY KEY,
      project_id  TEXT,
      kind        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'running',
      progress    INT NOT NULL DEFAULT 0,
      result      TEXT,
      error       TEXT,
      created_at  BIGINT NOT NULL,
      updated_at  BIGINT NOT NULL
    )`;
  initialized = true;
}

export async function userCount() {
  await initDb();
  const rows = await sql`SELECT COUNT(*)::int AS n FROM users`;
  return rows[0].n;
}

export async function getSettings() {
  await initDb();
  const rows = await sql`SELECT data FROM settings WHERE id = 1`;
  return rows[0]?.data || {};
}

export async function saveSettings(patch) {
  await initDb();
  const current = await getSettings();
  const merged = { ...current, ...patch };
  await sql`UPDATE settings SET data = ${JSON.stringify(merged)}::jsonb WHERE id = 1`;
  return merged;
}
