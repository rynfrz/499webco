// Upload a business photo to Vercel Blob and return its public CDN URL.
// Photos are public because they're embedded in the live client websites;
// the random suffix keeps the URL unguessable. DELETE removes a blob.
import { NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import { requireUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req) {
  try {
    await requireUser();
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: 'Image hosting is not configured. Create a Blob store in Vercel (Storage → Blob) and redeploy.' }, { status: 500 });
    }
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: 'Image too large (max 8MB)' }, { status: 413 });

    const safeName = (file.name || 'photo').replace(/[^a-zA-Z0-9.\-_]/g, '-').slice(-60);
    const blob = await put(`photos/${safeName}`, file, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.type || 'image/jpeg'
    });
    return NextResponse.json({ url: blob.url });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Upload failed' }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    await requireUser();
    const url = new URL(req.url).searchParams.get('url');
    if (!url) return NextResponse.json({ error: 'No url' }, { status: 400 });
    await del(url);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Best-effort: removing the reference matters more than the orphan blob.
    return NextResponse.json({ ok: true });
  }
}
