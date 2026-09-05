// POST /api/auth/verify-otp
// Step 2 of email-verified signup.
//
// Receives { email, otp, password, full_name }, validates the OTP against the
// in-memory store, then — only on success — creates the Supabase account.
//
// Invariant: the Supabase account is NEVER created before the OTP is validated.
// This means unverified email addresses never produce real auth users.

import { NextRequest, NextResponse } from 'next/server';
import { verifyOtp } from '@/lib/email/otp-store';
import { createAccount } from '@/lib/auth/create-account';

export async function POST(req: NextRequest) {
  try {
    const { email, otp, password, full_name, class_level, board } = await req.json();

    if (!email || !otp || !password) {
      return NextResponse.json(
        { error: 'Email, OTP and password are required.' },
        { status: 400 }
      );
    }
    if (![9, 10, 11, 12].includes(class_level)) {
      return NextResponse.json({ error: 'Please select a valid class (9-12).' }, { status: 400 });
    }

    const key = email.toLowerCase().trim();
    const result = await verifyOtp(key, otp.trim());

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
        break; // proceed to account creation
    }

    // OTP validated — now create the real account
    const accountResult = await createAccount({
      email: key,
      password,
      full_name,
      class_level,
      board,
    });

    if (!accountResult.success) {
      return NextResponse.json({ error: accountResult.error }, { status: 400 });
    }

    return NextResponse.json(accountResult);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('verify-otp error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
