// Next.js middleware — runs on every request before the page renders.
//
// Two jobs:
//   1. Refresh the Supabase session cookie on every request so it doesn't
//      expire mid-session. Without this, a user who stays logged in for more
//      than an hour gets silently logged out.
//   2. Auth guard: redirect unauthenticated users away from protected routes
//      to /login, and redirect logged-in users away from auth pages to /dashboard.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { ACTIVITY_COOKIE_NAME, activityCookieOptions, isActivityFresh } from '@/lib/auth/session-activity';

// Routes that require authentication
const PROTECTED_PREFIXES = ['/dashboard', '/doubts', '/chat', '/quiz', '/syllabus', '/eval', '/settings'];

// Routes only for guests (redirect to dashboard if already logged in)
const AUTH_ONLY_ROUTES = ['/login', '/signup'];

// Routes accessible by anyone regardless of auth state (no redirect either way)
const PUBLIC_ROUTES = ['/forgot-password', '/reset-password'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip middleware for API routes and static assets
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/auth/') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase is not configured, let everything through (demo mode)
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  // Build a response we can attach refreshed cookie headers to
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Apply cookie changes to the outgoing response
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // IMPORTANT: always call getUser(), never getSession().
  // getSession() reads from the cookie without revalidating with Supabase Auth,
  // which means an attacker can forge a cookie and appear logged in. getUser()
  // hits the Auth server and is the only secure check.
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  let user = authUser;
  let loggedOutReason: 'inactivity' | 'session_ended' | null = null;

  if (user) {
    const activityCookie = req.cookies.get(ACTIVITY_COOKIE_NAME)?.value;
    if (isActivityFresh(activityCookie)) {
      response.cookies.set(ACTIVITY_COOKIE_NAME, Date.now().toString(), activityCookieOptions());
    } else {
      // Stale (idle too long) or missing entirely. Missing is the expected shape of "the
      // browser was fully closed and reopened" — this marker cookie carries no Max-Age,
      // so unlike Supabase's own 400-day cookie it doesn't survive that (see
      // src/lib/auth/session-activity.ts for why Supabase's cookie can't just be
      // shortened directly). Either way, the session ends here.
      loggedOutReason = activityCookie ? 'inactivity' : 'session_ended';
      await supabase.auth.signOut();
      response.cookies.set(ACTIVITY_COOKIE_NAME, '', { ...activityCookieOptions(), maxAge: 0 });
      user = null;
    }
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthOnly = AUTH_ONLY_ROUTES.some((p) => pathname.startsWith(p));
  const isPublic = PUBLIC_ROUTES.some((p) => pathname.startsWith(p));

  // Redirects below build a fresh NextResponse — carry over any cookie mutations already
  // staged on `response` (a refreshed Supabase token, the forced signOut above) so they
  // still reach the browser instead of being silently dropped with the discarded response.
  const redirectTo = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  // Public routes bypass all auth guards
  if (isPublic) return response;

  // Not logged in → redirect away from protected routes
  if (!user && isProtected) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    if (loggedOutReason) loginUrl.searchParams.set('reason', loggedOutReason);
    return redirectTo(loginUrl);
  }

  // Already logged in → redirect away from auth pages
  if (user && isAuthOnly) {
    const dashboardUrl = req.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    dashboardUrl.search = '';
    return redirectTo(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
