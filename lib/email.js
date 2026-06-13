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
    shell('Thanks' + (name ? `, ${name}` : '') + '! 🏁', `
      <p>We received your request and our team is on it. Here's what happens next:</p>
      <ol style="color:#cfd6ee;line-height:1.7">
        <li>We design a complete, modern website for your business.</li>
        <li>We send you a private link to preview it — live and clickable.</li>
        <li>You approve it, pay the one flat ${brand.priceLabel}, and we launch it.</li>
      </ol>
      <p>You'll hear from us shortly. No payment until you've seen and love your new site.</p>`));
}

export function teamLeadNotice(to, lead) {
  return send(to, `New ${brand.priceLabel} lead: ${lead.name || 'Unknown business'}`,
    shell('New prospect submitted', `
      <p style="color:#cfd6ee">A new lead just came in from the website:</p>
      <p style="color:#cfd6ee;line-height:1.8">
        <b>Business:</b> ${lead.name || '—'}<br>
        <b>Type:</b> ${lead.type || '—'}<br>
        <b>Contact:</b> ${lead.email || '—'} · ${lead.phone || '—'}<br>
        <b>Current site:</b> ${lead.currentUrl || '—'}<br>
        <b>Notes:</b> ${lead.notes || '—'}
      </p>
      ${lead.adminUrl ? btn(lead.adminUrl, 'Open in the studio →') : ''}`));
}

export function paymentInstructions(to, name, domain, records) {
  const rows = (records || []).map(r => `<tr><td style="padding:6px 10px;border:1px solid #222840"><b>${r.type}</b></td><td style="padding:6px 10px;border:1px solid #222840">${r.name}</td><td style="padding:6px 10px;border:1px solid #222840;font-family:monospace">${r.value}</td></tr>`).join('');
  return send(to, '🎉 Payment received — let\'s get you live',
    shell('You\'re all set' + (name ? `, ${name}` : '') + '!', `
      <p>Thank you — your payment was received and your website is ready to go live${domain ? ` on <b>${domain}</b>` : ''}.</p>
      ${records && records.length ? `<p>Add these DNS records at your domain registrar to point it to your new site:</p>
      <table style="border-collapse:collapse;font-size:13px;color:#eaf0ff;margin:10px 0"><tr><td style="padding:6px 10px;color:#9aa3bd">Type</td><td style="padding:6px 10px;color:#9aa3bd">Name</td><td style="padding:6px 10px;color:#9aa3bd">Value</td></tr>${rows}</table>
      <p style="color:#9aa3bd;font-size:13px">DNS can take a few minutes to a few hours. We'll confirm once it's live.</p>` :
      `<p>Our team will reach out with the exact steps to point your domain to the new site. If you need a new domain, we'll help you get one.</p>`}
      <p>Questions? Just reply to this email.</p>`));
}

export function teamPaidNotice(to, name, amount) {
  return send(to, `💰 Paid: ${name || 'client'} — $${(amount / 100).toFixed(0)}`,
    shell('Payment received', `<p style="color:#cfd6ee">${name || 'A client'} just paid $${(amount / 100).toFixed(0)}. Time to launch their site.</p>`));
}

// Sent automatically when the preview is published — gives the prospect their
// private review/approve/pay link.
export function previewReady(to, name, reviewUrl) {
  return send(to, 'Your new website is ready to preview 👀',
    shell('Take a look' + (name ? `, ${name}` : '') + '!', `
      <p>Your custom website is built and live for you to preview. Click below to see it — and when you love it, approve it and you're moments from going live.</p>
      <p style="text-align:center">${btn(reviewUrl, 'Preview & approve your site →')}</p>
      <p style="color:#9aa3bd;font-size:13px">One flat price — ${brand.priceLabel}, one time. No payment until you approve. This link is private to you.</p>`));
}

// Sent automatically when the site is launched to the client's domain.
export function siteLive(to, name, liveUrl, domain, records) {
  const rows = (records || []).map(r => `<tr><td style="padding:6px 10px;border:1px solid #222840"><b>${r.type}</b></td><td style="padding:6px 10px;border:1px solid #222840">${r.name}</td><td style="padding:6px 10px;border:1px solid #222840;font-family:monospace">${r.value}</td></tr>`).join('');
  return send(to, '🎉 Your website is live!',
    shell('You\'re live' + (name ? `, ${name}` : '') + '! 🏁', `
      <p>Your new website has been deployed${domain ? ` for <b>${domain}</b>` : ''}.</p>
      <p style="text-align:center">${btn(liveUrl, 'Visit your website →')}</p>
      ${records && records.length ? `<p>If you haven't yet, add these DNS records at your registrar so your domain points to the new site:</p>
      <table style="border-collapse:collapse;font-size:13px;color:#eaf0ff;margin:10px 0"><tr><td style="padding:6px 10px;color:#9aa3bd">Type</td><td style="padding:6px 10px;color:#9aa3bd">Name</td><td style="padding:6px 10px;color:#9aa3bd">Value</td></tr>${rows}</table>` : ''}
      <p>Thanks for choosing ${brand.name} — reply anytime if you need a change.</p>`));
}
