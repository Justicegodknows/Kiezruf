// Optimistic check for the console (Next 16 Proxy, formerly Middleware): a /console page without a staff
// session cookie goes to the console sign-in. The real check is the API's, on every /staff/* call; the console
// pages send the staff member to sign-in again when a call answers 401.
import { NextResponse, type NextRequest } from 'next/server';
import { CONSOLE_SIGN_IN, safeConsoleNext } from '@/lib/console-paths';
import { STAFF_COOKIE } from '@/server/bff';

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === CONSOLE_SIGN_IN) return NextResponse.next();
  if (request.cookies.get(STAFF_COOKIE)?.value) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = CONSOLE_SIGN_IN;
  url.search = '';
  url.searchParams.set('next', safeConsoleNext(`${pathname}${search}`));
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/console', '/console/:path*'],
};
