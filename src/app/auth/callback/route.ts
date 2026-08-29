import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Handles two cases:
//   1. OAuth redirect (Google/Facebook) — exchanges ?code for a session cookie
//   2. Password recovery — exchanges ?code and redirects to /reset-password
//      (the reset email is sent with redirectTo pointing here with ?next=/reset-password)
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
