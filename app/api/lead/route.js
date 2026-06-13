// Public: a prospect submits the lead form. Creates a project in 'lead' status
// with a private review token, emails a confirmation to the prospect and a
// notice to the team. No auth (whitelisted in middleware).
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { sql, initDb, getSettings } from '@/lib/db';
import { blankProject } from '@/lib/projectModel';
import { newId } from '@/lib/auth';
import { prospectConfirmation, teamLeadNotice } from '@/lib/email';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    await initDb();
    const f = await req.json();
    if (!f.name || !f.email) return NextResponse.json({ error: 'Business name and email are required' }, { status: 400 });

    const id = newId('p');
    const p = blankProject(id, f.type || 'Other Local Business');
    p.status = 'lead';
    p.reviewToken = crypto.randomBytes(16).toString('hex');
    p.business.name = String(f.name).slice(0, 120);
    p.business.type = f.type || p.business.type;
    p.business.city = (f.city || '').slice(0, 80);
    p.business.email = (f.email || '').slice(0, 160);
    p.business.phone = (f.phone || '').slice(0, 40);
    p.business.currentUrl = (f.currentUrl || '').slice(0, 300);
    p.business.description = (f.notes || '').slice(0, 2000);
    p.lead = { submittedAt: Date.now(), source: 'website', notes: (f.notes || '').slice(0, 2000) };

    const now = Date.now();
    await sql`INSERT INTO projects (id, owner_id, data, created_at, updated_at)
              VALUES (${id}, NULL, ${JSON.stringify(p)}::jsonb, ${now}, ${now})`;

    const s = await getSettings();
    const origin = new URL(req.url).origin;
    // Fire emails (best-effort; do not block the response on failures).
    prospectConfirmation(p.business.email, p.business.name).catch(() => {});
    if (s.teamNotifyEmail) {
      teamLeadNotice(s.teamNotifyEmail, {
        name: p.business.name, type: p.business.type, email: p.business.email,
        phone: p.business.phone, currentUrl: p.business.currentUrl, notes: p.lead.notes,
        adminUrl: `${origin}/admin/project/${id}`
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Could not submit' }, { status: 500 });
  }
}
