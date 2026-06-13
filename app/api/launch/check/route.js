import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { checkDomain } from '@/lib/deploy';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    await requireUser();
    const { projectName, domain } = await req.json();
    const settings = await getSettings();
    const status = await checkDomain(settings, { projectName, domain });
    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
