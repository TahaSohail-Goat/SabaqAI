// POST /api/auth/reset-password
// Step 2 of OTP-based password reset. Receives { email, otp, password }, validates the
// OTP our own /api/auth/forgot-password sent (see resetOtpKey there), and — only on
// success — updates the password directly via the admin API.
//
// No Supabase recovery session is involved anymore: the OTP itself is the proof of
// ownership, exactly like verify-otp is for signup. This replaces the old flow that
// depended on the user clicking a magic link Supabase emailed via its own mailer.

import { NextRequest, NextResponse } from 'next/server';
import { verifyOtp, resetOtpKey } from '@/lib/email/otp-store';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { findUserByEmail } from '@/lib/auth/find-user';

export async function POST(req: NextRequest) {
  try {
    const { email, otp, password } = await req.json();

    if (!email || !otp || !password) {
      return NextResponse.json(
        { error: 'Email, code and new password are required.' },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 }
      );
    }

    const key = String(email).trim().toLowerCase();
    const result = verifyOtp(resetOtpKey(key), String(otp).trim());

    switch (result) {
      case 'expired':
        return NextResponse.json(
          { error: 'This code has expired. Please request a new one.' },
          { status: 400 }
        );
      case 'too_many_attempts':
        return NextResponse.json(
          { error: 'Too many incorrect attempts. Please request a new code.' },
          { status: 429 }
        );
      case 'invalid':
        return NextResponse.json(
          { error: 'Incorrect code. Please check your email and try again.' },
          { status: 400 }
        );
      case 'valid':
        break; // proceed to the password update
    }

    const admin = getServiceRoleClient();
    if (!admin) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
    }

    // The OTP proved they own the inbox; look the account up again (not trusted from the
    // client) to get the real user id to update.
    const { user } = await findUserByEmail(admin, key);
    if (!user) {
      return NextResponse.json({ error: 'No account found with that email address.' }, { status: 404 });
    }

    const { error } = await admin.auth.admin.updateUserById(user.id, { password });

    if (error) {
      console.error('reset-password error:', error.message);
      return NextResponse.json({ error: 'Could not update your password. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('reset-password error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
