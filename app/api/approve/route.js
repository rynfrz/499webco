// Public: the client approves the design (by review token). Records approval.
import { NextResponse } from 'next/server';
import { projectByToken, patchProject } from '@/lib/db';
import { projectHasSite } from '@/lib/projectModel';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { token } = await req.json();
    const p = await projectByToken(token);
    if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!projectHasSite(p)) return NextResponse.json({ error: 'Site is not ready to approve yet' }, { status: 400 });
    if (!['paid', 'launched'].includes(p.status)) {
      // Merge only these keys so a concurrent edit elsewhere is not overwritten.
      await patchProject(p.id, { approvedAt: Date.now(), status: 'approved' });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
