# Launch Your Own Studio — Clone & Rebrand Guide

This app is a complete "website flywheel": a public marketing site + lead form, an internal studio that builds client websites with AI, and a self-serve **review → approve → pay (Stripe) → launch** funnel with automated emails.

Each operator runs their **own isolated copy** — their own domain, Vercel, database, Stripe, Google Workspace, and Anthropic key. Nothing is shared between brands. Rebranding is **one file + one logo**.

Budget ~60–90 minutes for a first launch. No coding required beyond editing one config file.

---

## 0. What you'll need (free or low-cost accounts)
- **GitHub** (free) — to hold the code
- **Vercel** (Pro, ~$20/mo recommended) — hosting + the database/blob add-ons
- **Anthropic** API key — powers the AI generation (pay-per-use, ~$0.40–1 per site)
- **Stripe** — to take the one-time payment
- **Resend** — transactional email (free tier is plenty)
- **Google Workspace** (~$6/mo) — your real inbox (optional but recommended)
- **A domain** for your brand (e.g. from GoDaddy/Namecheap)

---

## 1. Get your own copy of the code
On the original GitHub repo, click **Use this template → Create a new repository** (or fork it). Name it for your brand. This gives you an independent codebase you control.

> If the repo isn't marked as a template yet, the owner can enable it: repo **Settings → General → ✓ Template repository**.

## 2. Rebrand — edit ONE file
Open **`lib/brand.js`** and change the values to yours:
```
name, tagline, priceCents, priceLabel, growthLabel,
email, phone, phoneTel, region, serviceAreas[], colors{}, logoPath
```
Then drop your logo at **`public/brand/logo.png`** (transparent PNG works best).

**Set `homepageMode: 'auto'`** in `brand.js` — this gives you a clean, fully-branded homepage out of the box (your name, price, colors, service areas, and a working lead form), with zero design work. (Leave it `'custom'` only if you've hand-built `lib/homepage.js` yourself.)

That single file rebrands every email, the homepage, the portfolio page, the client review/pay pages, and checkout. You can later build a fancier custom homepage in the studio and set its slug in Settings to override (see step 8).

## 3. Create the database (Neon)
Vercel dashboard → **Storage → Create → Postgres (Neon)**. Create it; you'll attach it to the project in step 5. The schema builds itself on first run — no migrations.

## 4. Create a Blob store (for client photo uploads)
Vercel → **Storage → Create → Blob** → set access to **Public**. (Photos appear on live customer sites, so they must be public; URLs are random/unguessable.)

## 5. Deploy to Vercel
1. Vercel → **Add New → Project** → import your repo.
2. **Connect** the Neon Postgres store and the Blob store to this project (so `POSTGRES_URL` and `BLOB_READ_WRITE_TOKEN` are injected).
3. Add one env var: **`SESSION_SECRET`** = a long random string. Generate one:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
4. **Deploy.** First deploy lands on a `*.vercel.app` URL.

## 6. Create your admin account
Visit **`<your-vercel-url>/admin`** → you'll get a one-time **setup screen**. Create your owner account (email + password). This is the only time setup is available.

## 7. Fill in Settings (admin → Settings)
- **AI:** Anthropic API key, model (Sonnet is the sweet spot), max tokens `64000`.
- **Previews & hosting:** Preview domain = your domain; Vercel API token (Account → Tokens) for launching client sites.
- **Payments (Stripe):** secret key + webhook signing secret (see step 9).
- **Email (Resend):** API key, From = your hello@ address, Team notification email.

## 8. Connect your domain + build your homepage
1. Vercel → Project → **Settings → Domains** → add your apex domain **and** `www` (Vercel shows the DNS records → add at your registrar: A `@` → `76.76.21.21`, CNAME `www`).
2. **Build your marketing homepage in the studio itself:** create a New Business for your own brand, generate a site, tweak it, **Publish preview**. Note its slug (e.g. `my-brand`).
3. Settings → **Homepage preview slug** = that slug → save. Your domain root now serves the homepage you generated. (Leave blank and it shows the bundled default.)

## 9. Email (Google Workspace + Resend)
Follow **EMAIL-SETUP.md** — set up your Google Workspace inbox (root MX) and verify your domain in Resend (DKIM/SPF on the `send` subdomain). They don't conflict.

## 10. Stripe
1. **Developers → API keys** → copy the secret key → Settings → Payments.
2. **Developers → Webhooks → Add endpoint:** URL `https://<your-domain>/api/stripe/webhook`, event **`checkout.session.completed`** → copy the signing secret → Settings → Payments.
3. Test in **Test mode** first (card `4242 4242 4242 4242`); switch to live keys + a live webhook when ready.

## 11. Test the full loop
Lead form → prospect emailed review link → open it → Approve → Pay → project flips to **Paid**, client emailed DNS instructions → **Launch** to their domain → "you're live" email.

---

## What's per-brand vs shared
- **Per-brand (isolated):** domain, Vercel project, Neon DB, Blob store, Stripe, Resend, Google Workspace, Anthropic key, all client data. One brand's data is never visible to another.
- **Shared (the product):** the codebase. When the original gets improvements, each brand can pull them into their copy (`git` merge, or re-import changed files).

## Rebrand checklist (TL;DR)
1. Use template → new repo
2. Edit `lib/brand.js` + add `public/brand/logo.png`
3. Neon + Blob stores
4. Deploy + `SESSION_SECRET`
5. `/admin` setup account
6. Settings: Anthropic, Vercel token, Stripe, Resend
7. Domain + generate homepage + set slug
8. Test the funnel → go live
