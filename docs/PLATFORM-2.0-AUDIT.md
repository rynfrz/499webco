# 499 Web Co. — Platform 2.0: Repository Audit & Plan

Audit of the repository as it stood before the 2.0 work (commit `282bc48`), and the plan that was followed.
The status of each phase is tracked in [PLATFORM-2.0.md](PLATFORM-2.0.md).

## 1. Current architecture (before 2.0)

| Area | How it actually works |
|---|---|
| Framework | Next.js 14 App Router, plain JavaScript, no TypeScript, no test suite, no lockfile. Deployed on Vercel from `main`. |
| Database | Neon Postgres over the serverless HTTP driver. Five tables: `users`, `settings` (one JSONB row), `projects` (one JSONB blob per business), `previews` (slug → one HTML string), `jobs`. Schema is created on first request (`initDb`), no migrations. |
| Auth | bcrypt + a JWT in the `wfl_session` httpOnly cookie. `middleware.js` gates `/admin` and `/api`; roles `admin` and `designer` are checked in route handlers. |
| Public site | `/` serves a hand-built HTML string (`lib/homepage.js`) containing the lead form. `/portfolio` lists published previews. |
| Lead flow | Lead form → `POST /api/lead` → a `projects` row with `status: 'lead'` and a private `reviewToken`; confirmation + team emails via Resend. |
| Admin workflow | `/admin/project/[id]` is one 745-line client page with six steps: Business → Brief → Generate → Preview → Deliver → Launch. The whole project is PATCHed as one JSON blob (debounced autosave). |
| AI | `lib/anthropic.js`: raw `fetch` streaming to `/v1/messages`. One model for everything (`settings.model`), `maxTokens` default 32,000, hard cap 64,000. No usage or cost capture, no retries. |
| Design seeds | `lib/promptBuilder.js` picks one random option from six lists (style direction, type pairing, colour strategy, palette, hero, motif) using a seeded PRNG. Stored on the project as `designSeed`. |
| Generation | `POST /api/generate` makes **one** model call that returns one complete HTML file. It is stored as `project.generatedHtml`. A `jobs` row records the run. Without an API key a small "demo site" template is used. |
| Revision | `POST /api/revise` sends the entire HTML back to the model with an instruction and replaces it. |
| Delivery | `POST /api/publish` copies the HTML into `previews` (served at `/preview/<slug>/`) and emails the prospect a `/review/<token>` link. The prospect approves (`/api/approve`) and pays through Stripe Checkout (`/api/checkout`, `/api/stripe/webhook` → `status: 'paid'`). |
| Launch | `POST /api/launch` deploys `index.html` to a per-client Vercel project through the Vercel API and attaches a domain. |
| Payments | Hand-rolled Stripe client (Checkout Session + webhook signature check). One-time payment; no subscriptions. |
| Media | Photos go to Vercel Blob (`/api/upload`). The logo is stored as a base64 data URL inside the project JSON. |
| Integrations | Ten toggles in the Brief step. They are only text instructions added to the prompt; nothing is validated or stored separately. |

## 2. Current generation workflow

1. Admin fills in Business and Brief (pages are just nav labels; all content lands on one page).
2. `buildWebsitePrompt(project)` builds one prompt from the business data, the design seed, and free-form design notes.
3. One streaming call returns one HTML document with inline CSS and inline JavaScript.
4. `{{LOGO_SRC}}` is swapped for the base64 logo and the HTML is saved on the project.
5. The admin previews it in an iframe (`srcDoc`) and can ask for whole-file revisions.

## 3. Technical constraints found

- **Serverless time limit.** Every request must finish within 300 s (`maxDuration`). A multipage build cannot be one request.
- **No background workers or queues.** Long work has to be a resumable job that is advanced one step per request.
- **One HTML blob is the only site definition.** There is no page, section, content, or design-system structure, so nothing can be edited or regenerated in part.
- **Generated JavaScript runs on the platform's own origin.** Previews are served from `499web.co/preview/...`, the same origin as `/admin`, so model-written scripts could reach admin APIs with an admin's cookie.
- **`requireUser()` accepts any signed-in user.** Adding a customer role without changing this would give customers the whole admin API.
- **`PATCH /api/projects/[id]` replaces the entire project JSON**, so server-side changes (payment status, generation output) can be overwritten by an open browser tab.
- **No tests and no local database.** Nothing could be verified without touching production.
- **Secrets are stored in plain JSON** in the `settings` row.
- **Publishing overwrites in place.** There are no versions and no rollback.

## 4. Reusable components and infrastructure

Kept and extended, not replaced: the Next.js app and its routing, the Neon database and `sql` helper, the session/JWT auth and user table, the `projects` JSON model and every existing status, the lead → review → approve → pay funnel, the Stripe and Resend clients, Vercel Blob uploads, the Vercel deploy client (`lib/deploy.js`), the `jobs` table, the streaming Anthropic client, the design-seed vocabulary (it seeds the new Design Direction Engine), the admin shell and CSS, and the classic single-page generator (still available as "Classic").

## 5. Data model changes (all additive)

| New table | Purpose |
|---|---|
| `sites` | One structured website per project: working draft, revision counter, and pointers to the published / live / staging versions. |
| `site_versions` | Immutable snapshots (publish, staging, pre-upgrade snapshot, legacy HTML). Rollback moves a pointer. |
| `site_files` | Rendered files for a version, served at `/preview/<slug>/...`. |
| `site_events` | Publication and change history. |
| `ai_calls` | One row per model call: task, model, tokens, cost, duration, errors. |
| `design_presets` | Named, reusable design directions. |
| `project_members`, `auth_tokens` | Customer accounts linked to the existing project/lead record; invite and reset tokens. |
| `media_assets`, `support_requests`, `form_submissions`, `site_pageviews`, `rate_limits` | Customer media library, support, contact forms, basic analytics, abuse limits. |
| `integration_instances` | Per-site integration connections with encrypted credentials. |
| `jobs` (new columns) | `state`, `stage`, `site_id`, `created_by`, `lease_until` for resumable multi-stage jobs. |

Existing tables, columns, project fields and statuses are unchanged. Existing sites keep working exactly as before until an admin chooses to upgrade them.

## 6. Files and modules

**Changed:** `lib/db.js`, `lib/auth.js`, `lib/anthropic.js`, `middleware.js`, `app/api/settings`, `app/api/projects/[id]`, `app/api/publish`, `app/api/launch`, `app/api/stripe/webhook`, `app/preview/[slug]`, the admin shell, the settings page and the project workspace.

**New:** `lib/ai/*` (model registry, presets, costs), `lib/design/*` (Design Direction Engine), `lib/site/*` (site document, sanitizer, renderer, QA, store, legacy conversion), `lib/gen/*` (pipeline, prompts, jobs), `lib/customers.js`, `lib/integrations/*`, new API routes under `app/api/sites`, `app/api/jobs`, `app/api/design`, `app/api/customer`, `app/api/integrations`, `app/api/forms`, new admin pages, and the customer area under `app/dashboard`.

## 7. Phased plan, dependencies and risks

| Phase | Scope | Depends on | Main risks and how they are handled |
|---|---|---|---|
| 1. Foundation and generation | Model registry and presets, 64,000-token ceiling, Design Direction Engine, structured site document, renderer, multipage pipeline, QA, preview | — | Serverless time limit → resumable step jobs. Model output is untrusted → sanitizer, no model-written scripts. Cost → per-call usage records. |
| 2. Website lifecycle | Versions, drafts, publish pointer, per-page regeneration, upgrade workflows, rollback | 1 | Overwriting a working site → publish only moves a pointer after a successful render; every upgrade is staged and snapshotted first. |
| 3. Customer ownership | Customer role, invites, dashboard, visual editor, add page | 1, 2 | Tenant isolation → every customer route authorises against `project_members`; staff routes reject the customer role. |
| 4. Integrations | Registry, marketplace, credentials, placement | 1, 3 | Secrets → encrypted at rest, never rendered into pages. Fake "connected" states → status only set after a real validation call. |
| 5. Refinement | Tests, security review, performance, docs, deploy check | all | Regressions → automated tests for the lead flow and every new flow, run before each push. |

Business decisions and credentials that only the owner can supply are listed at the end of [PLATFORM-2.0.md](PLATFORM-2.0.md).
