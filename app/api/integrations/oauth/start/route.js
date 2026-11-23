// Begin a provider's sign-in flow for a site the caller may manage.
import { NextResponse } from 'next/server';
import { siteAccess } from '@/lib/access';
import { oauthStart } from '@/lib/integrations/service';
import { platformOrigin } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  try {
    const { site, user, role } = await siteAccess(url.searchParams.get('site') || '', { full: false });
    if (role === 'editor') throw { status: 403, message: 'Only the account owner can change integrations.' };
    return NextResponse.redirect(await oauthStart(site, url.searchParams.get('provider') || '', user, await platformOrigin(req)));
  } catch (e) {
    return new Response(e.message || 'Could not start the connection.', { status: e.status || 400, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
}
