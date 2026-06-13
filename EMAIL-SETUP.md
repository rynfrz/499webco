# Email Setup for 499web.co — Google Workspace (inbox) + Resend (app sends)

Two jobs, two services:
- **Google Workspace** = your real inbox at hello@499web.co (send & receive by hand).
- **Resend** = the app's automated emails (lead confirmations, payment instructions, team alerts).

They coexist cleanly: Google owns the root **MX** (receiving); Resend sends and puts its bounce **MX** on a `send` subdomain. Neither touches the **A record** that points 499web.co at Vercel — leave that alone.

All DNS records below are added at **GoDaddy → your domain → DNS → Manage DNS → Add**.

---

## Part A — Google Workspace (your hello@499web.co inbox)

1. Go to **workspace.google.com** → **Get started**. Choose a plan (Business Starter is fine), enter your business info.
2. When asked about a domain, choose **"Use a domain I already own"** and enter **499web.co**.
3. Create your first user — this becomes **hello@499web.co** (add more users later, e.g. jax@499web.co).
4. **Verify domain ownership.** Google gives you a **TXT** record. At GoDaddy add:
   - Type **TXT** · Host **@** · Value: the `google-site-verification=…` string Google shows · TTL default.
5. **Turn on Gmail.** Google tells you to set the MX record. At GoDaddy:
   - **First, delete any existing MX records** (GoDaddy often pre-adds parking/forwarding MX records — they'll conflict).
   - Then add **one** record: Type **MX** · Host **@** · Value **smtp.google.com** · Priority **1**.
     - If GoDaddy requires a trailing dot, use `smtp.google.com.`
6. Back in Google's setup, click **Activate / Verify**. DNS usually propagates in minutes (Google allows up to 72h).
7. Done — you can now send/receive at hello@499web.co via mail.google.com.

> Keep your existing records intact: **A · @ · 76.76.21.21** (Vercel) and **CNAME · www**. Adding MX/TXT does not affect them.

---

## Part B — Resend (the app's automated emails)

1. Sign up at **resend.com**.
2. **Domains → Add Domain → `499web.co`.** Resend shows a set of records (values are unique to your account/region — copy them exactly). They look like:
   - **TXT** · Host `resend._domainkey` · Value: a long DKIM key (`p=…`)
   - **MX** · Host `send` · Value `feedback-smtp.us-east-1.amazonses.com` · Priority **10**  *(region may differ, e.g. eu-west-1)*
   - **TXT** · Host `send` · Value `v=spf1 include:amazonses.com ~all`
   - *(optional)* **TXT** · Host `_dmarc` · Value `v=DMARC1; p=none;`
3. Add each one at GoDaddy using the exact host/value Resend displays.
   - Note the SPF/MX are on the **`send`** subdomain, so they do **not** conflict with Google's root MX. Safe to have both.
4. Back in Resend, click **Verify**. Once green, create an **API key** (API Keys → Create) and copy it (`re_…`).

---

## Part C — Plug it into the app

In **499web.co/admin → Settings**:
- **Email → Resend API key:** paste the `re_…` key.
- **From address:** `hello@499web.co`
- **Team notification email:** where you want new-lead and payment alerts (e.g. hello@499web.co or your personal inbox).
- Save.

---

## Part D — Test

1. Submit the lead form on 499web.co. The prospect address should receive a confirmation **from hello@499web.co**, and your team address should get a "new lead" alert.
2. Reply to the confirmation — it should land in your **Google Workspace inbox** (hello@499web.co).
3. If a send fails, it's almost always that Resend's domain isn't **Verified** yet (DNS still propagating) — recheck the Resend dashboard.

---

## Quick reference — all GoDaddy records

| Purpose | Type | Host | Value | Priority |
|---|---|---|---|---|
| Keep (Vercel site) | A | @ | 76.76.21.21 | — |
| Keep (www) | CNAME | www | cname.vercel-dns.com | — |
| Google verify | TXT | @ | google-site-verification=… (from Google) | — |
| Google mail | MX | @ | smtp.google.com | 1 |
| Resend DKIM | TXT | resend._domainkey | (from Resend) | — |
| Resend bounce | MX | send | feedback-smtp.us-east-1.amazonses.com (from Resend) | 10 |
| Resend SPF | TXT | send | v=spf1 include:amazonses.com ~all | — |

Only the two MX rows are MX-type, and they're on different hosts (`@` vs `send`), so there's no conflict.
