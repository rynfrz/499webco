// OAuth redirect target. The signed state ties the response to the person and
// site that started it; the session cookie must belong to that same person.
import { NextResponse } from 'next/server';
import { requireSession, isStaff } from '@/lib/auth';
import { siteAccess } from '@/lib/access';
import { oauthCallback, connect } from '@/lib/integrations/service';
import { upsertInstance } from '@/lib/integrations/store';
import { platformOrigin } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const origin = await platformOrigin(req);
  let back = '/dashboard';
  try {
    const user = await requireSession();
    if (url.searchParams.get('error')) throw { status: 400, message: 'The connection was cancelled.' };
    const r = await oauthCallback({ code: url.searchParams.get('code'), state: url.searchParams.get('state') }, user, origin);
    const { site } = await siteAccess(r.siteId, { full: false });   // still allowed to manage this site?
    back = isStaff(user) ? `/admin/project/${site.projectId}?step=3` : `/dashboard/site/${site.id}/integrations`;
    // Store the tokens first, then run the provider's real validation with them.
    await upsertInstance(site.id, r.providerId, { status: 'configuration_required', config: {}, secrets: r.secrets, actorId: user.id });
    await connect(site, r.providerId, {}, { actorId: user.id });
    return NextResponse.redirect(`${origin}${back}?connected=${encodeURIComponent(r.providerId)}`);
  } catch (e) {
    return NextResponse.redirect(`${origin}${back}?integration_error=${encodeURIComponent(String(e.message || 'Could not connect').slice(0, 160))}`);
  }
}
