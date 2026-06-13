// GET: any signed-in user (designers need non-secret bits like previewDomain).
// Secrets are redacted for non-admins. PATCH: admin only.
import { NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/db';
import { requireUser, requireAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

const SECRET_KEYS = ['anthropicKey', 'vercelToken', 'netlifyToken'];

export async function GET() {
  try {
    const u = await requireUser();
    const s = await getSettings();
    if (u.role !== 'admin') {
      // Redact secrets; expose only presence so the UI can warn if missing.
      const safe = { ...s };
      for (const k of SECRET_KEYS) safe[k] = s[k] ? '••••set' : '';
      return NextResponse.json({ settings: safe, redacted: true });
    }
    return NextResponse.json({ settings: s, redacted: false });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}

export async function PATCH(req) {
  try {
    await requireAdmin();
    const patch = await req.json();
    // Ignore redaction placeholders so a re-save doesn't overwrite real secrets.
    for (const k of SECRET_KEYS) if (patch[k] === '••••set') delete patch[k];
    const merged = await saveSettings(patch);
    return NextResponse.json({ settings: merged });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
