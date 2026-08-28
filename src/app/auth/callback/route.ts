import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Completes the OAuth redirect from Supabase (Google/Facebook — see SocialAuthButtons):
// exchanges the ?code for a session cookie, then sends the user back into the app.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      await supabase.auth.exchangeCodeForSession(code);
    }
  }

  return NextResponse.redirect(`${origin}/`);
}
