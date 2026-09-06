// POST /api/auth/verify-reset-otp
// Lets the reset-password page confirm a code is correct BEFORE showing the new-password
// step, without spending the code's one-time use — /api/auth/reset-password still does the
// real verify+consume+update when the user actually submits a new password.

import { NextRequest, NextResponse } from 'next/server';
import { peekOtp, resetOtpKey } from '@/lib/email/otp-store';

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();

    if (!email || !otp) {
      return NextResponse.json({ error: 'Email and code are required.' }, { status: 400 });
    }

    const key = String(email).trim().toLowerCase();
    const result = await peekOtp(resetOtpKey(key), String(otp).trim());

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
        return NextResponse.json({ success: true });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('verify-reset-otp error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
