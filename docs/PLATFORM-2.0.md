# 499 Web Co. — Platform 2.0: Status

What was built, how it was checked, and what is still open. The starting point and plan are in [PLATFORM-2.0-AUDIT.md](PLATFORM-2.0-AUDIT.md).

**How to read the status words**

- **Tested** — covered by the automated suite (`npm test`, 136 tests) running against a real Postgres engine in-process.
- **Browser-checked** — also exercised by hand in a browser against a local copy of the app.
- **Not verified** — implemented, but it depends on something that was not available while building (a live API key, a live deployment, a third-party account). These are listed in one place under [Not verified](#not-verified-yet).

## What did not change

- The workflow: Prospect → Lead → Admin enriches → AI builds → Admin reviews → Customer approves and purchases → delivered.
- Every existing table, row and setting. The database upgrade only adds tables and columns; it runs by itself on the first request after deploy. A test seeds the database exactly as the previous version left it and confirms existing leads, sites, users, passwords, settings, jobs and review links all still work.
- Existing published sites are served byte for byte as before. Nothing is converted until an admin chooses to upgrade a site.
- The classic single-page builder is still there (Project → Generate → "Classic single-page builder").

## Phase 1 — AI models and generation engine

| Item | Status |
|---|---|
| Model selector with `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` | Tested, browser-checked |
| Default max output tokens 64,000, treated as a ceiling and capped per model | Tested |
| Capability discovery from Anthropic's Models API (limits, thinking modes), with built-in values as a fallback | Tested against a simulated API |
| Per-task model assignment (architecture, design, page, content, SEO, edit, redesign, utility) | Tested |
| Presets: Premium Quality, Balanced, Economy, Custom; per-job override | Tested, browser-checked |
| Thinking/effort chosen per model; unsupported parameters dropped on a 400 and retried | Tested |
| Retries with backoff for 408/409/429/5xx/529; retired-model fallback with a visible note | Tested |
| Token and cost tracking per call, per job and per project (`ai_calls`) | Tested |
| Model and settings stored with each site and job | Tested |
| Multi-stage build: A understanding → B sitemap (admin reviews and edits) → C design system → D pages one at a time → E QA → F admin review | Tested, browser-checked in demo mode |
| Missing facts are flagged, never invented; no fabricated reviews, claims or photography | Enforced in prompts and by the facts check in QA; tested for the QA part |
| Durable jobs: resumable steps, leases, cancel, retry failed step, regenerate one page or one section | Tested |
| QA: broken internal links, missing metadata, heading order, contrast, missing alt text, placeholder text, unsafe markup; auto-fix of what can be fixed mechanically | Tested |
| Responsive render check at phone, tablet and desktop widths | Runs in the admin's browser from the site panel (the server has no headless browser). Browser-checked |

Without an Anthropic key the builder runs in **demo mode** and says so: it assembles a complete site from platform templates and the lead's facts so the rest of the workflow can be used.

## Phase 2 — Design direction engine

| Item | Status |
|---|---|
| Direction built from industry, personality, visual preferences and a custom prompt | Tested, browser-checked |
| Structured variation across ten dimensions (layout, type pairing, colour architecture, palette, section rhythm, navigation, motif, image treatment, cards, interaction) | Tested |
| Locks per dimension; re-roll only what is unlocked | Tested |
| Named presets: save, rename, reuse, delete | Tested |
| Existing projects with an old random seed map onto a direction deterministically | Tested |
| Design system (tokens, fonts, CSS) persisted per site and reused for every later page | Tested |

## Phase 3 — Customer accounts, dashboard and editor

| Item | Status |
|---|---|
| Customer accounts with invite and password-reset links (single use, hashed, expiring) | Tested, browser-checked |
| Automatic invite after a Stripe purchase | Tested with a simulated webhook |
| Roles: admin, designer (staff); owner, editor (customer) | Tested |
| Tenant isolation: a customer reaches only their own sites; every studio route refuses customers | Tested route by route |
| Dashboard: My Website, Account, Website Health (form submissions, visits, last publish, checks) | Tested, browser-checked |
| Visual editor: click to edit text, images, links; reorder, hide, duplicate, add sections; presentation options; page settings and SEO; device preview | Tested (operations), browser-checked (editing and autosave) |
| Drafts, explicit Publish, autosave, unsaved-change warning, conflict detection between two editors | Tested |
| Revision history with restore and rollback | Tested |
| Design system protection: customers edit content and brand colours; markup, CSS and tokens are staff-only and enforced on the server | Tested |
| Customers add pages from templates, optionally written by AI | Tested |
| Page management: slug, navigation, order, draft/published, archive, redirects | Tested |
| Contact forms store real submissions, filter spam, rate limit, and notify by email | Tested, browser-checked on a published page |
| Support requests between customer and studio | Tested |

## Phase 4 — Integrations and upgrades of existing sites

| Item | Status |
|---|---|
| Marketplace with a modular provider registry (one object per provider) | Tested, browser-checked |
| Working providers: Calendly, Cal.com, Square Appointments, Stripe Payment Link, Square Checkout, PayPal, HubSpot, Mailchimp, Google Analytics, Meta Pixel, Lead Notifications, Webhook, WhatsApp, Tawk.to, Crisp, Google Review Link, Social Profiles, Google Maps, Mapbox | Validation and rendering tested; outbound calls tested against simulated providers |
| "Connected" is shown only after the provider's own validation succeeds; failures show the real reason | Tested |
| Credentials encrypted on the server (AES-256-GCM); never present in generated pages or sent to the browser | Tested |
| Placement of integration blocks in pages; per-site Content-Security-Policy that allows only the hosts of connected providers | Tested, browser-checked (Google Maps) |
| Webhook delivery signed, with private-network (SSRF) protection | Tested |
| Entitlement: every provider is "Included" until an admin sets a tier, plan or fee. No pricing is invented | Tested |
| OAuth connect (HubSpot, Mailchimp) | Code path tested with simulated endpoints; shown only after an admin enters the platform's OAuth app credentials |
| Google Reviews Display, Instagram/Facebook Feed | Listed as **unavailable**. They need approved Google/Meta apps; nothing pretends to work |
| Upgrades: Visual Refresh, Multipage Conversion, Full Redesign, Platform Conversion | Tested |
| Snapshot → staging → review → approve → publish; rollback to any earlier version | Tested |
| A finished upgrade job never changes the live site by itself | Tested |
| Launch to the customer's own Vercel project and domain, republish on edit, rollback; a failed deploy leaves the live site up | Tested against a simulated Vercel API |

## Phase 5 — Hardening

- AI output is sanitised before it is stored: allow-listed tags and attributes, no scripts or event handlers, safe URLs, sanitised CSS. Models never write JavaScript; published pages load one platform script driven by data attributes. Tested.
- Published pages carry a Content-Security-Policy. The editor canvas is a sandboxed frame.
- Rate limits on login, password reset, the public lead form, site forms and the page-view beacon.
- Prospect-supplied text is escaped in notification emails.
- Staged upgrade previews are staff-only.
- Production build passes (`npm run build:check`).

## Not verified yet

These need things only the owner has. Each is a short check once the item is available.

1. **Real model output.** No Anthropic key was available while building, so the prompts, parsers and pipeline were exercised with simulated responses and in demo mode. The first real build should be watched end to end: plan, sitemap, design system, pages, QA. Expect some prompt tuning after seeing real output.
2. **The live deployment.** The database upgrade was tested against a copy of the old schema, not against production. After deploy: sign in, open an existing project, open an existing published preview.
3. **Live Vercel launches** of multipage sites to customer domains (tested against a simulated API only).
4. **Live third-party connections** (HubSpot, Mailchimp, webhooks, email through Resend). Connect one real account each and send a test form.
5. **Media uploads** in the editor need the Blob store token (`BLOB_READ_WRITE_TOKEN`) that the existing upload feature already uses.

## Decisions and credentials needed from the owner

| What | Where | Why |
|---|---|---|
| Anthropic API key (already in Settings if the classic builder worked) | Admin → Settings → AI | Real generation instead of demo mode |
| Model preset and any per-task overrides | Admin → Settings → AI | Cost versus quality; the default is Balanced with the previously chosen model kept as default |
| Integration pricing: which providers are included, premium, or tied to a plan | Admin → Integrations | Nothing is charged or gated until this is set |
| OAuth app credentials for HubSpot and Mailchimp (optional; API-key connect works without them) | Admin → Integrations | Enables "Connect with…" buttons |
| `INTEGRATION_SECRET` (optional) | Vercel environment variables | A separate key for encrypting integration credentials. Defaults to `SESSION_SECRET`. Set it before connecting integrations, or leave it unset permanently; changing it later makes stored credentials unreadable |
| `CRON_SECRET` plus a Vercel cron for `/api/cron/jobs` (optional) | Vercel | Resumes a build if the admin closes the tab mid-run. Without it, builds resume when the job page is reopened |
| Whether customers get the dashboard automatically after purchase | Already on: an invite is emailed after payment. Requires the Resend key in Settings | |

## Known limitations

- A single generation request may run for up to 800 seconds, the maximum on Vercel Pro with Fluid compute. A page that is cut off at that limit continues from its finished sections in the next request; a step that produces nothing in time is retried with lighter thinking.

- Sites converted from the classic builder with **Platform Conversion** keep their original inline script and navigation; they become editable section by section but are not restructured. Use Multipage Conversion or Full Redesign for the full structure.
- The responsive render check runs in the admin's browser, not on the server.
- Legacy `maxTokens` in Settings is ignored; the new setting is "Max output tokens" under AI.
- Analytics on the dashboard are anonymous page-view counts collected by the platform, not a replacement for Google Analytics.

## Running it

```bash
npm install
cp .env.example .env.local
npm run dev
```

```bash
npm test
```

```bash
npm run build:check
```

Local development uses an in-process Postgres (`DATABASE_URL=pglite://./.data/pg`), so it never touches production data.
