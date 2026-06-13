# 499web.co — Prospect → Client Funnel Setup

This adds the full self-serve funnel: **lead form → prospect in the studio → build → client review → approve → pay (Stripe) → DNS instructions**, with confirmation/notification emails via Resend.

## What got built

- **Lead form** on the homepage (the "Ready when you are" section). Submissions hit `/api/lead`, which creates a prospect project (status **lead**), emails the prospect a confirmation, and emails your team a notice.
- **Prospects appear in the studio** dashboard with a "New lead" badge. Open one, fill in any missing info/direction, and run the normal Build → Preview → Publish steps.
- **Client review link** — in a project, click **"Copy client review link"**. It's a private `/review/<token>` page where the client previews the live site, clicks **Approve**, then **Pays $499** via Stripe Checkout.
- **Stripe webhook** flips the project to **paid** and emails the client DNS instructions + alerts your team.
- **Lifecycle:** lead → (building) → preview published → approved → paid → launched. The team finishes the live launch from Step 6 (Launch) as before.

## One-time setup (all in admin → Settings, plus two dashboards)

### 1. Resend (email) — ~10 min
1. Create an account at resend.com.
2. Add and **verify the 499web.co domain** (Resend shows DNS records — add them at your registrar, same place as before).
3. Create an API key → paste into **Settings → Email → Resend API key**.
4. Set **From address** to `hello@499web.co` and **Team notification email** to wherever you want lead/payment alerts.
   - Until this is configured, the funnel still works — the prospect just sees the on-screen confirmation and you'll see leads in the dashboard, but no emails go out.

### 2. Stripe (payments) — ~10 min
1. In the Stripe Dashboard, grab your **secret key** (Developers → API keys) → paste into **Settings → Payments → Stripe secret key**. Use a `sk_test_…` key first to test, then swap to `sk_live_…`.
2. Create a **webhook**: Developers → Webhooks → Add endpoint:
   - URL: `https://499web.co/api/stripe/webhook`
   - Event: **`checkout.session.completed`**
   - Save, then copy the endpoint's **Signing secret** (`whsec_…`) → paste into **Settings → Payments → Stripe webhook signing secret**.
3. Leave **Site price** at `49900` ($499) or change it.
4. Make sure your Stripe account has completed payout/bank setup so you actually get paid.

### 3. Deploy
Commit the `wfl-web` folder as usual (drag the whole folder into GitHub). New files: the funnel API routes, the review page, `lib/email.js`, `lib/stripe.js`, the homepage form, and the restyled portfolio. No env vars needed beyond what's already set — all keys live in Settings (the database).

## How to test the whole loop
1. On 499web.co, fill out the lead form → you should see the "pit lane" success message (and a confirmation email if Resend is set).
2. In `/admin`, the prospect shows as a **New lead**. Open it, generate + publish a site.
3. Click **Copy client review link**, open it in a private window → preview shows → **Approve** → **Pay $499** (use Stripe test card `4242 4242 4242 4242`, any future expiry/CVC).
4. After payment you're returned to the review page showing the paid/DNS state; the project flips to **Paid** in the dashboard and emails go out.
5. Finish by launching to the client's domain from Step 6.

## Notes
- Emails and payments both **degrade gracefully** — if a key isn't set, that piece is skipped rather than erroring, so you can roll it out in stages.
- The review link token is random and unguessable; anyone with the link can view that one preview and pay. Don't post it publicly.
- The webhook is the source of truth for "paid" — the success-page redirect is just UX, so a closed tab never loses a sale.
