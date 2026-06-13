// Public: the client approves the design (by review token). Records approval.
import { NextResponse } from 'next/server';
import { projectByToken, putProject } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { token } = await req.json();
    const p = await projectByToken(token);
    if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!p.generatedHtml) return NextResponse.json({ error: 'Site is not ready to approve yet' }, { status: 400 });
    if (!['paid', 'launched'].includes(p.status)) {
      p.approvedAt = Date.now();
      p.status = 'approved';
      await putProject(p);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
