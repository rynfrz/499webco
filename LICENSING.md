# Licensing — sell the template, control who can run it

The studio has a built-in **cryptographic license gate**. You hold a private signing
key; the app ships with only your public key. You issue a signed license bound to
each buyer's domain, and the admin studio refuses to run without a valid one.

A license **cannot be forged** without your private key, and only works on the
domain you issued it for. It's fully offline — no license server to run.

> Licensing is **OFF by default** (no public key embedded). Your own 499 instance
> keeps running untouched until you turn it on.

## One-time setup (you do this once)

1. **Generate your keypair:**
   ```
   node scripts/generate-keypair.mjs
   ```
   This prints a PUBLIC key and saves a PRIVATE key to `license-private.pem`
   (already gitignored — never commit it; back it up safely).

2. **Embed the public key:** paste it into `lib/license.js` → `PUBLIC_KEY_PEM`,
   then commit. Licensing is now enforced for every instance.

3. **License your own instance:** mint a key for your own domain and add it to
   your Vercel env so your studio keeps working:
   ```
   node scripts/sign-license.mjs 499web.co "499 Web Co."
   ```
   Copy the `LICENSE_KEY=...` output → Vercel → your project → Settings →
   Environment Variables → add `LICENSE_KEY` → redeploy.

## Selling to a new operator

1. Take payment however you like — [Lemon Squeezy](https://www.lemonsqueezy.com)
   or [Gumroad](https://gumroad.com) (one-time product), an invoice, etc.
2. Get their **domain** (the one they'll run the studio on).
3. Mint their license:
   ```
   node scripts/sign-license.mjs theirdomain.com "Their Brand"
   # optional expiry:  node scripts/sign-license.mjs theirdomain.com "Their Brand" 2027-01-01
   ```
4. Send them the code (a zip of this repo, minus `license-private.pem`) **and**
   their `LICENSE_KEY`. They follow `DEPLOY-YOUR-OWN.md` and add `LICENSE_KEY`
   to their Vercel env. Their studio runs; on any other domain it won't.

## How it behaves
- **No `LICENSE_KEY`, or wrong/forged/expired key, or wrong domain** → the admin
  studio shows a "License required" screen. The public marketing site and lead
  form still load (so a half-set-up site isn't fully dark), but the studio is locked.
- **Valid key on the licensed domain (or its `www`)** → full access.
- **localhost** is always allowed, so local development isn't blocked.

## Honest limits
This stops casual copying and unauthorized resale, and ties usage to a domain you
control. It is not unbreakable — someone with the source could remove the check.
For a niche B2B tool sold to real operators, pair it with a short license
agreement (EULA) and it's more than enough. (Not legal advice — get a real EULA.)
