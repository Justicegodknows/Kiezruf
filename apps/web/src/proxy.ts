// Next 16 Proxy (formerly Middleware). Two jobs:
// 1. Keep the Supabase session fresh on every page request: an expired access token is refreshed here and the new
//    cookies go out with the response (and into this request, for the page it renders). /api routes refresh on
//    their own, so they are not matched.
// 2. Console pages need a staff-grade session: signed in, `aal2`, TOTP checked within 12 hours. Anything less
//    goes to the console sign-in, which picks the missing step. The real check is the API's on every /staff/*
//    call; this one only spares staff a page that cannot load.
import { NextResponse, type NextRequest } from 'next/server';
import { CONSOLE_SIGN_IN, safeConsoleNext } from '@/lib/console-paths';
import { staffMfaFresh, supabaseEnv, supabaseForRequest } from '@/server/supabase';

function isConsolePage(pathname: string): boolean {
  return (pathname === '/console' || pathname.startsWith('/console/')) && pathname !== CONSOLE_SIGN_IN;
}

function toSignIn(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const url = request.nextUrl.clone();
  url.pathname = CONSOLE_SIGN_IN;
  url.search = '';
  url.searchParams.set('next', safeConsoleNext(`${pathname}${search}`));
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const guarded = isConsolePage(request.nextUrl.pathname);
  const env = supabaseEnv();
  if (!env) return guarded ? toSignIn(request) : NextResponse.next();

  const supabase = supabaseForRequest(request, env);
  // getClaims refreshes an expired session and checks the token's signature (Supabase signing keys).
  let claims: Parameters<typeof staffMfaFresh>[0] = null;
  try {
    const { data } = await supabase.client.auth.getClaims();
    claims = data?.claims ?? null;
  } catch {
    claims = null;
  }

  if (guarded && !staffMfaFresh(claims)) return supabase.apply(toSignIn(request));
  // NextResponse.next({ request }) passes the refreshed cookies on to the page being rendered.
  return supabase.apply(supabase.changed() ? NextResponse.next({ request }) : NextResponse.next());
}

export const config = {
  matcher: [
    // Every page, but not /api (its handlers manage the session), Next's own files or static assets.
    '/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|webmanifest)$).*)',
  ],
};
