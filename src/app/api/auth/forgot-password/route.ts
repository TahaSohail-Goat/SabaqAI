// POST /api/auth/forgot-password
//
// Sends a password reset email via Supabase Auth.
// Supabase emails the user a link that points back to /auth/callback?next=/reset-password,
// which exchanges the code for a recovery session and lands on the reset page.
//
// Always returns success=true even when the email doesn't exist — this prevents
// account enumeration (an attacker cannot tell which emails are registered).

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    if (!supabase) {
      // Demo mode — pretend it worked
      return NextResponse.json({ success: true, isDemo: true });
    }

    const origin = req.headers.get('origin') ?? req.nextUrl.origin;

    // redirectTo is where Supabase will send the user after they click the email link.
    // The ?next param tells our callback where to land after exchanging the code.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    });

    // Swallow "user not found" to prevent account enumeration — always tell the
    // client we sent the email. Log real errors server-side for debugging.
    if (error && !error.message.includes('not found') && !error.message.includes('no user')) {
      console.error('forgot-password error:', error.message);
      return NextResponse.json({ error: 'Failed to send reset email. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('forgot-password error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
