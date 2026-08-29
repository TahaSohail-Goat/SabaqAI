import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      await supabase.auth.exchangeCodeForSession(code);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
