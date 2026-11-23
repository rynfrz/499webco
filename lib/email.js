// Transactional email via Resend (https://resend.com) using plain fetch.
// All sends are best-effort: if no key is configured, we silently no-op so the
// funnel still works on-screen.
import { getSettings } from './db';
import { brand } from './brand';

async function send(to, subject, html) {
  const s = await getSettings();
  if (!s.resendApiKey || !to) return { skipped: true };
  const from = s.fromEmail || brand.email;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.resendApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: `${brand.name} <${from}>`, to: [to], subject, html })
    });
    if (!res.ok) return { error: await res.text() };
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

function shell(title, body) {
  const c = brand.colors;
  return `<div style="font-family:-apple-system,Segoe UI,Inter,sans-serif;max-width:560px;margin:0 auto;background:#0c0e15;color:#eaf0ff;border-radius:16px;overflow:hidden;border:1px solid #222840">
    <div style="background:linear-gradient(100deg,${c.blue},${c.pink});padding:18px 26px;font-weight:800;font-size:20px;color:#04121f">${brand.name.toUpperCase()}</div>
    <div style="padding:26px">
      <h1 style="font-size:22px;margin:0 0 12px">${title}</h1>
      ${body}
      <p style="color:#9aa3bd;font-size:13px;margin-top:28px;border-top:1px solid #222840;padding-top:16px">${brand.name} · Great websites for ${brand.priceLabel} · ${brand.region}</p>
    </div></div>`;
}
const btn = (href, label) => `<a href="${href}" style="display:inline-block;background:linear-gradient(100deg,${brand.colors.cyan},${brand.colors.pink});color:#04121f;font-weight:800;text-decoration:none;padding:13px 24px;border-radius:10px;margin:8px 0">${label}</a>`;

export function prospectConfirmation(to, name) {
  return send(to, `We got your request — your ${brand.priceLabel} site is on the way`,
    shell('Thanks' + (name ? `, ${escapeText(name)}` : '') + '! 🏁', `
      <p>We received your request and our team is on it. Here's what happens next:</p>
      <ol style="color:#cfd6ee;line-height:1.7">
        <li>We design a complete, modern website for your business.</li>
        <li>We send you a private link to preview it — live and clickable.</li>
        <li>You approve it, pay the one flat ${brand.priceLabel}, and we launch it.</li>
      </ol>
      <p>You'll hear from us shortly. No payment until you've seen and love your new site.</p>`));
}

export function teamLeadNotice(to, lead) {
  return send(to, `New ${brand.priceLabel} lead: ${String(lead.name || 'Unknown business').replace(/[\r\n]+/g, ' ').slice(0, 120)}`,
    shell('New prospect submitted', `
      <p style="color:#cfd6ee">A new lead just came in from the website:</p>
      <p style="color:#cfd6ee;line-height:1.8">
        <b>Business:</b> ${escapeText(lead.name || '—')}<br>
        <b>Type:</b> ${escapeText(lead.type || '—')}<br>
        <b>Contact:</b> ${escapeText(lead.email || '—')} · ${escapeText(lead.phone || '—')}<br>
        <b>Current site:</b> ${escapeText(lead.currentUrl || '—')}<br>
        <b>Notes:</b> ${escapeText(lead.notes || '—')}
      </p>
      ${lead.adminUrl ? btn(lead.adminUrl, 'Open in the studio →') : ''}`));
}

export function paymentInstructions(to, name, domain, records) {
  const rows = (records || []).map(r => `<tr><td style="padding:6px 10px;border:1px solid #222840"><b>${r.type}</b></td><td style="padding:6px 10px;border:1px solid #222840">${r.name}</td><td style="padding:6px 10px;border:1px solid #222840;font-family:monospace">${r.value}</td></tr>`).join('');
  return send(to, '🎉 Payment received — let\'s get you live',
    shell('You\'re all set' + (name ? `, ${escapeText(name)}` : '') + '!', `
      <p>Thank you — your payment was received and your website is ready to go live${domain ? ` on <b>${escapeText(domain)}</b>` : ''}.</p>
      ${records && records.length ? `<p>Add these DNS records at your domain registrar to point it to your new site:</p>
      <table style="border-collapse:collapse;font-size:13px;color:#eaf0ff;margin:10px 0"><tr><td style="padding:6px 10px;color:#9aa3bd">Type</td><td style="padding:6px 10px;color:#9aa3bd">Name</td><td style="padding:6px 10px;color:#9aa3bd">Value</td></tr>${rows}</table>
      <p style="color:#9aa3bd;font-size:13px">DNS can take a few minutes to a few hours. We'll confirm once it's live.</p>` :
      `<p>Our team will reach out with the exact steps to point your domain to the new site. If you need a new domain, we'll help you get one.</p>`}
      <p>Questions? Just reply to this email.</p>`));
}

export function teamPaidNotice(to, name, amount) {
  return send(to, `💰 Paid: ${name || 'client'} — $${(amount / 100).toFixed(0)}`,
    shell('Payment received', `<p style="color:#cfd6ee">${escapeText(name || 'A client')} just paid $${(amount / 100).toFixed(0)}. Time to launch their site.</p>`));
}

// Sent automatically when the preview is published — gives the prospect their
// private review/approve/pay link.
export function previewReady(to, name, reviewUrl) {
  return send(to, 'Your new website is ready to preview 👀',
    shell('Take a look' + (name ? `, ${escapeText(name)}` : '') + '!', `
      <p>Your custom website is built and live for you to preview. Click below to see it — and when you love it, approve it and you're moments from going live.</p>
      <p style="text-align:center">${btn(reviewUrl, 'Preview & approve your site →')}</p>
      <p style="color:#9aa3bd;font-size:13px">One flat price — ${brand.priceLabel}, one time. No payment until you approve. This link is private to you.</p>`));
}

// Sent automatically when the site is launched to the client's domain.
export function siteLive(to, name, liveUrl, domain, records) {
  const rows = (records || []).map(r => `<tr><td style="padding:6px 10px;border:1px solid #222840"><b>${r.type}</b></td><td style="padding:6px 10px;border:1px solid #222840">${r.name}</td><td style="padding:6px 10px;border:1px solid #222840;font-family:monospace">${r.value}</td></tr>`).join('');
  return send(to, '🎉 Your website is live!',
    shell('You\'re live' + (name ? `, ${escapeText(name)}` : '') + '! 🏁', `
      <p>Your new website has been deployed${domain ? ` for <b>${escapeText(domain)}</b>` : ''}.</p>
      <p style="text-align:center">${btn(liveUrl, 'Visit your website →')}</p>
      ${records && records.length ? `<p>If you haven't yet, add these DNS records at your registrar so your domain points to the new site:</p>
      <table style="border-collapse:collapse;font-size:13px;color:#eaf0ff;margin:10px 0"><tr><td style="padding:6px 10px;color:#9aa3bd">Type</td><td style="padding:6px 10px;color:#9aa3bd">Name</td><td style="padding:6px 10px;color:#9aa3bd">Value</td></tr>${rows}</table>` : ''}
      <p>Thanks for choosing ${brand.name} — reply anytime if you need a change.</p>`));
}

// ---- Customer accounts ------------------------------------------------------

export function customerInvite(to, businessName, link) {
  return send(to, `Your ${brand.name} website dashboard is ready`,
    shell('Your website, in your hands', `
      <p>Thank you for choosing ${brand.name}. You now have your own dashboard for <b>${escapeText(businessName || 'your website')}</b>.</p>
      <p>From there you can edit text and photos right on the page, add new pages, connect tools like booking and maps, and see how your site is doing. No technical knowledge needed.</p>
      <p style="text-align:center">${btn(link, 'Set your password & open your dashboard →')}</p>
      <p style="color:#9aa3bd;font-size:13px">This link is private to you and works for 7 days. If it expires, reply to this email and we will send a new one.</p>`));
}

export function customerAccessAdded(to, businessName, link) {
  return send(to, `You now have access to ${businessName || 'a website'}`,
    shell('New website added to your account', `
      <p>You have been given access to <b>${escapeText(businessName || 'a website')}</b> in your ${brand.name} dashboard.</p>
      <p style="text-align:center">${btn(link, 'Open your dashboard →')}</p>`));
}

export function passwordReset(to, link) {
  return send(to, `Reset your ${brand.name} password`,
    shell('Reset your password', `
      <p>We received a request to reset the password for your ${brand.name} dashboard.</p>
      <p style="text-align:center">${btn(link, 'Choose a new password →')}</p>
      <p style="color:#9aa3bd;font-size:13px">This link works for 1 hour. If you did not ask for this, you can ignore this email; your password has not changed.</p>`));
}

export function formSubmission(to, businessName, formName, fields, page) {
  const rows = Object.entries(fields).map(([k, v]) => `<tr><td style="padding:6px 10px;border:1px solid #222840;color:#9aa3bd;vertical-align:top">${escapeText(k)}</td><td style="padding:6px 10px;border:1px solid #222840;white-space:pre-wrap">${escapeText(v)}</td></tr>`).join('');
  return send(to, `New ${formName} message from your website`,
    shell('New message from your website', `
      <p style="color:#cfd6ee">Someone just used the ${escapeText(formName)} form on ${escapeText(businessName || 'your website')}${page ? ` (${escapeText(page)})` : ''}.</p>
      <table style="border-collapse:collapse;font-size:14px;color:#eaf0ff;margin:10px 0;width:100%">${rows}</table>
      <p style="color:#9aa3bd;font-size:13px">Reply directly to the person using the contact details above. Messages are also kept in your dashboard.</p>`));
}

export function supportRequestNotice(to, businessName, from, subject, body, adminUrl) {
  return send(to, `Support request: ${subject}`,
    shell('New support request', `
      <p style="color:#cfd6ee"><b>${escapeText(businessName || 'A customer')}</b> (${escapeText(from)}) wrote:</p>
      <p style="color:#eaf0ff;white-space:pre-wrap;border-left:3px solid #5fd8ff;padding-left:12px">${escapeText(body)}</p>
      ${adminUrl ? btn(adminUrl, 'Open in the studio →') : ''}`));
}

export function supportReply(to, subject, reply, link) {
  return send(to, `Re: ${subject}`,
    shell('We replied to your request', `
      <p style="color:#eaf0ff;white-space:pre-wrap">${escapeText(reply)}</p>
      ${link ? `<p style="text-align:center">${btn(link, 'Open your dashboard →')}</p>` : ''}`));
}

function escapeText(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
