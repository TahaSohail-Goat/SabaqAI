// POST /api/auth/send-otp
// Step 1 of email-verified signup.
//
// Receives { email, password, full_name }, generates a 6-digit OTP, stores it
// in the in-memory OTP store with a 10-minute TTL, and sends it to the user's
// email via Nodemailer.
//
// The code is NEVER returned in the response body — only sent by email.
// In demo mode (no SMTP credentials) the code is logged server-side so devs
// can still test the flow without a mail account.

import { NextRequest, NextResponse } from 'next/server';
import { generateOtp, storeOtp } from '@/lib/email/otp-store';
import { sendEmail, buildOtpEmail } from '@/lib/email/mailer';

// Simple rate-limit: one OTP request per email per 60 seconds.
const lastSent = new Map<string, number>();
const RESEND_COOLDOWN_MS = 60_000;

export async function POST(req: NextRequest) {
  try {
    const { email, password, full_name } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const key = email.toLowerCase().trim();

    // Rate-limit resends
    const last = lastSent.get(key);
    if (last && Date.now() - last < RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - last)) / 1000);
      return NextResponse.json(
        { error: `Please wait ${waitSec}s before requesting another code.` },
        { status: 429 }
      );
    }

    const code = generateOtp();
    storeOtp(key, code);
    lastSent.set(key, Date.now());

    const sent = await sendEmail(
      key,
      'Your SabaqAI verification code',
      buildOtpEmail(code)
    );

    if (!sent) {
      // SMTP not configured — log code server-side for dev testing
      console.log(`[send-otp] DEV MODE — OTP for ${key}: ${code}`);
    }

    return NextResponse.json({
      success: true,
      // Reveal whether we're in demo/no-SMTP mode so the UI can show a hint
      emailSent: sent,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('send-otp error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
