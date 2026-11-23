// Postgres access.
//
// Production: Neon's serverless HTTP driver (works on Vercel functions).
// Local dev / tests: set DATABASE_URL to `pglite://memory` (or `pglite://./.data/pg`)
// to run an in-process Postgres (PGlite, a devDependency) — no network, no risk
// to production data. The rest of the app only ever sees `sql` and `tx`.
//
// Schema is additive and versioned: every statement is CREATE/ALTER ... IF NOT
// EXISTS, and a one-row version marker lets a warm schema skip the whole
// migration with a single query per cold start.
import { neon } from '@neondatabase/serverless';

const SCHEMA_VERSION = 5;

let _driver = null;      // { query(text, params) -> rows, transaction(queries) }
let _driverPromise = null;

function connectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || '';
}

function compile(strings, values) {
  let text = strings[0];
  for (let i = 0; i < values.length; i++) text += '$' + (i + 1) + strings[i + 1];
  return { text, params: values };
}

async function makeDriver() {
  const cs = connectionString();
  if (!cs) throw new Error('No database connection string. Set DATABASE_URL or POSTGRES_URL.');

  if (cs.startsWith('pglite:')) {
    // Hidden from the bundler/tracer on purpose: this package is dev-only and
    // must never be pulled into the production function bundle.
    const spec = ['@electric-sql', 'pglite'].join('/');
    const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ spec);
    const dir = cs.replace(/^pglite:\/\//, '');
    const pg = new mod.PGlite(dir && dir !== 'memory' ? dir : undefined, {
      // Match Neon: BIGINT comes back as a string.
      parsers: { 20: v => v }
    });
    await pg.waitReady;
    return {
      kind: 'pglite',
      async query(text, params) { return (await pg.query(text, params)).rows; },
      async transaction(queries) {
        const out = [];
        await pg.transaction(async t => {
          for (const q of queries) out.push((await t.query(q.text, q.params)).rows);
        });
        return out;
      },
      async close() { await pg.close(); }
    };
  }

  const client = neon(cs, { fullResults: false });
  return {
    kind: 'neon',
    query(text, params) { return client(text, params); },
    transaction(queries) { return client.transaction(queries.map(q => client(q.text, q.params))); },
    async close() {}
  };
}

async function driver() {
  if (_driver) return _driver;
  if (!_driverPromise) _driverPromise = makeDriver().then(d => (_driver = d)).catch(e => { _driverPromise = null; throw e; });
  return _driverPromise;
}

// `sql` keeps the tagged-template call style used across the app
// (await sql`SELECT ...`) and defers connecting until the query actually runs.
export function sql(strings, ...values) {
  const q = compile(strings, values);
  return driver().then(d => d.query(q.text, q.params));
}

/**
 * Run several statements atomically.
 *   await tx(q => [ q`UPDATE ...`, q`INSERT ...` ])
 * Returns an array of row arrays, one per statement.
 */
export async function tx(build) {
  const q = (strings, ...values) => compile(strings, values);
  const queries = build(q).filter(Boolean);
  if (!queries.length) return [];
  const d = await driver();
  return d.transaction(queries);
}

let initialized = false;
let initPromise = null;

async function migrate() {
  // ---- v1: original tables (unchanged) ------------------------------------
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
  await sql`ALTER TABLE previews ADD COLUMN IF NOT EXISTS category TEXT`;
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

  // ---- v2: Platform 2.0 — structured sites, versions, durable jobs ---------
  // Durable multi-stage jobs: `state` holds the resumable step machine.
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS site_id TEXT`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS state JSONB`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stage TEXT`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_by TEXT`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lease_until BIGINT`;
  await sql`CREATE INDEX IF NOT EXISTS jobs_project_idx ON jobs (project_id, created_at DESC)`;

  // One structured website per project. `draft` is the working copy; the
  // published pointer only ever moves after a version rendered successfully.
  await sql`
    CREATE TABLE IF NOT EXISTS sites (
      id                    TEXT PRIMARY KEY,
      project_id            TEXT NOT NULL UNIQUE,
      slug                  TEXT NOT NULL UNIQUE,
      status                TEXT NOT NULL DEFAULT 'draft',
      draft                 JSONB NOT NULL,
      draft_rev             INT NOT NULL DEFAULT 1,
      draft_dirty           BOOLEAN NOT NULL DEFAULT FALSE,
      published_version_id  TEXT,
      live_version_id       TEXT,
      staging_version_id    TEXT,
      created_at            BIGINT NOT NULL,
      updated_at            BIGINT NOT NULL
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS site_versions (
      id          TEXT PRIMARY KEY,
      site_id     TEXT NOT NULL,
      kind        TEXT NOT NULL,
      label       TEXT NOT NULL DEFAULT '',
      doc         JSONB NOT NULL,
      meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by  TEXT,
      created_at  BIGINT NOT NULL
    )`;
  await sql`CREATE INDEX IF NOT EXISTS site_versions_site_idx ON site_versions (site_id, created_at DESC)`;
  // Rendered, ready-to-serve files for a version (preview channel).
  await sql`
    CREATE TABLE IF NOT EXISTS site_files (
      version_id    TEXT NOT NULL,
      path          TEXT NOT NULL,
      content       TEXT NOT NULL,
      content_type  TEXT NOT NULL DEFAULT 'text/html; charset=utf-8',
      PRIMARY KEY (version_id, path)
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS site_events (
      id          TEXT PRIMARY KEY,
      site_id     TEXT NOT NULL,
      type        TEXT NOT NULL,
      actor_id    TEXT,
      detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at  BIGINT NOT NULL
    )`;
  await sql`CREATE INDEX IF NOT EXISTS site_events_site_idx ON site_events (site_id, created_at DESC)`;

  // Every model call: who/what/how much. Powers cost tracking + the job log.
  await sql`
    CREATE TABLE IF NOT EXISTS ai_calls (
      id             TEXT PRIMARY KEY,
      job_id         TEXT,
      project_id     TEXT,
      task           TEXT NOT NULL,
      model          TEXT NOT NULL,
      status         TEXT NOT NULL,
      input_tokens   INT NOT NULL DEFAULT 0,
      output_tokens  INT NOT NULL DEFAULT 0,
      cache_read     INT NOT NULL DEFAULT 0,
      cache_write    INT NOT NULL DEFAULT 0,
      cost_usd       NUMERIC(12,6),
      duration_ms    INT NOT NULL DEFAULT 0,
      attempts       INT NOT NULL DEFAULT 1,
      stop_reason    TEXT,
      error          TEXT,
      params         JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at     BIGINT NOT NULL
    )`;
  await sql`CREATE INDEX IF NOT EXISTS ai_calls_job_idx ON ai_calls (job_id, created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS ai_calls_project_idx ON ai_calls (project_id, created_at)`;

  await sql`
    CREATE TABLE IF NOT EXISTS design_presets (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      note        TEXT NOT NULL DEFAULT '',
      config      JSONB NOT NULL,
      created_by  TEXT,
      created_at  BIGINT NOT NULL,
      updated_at  BIGINT NOT NULL
    )`;

  // ---- v3: customers, media, support, forms, analytics ---------------------
  await sql`
    CREATE TABLE IF NOT EXISTS project_members (
      user_id     TEXT NOT NULL,
      project_id  TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'owner',
      created_at  BIGINT NOT NULL,
      PRIMARY KEY (user_id, project_id)
    )`;
  await sql`CREATE INDEX IF NOT EXISTS project_members_project_idx ON project_members (project_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token_hash  TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      purpose     TEXT NOT NULL,
      expires_at  BIGINT NOT NULL,
      used_at     BIGINT,
      created_at  BIGINT NOT NULL
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS media_assets (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL,
      url         TEXT NOT NULL,
      name        TEXT NOT NULL DEFAULT '',
      alt         TEXT NOT NULL DEFAULT '',
      kind        TEXT NOT NULL DEFAULT 'photo',
      bytes       INT NOT NULL DEFAULT 0,
      created_by  TEXT,
      created_at  BIGINT NOT NULL
    )`;
  await sql`CREATE INDEX IF NOT EXISTS media_assets_project_idx ON media_assets (project_id, created_at DESC)`;
  await sql`
    CREATE TABLE IF NOT EXISTS support_requests (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL,
      user_id     TEXT,
      subject     TEXT NOT NULL,
      body        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'open',
      reply       TEXT NOT NULL DEFAULT '',
      created_at  BIGINT NOT NULL,
      updated_at  BIGINT NOT NULL
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS form_submissions (
      id          TEXT PRIMARY KEY,
      site_id     TEXT NOT NULL,
      form_key    TEXT NOT NULL DEFAULT 'contact',
      page        TEXT NOT NULL DEFAULT '',
      data        JSONB NOT NULL,
      delivery    JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at  BIGINT NOT NULL
    )`;
  await sql`CREATE INDEX IF NOT EXISTS form_submissions_site_idx ON form_submissions (site_id, created_at DESC)`;
  await sql`
    CREATE TABLE IF NOT EXISTS site_pageviews (
      site_id  TEXT NOT NULL,
      day      TEXT NOT NULL,
      path     TEXT NOT NULL,
      views    INT NOT NULL DEFAULT 0,
      PRIMARY KEY (site_id, day, path)
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key           TEXT PRIMARY KEY,
      window_start  BIGINT NOT NULL,
      count         INT NOT NULL
    )`;

  // ---- v4: integrations ----------------------------------------------------
  await sql`
    CREATE TABLE IF NOT EXISTS integration_instances (
      id               TEXT PRIMARY KEY,
      site_id          TEXT NOT NULL,
      provider         TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'configuration_required',
      config           JSONB NOT NULL DEFAULT '{}'::jsonb,
      secrets          TEXT NOT NULL DEFAULT '',
      error            TEXT NOT NULL DEFAULT '',
      last_checked_at  BIGINT,
      created_by       TEXT,
      created_at       BIGINT NOT NULL,
      updated_at       BIGINT NOT NULL,
      UNIQUE (site_id, provider)
    )`;

  // ---- v5: customer account state -------------------------------------------
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS activated_at BIGINT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at BIGINT`;
  await sql`CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON auth_tokens (user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS support_requests_project_idx ON support_requests (project_id, created_at DESC)`;

  await sql`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
  await sql`INSERT INTO schema_meta (key, value) VALUES ('version', ${String(SCHEMA_VERSION)})
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
}

export async function initDb() {
  if (initialized) return;
  if (!initPromise) {
    initPromise = (async () => {
      let current = 0;
      try {
        const rows = await sql`SELECT value FROM schema_meta WHERE key = 'version'`;
        current = parseInt(rows[0]?.value || '0', 10) || 0;
      } catch { current = 0; } // table missing → fresh or pre-2.0 database
      if (current < SCHEMA_VERSION) await migrate();
      initialized = true;
    })().catch(e => { initPromise = null; throw e; });
  }
  return initPromise;
}

/** Tests only: drop the in-process database so each suite starts clean. */
export async function __resetDbForTests() {
  if (_driver?.kind === 'neon') throw new Error('Refusing to reset a real database');
  if (_driver) await _driver.close();
  _driver = null; _driverPromise = null; initialized = false; initPromise = null;
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

// Find a project by its public review token (used by the client review/pay flow).
export async function projectByToken(token) {
  if (!token) return null;
  await initDb();
  const rows = await sql`SELECT data FROM projects WHERE data->>'reviewToken' = ${token} LIMIT 1`;
  return rows[0]?.data || null;
}

export async function getProject(id) {
  await initDb();
  const rows = await sql`SELECT data FROM projects WHERE id = ${id}`;
  return rows[0]?.data || null;
}

export async function putProject(project) {
  await initDb();
  await sql`UPDATE projects SET data = ${JSON.stringify(project)}::jsonb, updated_at = ${Date.now()} WHERE id = ${project.id}`;
  return project;
}

/**
 * Read-modify-write a project without clobbering concurrent edits to other
 * keys: only the keys returned by `mutate` are merged at the top level.
 */
export async function patchProject(id, patch) {
  await initDb();
  const rows = await sql`UPDATE projects SET data = data || ${JSON.stringify(patch)}::jsonb, updated_at = ${Date.now()}
                         WHERE id = ${id} RETURNING data`;
  return rows[0]?.data || null;
}
