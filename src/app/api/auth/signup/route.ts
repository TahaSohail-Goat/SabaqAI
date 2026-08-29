// POST /api/auth/signup
// Legacy direct-signup route — kept for backwards compatibility.
// New flow uses /api/auth/send-otp + /api/auth/verify-otp (email-verified).
// This route still works for demo mode and any non-UI callers.

import { NextRequest, NextResponse } from 'next/server';
import { createAccount } from '@/lib/auth/create-account';

export async function POST(req: NextRequest) {
  try {
    // PCTB removed for now, coming back later — this interim default is overwritten moments
    // later by /api/auth/onboarding for any account that completes it.
    const { email, password, full_name, class_level = 10, board = 'FBISE' } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const result = await createAccount({ email, password, full_name, class_level, board });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('Signup error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
