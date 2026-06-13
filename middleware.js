// Gate everything under /admin behind a session cookie.
// We only check presence/validity of the JWT here (Edge runtime);
// role checks and DB lookups happen in the route handlers/pages.
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC_PATHS = ['/admin/login', '/admin/setup'];

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  // Public auth pages and the APIs that power them are allowed through.
  if (
    PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/')) ||
    pathname.startsWith('/api/auth/')
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
    url.pathname = '/admin/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Protect the admin UI and all app APIs (auth APIs are whitelisted above).
  matcher: ['/admin/:path*', '/api/:path*']
};
