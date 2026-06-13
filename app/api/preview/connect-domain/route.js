import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { connectPreviewDomain } from '@/lib/deploy';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST() {
  try {
    await requireAdmin();
    const settings = await getSettings();
    const res = await connectPreviewDomain(settings);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
