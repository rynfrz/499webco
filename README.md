# 499web.co — Web App (499web.co/admin)

The desktop pipeline, rebuilt as a multi-user web app: login, two roles (admin / designer), user management, account management, and the full Find → Build → Preview → Show → Launch flow — served from one Next.js app on Vercel with a Postgres database.

## Architecture at a glance

- **Next.js (App Router)** on Vercel. Pro plan assumed (generation runs up to 300s).
- **Postgres (Vercel/Neon)** holds users, settings, projects, published previews, and generation jobs. Nothing is stored on the filesystem (serverless is ephemeral).
- **Auth**: bcrypt password hashing + a signed JWT in an httpOnly cookie. `middleware.js` gates everything under `/admin` and `/api`. Role checks run in the route handlers.
- **One domain, no collisions**: the tool is at `499web.co/admin`; published previews are served by the same app at `499web.co/preview/<slug>/` straight from Postgres; the portfolio is at `499web.co/portfolio`; the site root serves your chosen homepage.
- **Client launches** still deploy each customer's final site to its own Vercel project + domain (uses your Vercel token in Settings).

## Roles

- **Admin** — everything, plus Settings (API keys, hosting, identity) and Users (add people, set role, reset passwords, delete).
- **Designer** — runs the full pipeline (analyze, generate, preview, publish, audit, outreach, launch) but cannot see secrets or manage users.
- **Everyone** — manages their own name, email, username, and password under My Account.

## Deploy to 499web.co/admin

**1. Create the database.** In the Vercel dashboard → Storage → Create → Postgres (Neon). Name it, create it. Vercel auto-adds `POSTGRES_URL` to the project you attach it to. (Locally, put the connection string in `.env.local` as `DATABASE_URL`.) The schema creates itself on first request — no migration step.

**2. Push the code.** Put this folder in a Git repo (GitHub/GitLab), then in Vercel → Add New → Project → import the repo. Framework auto-detects as Next.js.

**3. Set environment variables** (Project → Settings → Environment Variables):
- `SESSION_SECRET` — a long random string. Generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
- `DATABASE_URL` — only if you didn't attach the Vercel Postgres store (which sets `POSTGRES_URL` for you; the app reads either).

**4. Deploy.** First deploy goes to a preview URL like `wfl-web-xxxx.vercel.app`. Open `/admin` there — you'll get the **first-run setup screen**. Create the admin account (ryanfreeze@me.com) and your password. It's the only time setup is available; once a user exists, that screen is closed.

**5. Test on the preview URL**: log in, add a designer user, run a business through generate → publish → check the preview at `/preview/<slug>/`.

**6. Promote to production / attach the domain.** Vercel → Project → Settings → Domains → add `499web.co` and `www.499web.co`. Vercel shows the DNS records (A `@` → `76.76.21.21`; CNAME `www`). Add them at GoDaddy. Set `previewDomain` to `499web.co` in Settings so preview links are absolute. The tool is now at `499web.co/admin`.

## Notes & honest caveats

- **Generation time**: on Pro, full-site generation (1–4 min) runs inside one request (`maxDuration = 300`) while streaming progress. The finished site is saved to the database as it completes, so even if the browser tab closes, reopening the project shows the result. A `jobs` table records each run for recovery.
- **Audit PDF**: in the web app the audit opens as a printable one-page tab and triggers the browser's "Save as PDF" (no headless Chrome needed on the server). Before/after screenshots from the desktop version aren't auto-captured server-side; the audit leads with the score, findings, and the live preview link.
- **The desktop app still works** and is unchanged — this is a parallel codebase for team/browser use.
- **First build**: I couldn't run `next build` in my sandbox (the package registry was blocked), so confirm the build on Vercel's first deploy. All shared logic and file structure were validated; if the build flags anything, send me the log.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL + SESSION_SECRET
npm run dev                  # http://localhost:3000/admin
```
