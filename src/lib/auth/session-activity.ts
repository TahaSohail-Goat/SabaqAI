// Enforces two things Supabase's own session cookie can't give us on its own:
//   1. Closing the browser ends the session. @supabase/ssr (0.12.5) hardcodes its auth
//      cookie's Max-Age to 400 days on every write — see setCookieOptions in
//      node_modules/@supabase/ssr/dist/module/cookies.js, which spreads a caller-supplied
//      cookieOptions but then unconditionally overwrites maxAge back to the 400-day
//      default. There is no supported way to shorten it through that API.
//   2. Being idle for too long ends the session, even with the tab left open.
//
// The workaround: a small first-party cookie, independent of Supabase's, holding the
// timestamp of the last request we saw. It carries no Max-Age, so — unlike the Supabase
// cookie — the browser itself discards it when it fully closes. Its absence (while a
// Supabase session cookie is still technically present and valid) or staleness both mean
// the same thing: treat this request as logged out.
//
// Refreshed from two places so both page navigation and pure API activity count:
// middleware.ts (page requests) and getCurrentUserAndProfile (every API route, since
// that's where most real activity in this app — chat, quiz grading — actually happens).

export const ACTIVITY_COOKIE_NAME = 'sabaqai-active';

// 30 minutes idle. Adjust here only — both enforcement points import this constant.
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export function isActivityFresh(rawCookieValue: string | undefined): boolean {
  if (!rawCookieValue) return false;
  const lastActive = Number(rawCookieValue);
  if (!Number.isFinite(lastActive)) return false;
  return Date.now() - lastActive < IDLE_TIMEOUT_MS;
}

/** Options for writing the marker cookie. Deliberately no maxAge/expires — see file header. */
export function activityCookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
}
