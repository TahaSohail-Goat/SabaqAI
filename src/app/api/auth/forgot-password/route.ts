// POST /api/auth/forgot-password
// Step 1 of OTP-based password reset — mirrors signup's send-otp/verify-otp pattern.
//
// Sent through our own Nodemailer pipeline (src/lib/email/mailer.ts), NOT
// supabase.auth.resetPasswordForEmail(). That call uses Supabase's own built-in mailer,
// which has a separate, low rate limit unrelated to this project's SMTP account and not
// configurable from application code — this was a real, observed failure
// ("email rate limit exceeded" from Supabase, not from us), not a hypothetical one.
//
// Returns a 404 when the email has no account — deliberate product choice (clear feedback
// over anti-enumeration protection). This means a caller can use this endpoint to check
// whether an email is registered; accepted tradeoff per explicit product decision.

import { NextRequest, NextResponse } from 'next/server';
import { generateOtp, storeOtp, resetOtpKey } from '@/lib/email/otp-store';
import { sendEmail, buildPasswordResetEmail } from '@/lib/email/mailer';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { findUserByEmail } from '@/lib/auth/find-user';

const lastSent = new Map<string, number>();
const RESEND_COOLDOWN_MS = 60_000;

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const key = email.trim().toLowerCase();

    const last = lastSent.get(key);
    if (last && Date.now() - last < RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - last)) / 1000);
      return NextResponse.json(
        { error: `Please wait ${waitSec}s before requesting another code.` },
        { status: 429 }
      );
    }
    // Set unconditionally, before the existence check below — see the file comment.
    lastSent.set(key, Date.now());

    const admin = getServiceRoleClient();
    if (!admin) {
      // Demo mode — nothing real to reset, but don't break the flow over it.
      return NextResponse.json({ success: true, isDemo: true });
    }

    const { user } = await findUserByEmail(admin, key);

    if (!user) {
      return NextResponse.json(
        { error: 'No account found with that email address.' },
        { status: 404 }
      );
    }

    const code = generateOtp();
    storeOtp(resetOtpKey(key), code);

    const sent = await sendEmail(key, 'Reset your SabaqAI password', buildPasswordResetEmail(code));
    if (!sent) {
      // SMTP not configured — log code server-side for dev testing
      console.log(`[forgot-password] DEV MODE — reset OTP for ${key}: ${code}`);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('forgot-password error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
