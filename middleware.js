// Gate the studio (/admin), the customer area (/dashboard) and every API route
// behind a session cookie. We only check presence/validity of the JWT here
// (Edge runtime); role and ownership checks happen in the route handlers.
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC_PATHS = ['/admin/login', '/admin/setup'];

// Open by design: sign-in, the lead form, the client review/pay flow, the Stripe
// webhook, public website forms + page-view beacons from customer sites,
// customer invite/reset links, OAuth callbacks, and the scheduled job runner
// (which checks its own secret).
const PUBLIC_API = [
  '/api/auth/', '/api/lead', '/api/review/', '/api/approve', '/api/checkout', '/api/stripe/',
  '/api/forms/', '/api/t/', '/api/customer/invite', '/api/customer/reset', '/api/integrations/oauth/callback', '/api/cron/'
];

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/')) ||
    PUBLIC_API.some(p => pathname === p || pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get('wfl_session')?.value;
  let valid = false;
  if (token && process.env.SESSION_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET));
      valid = true;
    } catch {}
  }

  if (!valid) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    // Customers sign in on their own page; the studio keeps its own.
    url.pathname = pathname.startsWith('/dashboard') ? '/login' : '/admin/login';
    url.search = '';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/dashboard/:path*', '/api/:path*']
};
