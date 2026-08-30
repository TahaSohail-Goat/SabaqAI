import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ACTIVITY_COOKIE_NAME, activityCookieOptions } from '@/lib/auth/session-activity';

// Handles the OAuth redirect (Google/Facebook) — exchanges ?code for a session cookie,
// then honours ?next if the caller set one.
//
// Password recovery no longer goes through here: /api/auth/forgot-password sends its own
// OTP by email (src/lib/email/mailer.ts) instead of a Supabase magic link, because
// supabase.auth.resetPasswordForEmail()'s built-in mailer has a separate, low rate limit
// unrelated to this project's SMTP account. The generic ?code/?next handling below is
// kept as-is — it's still exactly what OAuth needs — but nothing sends a user here with
// next=/reset-password anymore.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  // Defaults into the app shell, not the marketing homepage — (app)/layout.tsx itself decides
  // whether that lands on /dashboard or bounces to /onboarding, depending on whether this
  // session already has a student_profiles row.
  const next = searchParams.get('next') ?? '/dashboard';

  // Supabase's own auth server redirects straight here with ?error=... when it rejects the
  // OAuth attempt itself (e.g. a stale/mismatched state from two overlapping login attempts)
  // — there's no ?code in that case, nothing to exchange. This used to fall through to the
  // unconditional redirect below and silently land the user back on "/" with zero explanation
  // of what went wrong; surfacing it on /login instead is what makes that failure debuggable.
  const oauthError = searchParams.get('error_description') || searchParams.get('error');
  if (oauthError) {
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('error', oauthError);
    return NextResponse.redirect(loginUrl);
  }

  if (code) {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        const loginUrl = new URL('/login', origin);
        loginUrl.searchParams.set('error', error.message);
        return NextResponse.redirect(loginUrl);
      }
      // Same reasoning as /api/auth/login — see src/lib/auth/session-activity.ts.
      (await cookies()).set(ACTIVITY_COOKIE_NAME, Date.now().toString(), activityCookieOptions());
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
