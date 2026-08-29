// POST /api/auth/send-otp
// Step 1 of email-verified signup.
//
// Validates the email, username and password, checks that neither the email nor the
// username is already taken, generates a 6-digit OTP, stores it in the in-memory OTP
// store with a 2-minute TTL, and sends it to the user's email via Nodemailer.
//
// The code is NEVER returned in the response body — only sent by email.
// In demo mode (no SMTP credentials) the code is logged server-side so devs
// can still test the flow without a mail account.

import { NextRequest, NextResponse } from 'next/server';
import { generateOtp, storeOtp } from '@/lib/email/otp-store';
import { sendEmail, buildOtpEmail } from '@/lib/email/mailer';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { findUserByEmail } from '@/lib/auth/find-user';

// Simple rate-limit: one OTP request per email per 60 seconds.
const lastSent = new Map<string, number>();
const RESEND_COOLDOWN_MS = 60_000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Username, not a display name: short handle, no spaces — matches what the signup
// form now collects and what has to stay unique across accounts.
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

// Escapes Postgres ILIKE wildcards (% and _) so a username containing an underscore —
// which USERNAME_RE explicitly allows — is matched literally, not as a single-char wildcard.
function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

export async function POST(req: NextRequest) {
  try {
    const { email, password, full_name: username, class_level: classLevel } = await req.json();

    if (!email || !password || !username) {
      return NextResponse.json(
        { error: 'Username, email and password are required.' },
        { status: 400 }
      );
    }

    const key = email.toLowerCase().trim();
    const trimmedUsername = String(username).trim();

    if (!EMAIL_RE.test(key)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
    if (!USERNAME_RE.test(trimmedUsername)) {
      return NextResponse.json(
        { error: 'Username must be 3-20 characters — letters, numbers and underscores only.' },
        { status: 400 }
      );
    }
    // Same range Topbar/Settings/onboarding already offer — class_levels is seeded 1-12,
    // but only 9-12 is in scope for what the app actually shows content for today.
    if (![9, 10, 11, 12].includes(classLevel)) {
      return NextResponse.json({ error: 'Please select a valid class (9-12).' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password should be at least 6 characters long.' },
        { status: 400 }
      );
    }

    // Rate-limit resends
    const last = lastSent.get(key);
    if (last && Date.now() - last < RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - last)) / 1000);
      return NextResponse.json(
        { error: `Please wait ${waitSec}s before requesting another code.` },
        { status: 429 }
      );
    }

    // Reject duplicates *before* sending a code — there is no point making someone wait
    // for an email, enter it, and only then find out the account already exists.
    const admin = getServiceRoleClient();
    if (admin) {
      const { user: existingUser } = await findUserByEmail(admin, key);
      if (existingUser) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Try logging in instead.' },
          { status: 409 }
        );
      }

      // Username: this table IS exposed (service-role bypasses RLS), so a direct,
      // case-insensitive query is both simpler and cheaper than the email check above.
      const { data: existingUsername, error: usernameError } = await admin
        .from('users')
        .select('id')
        .ilike('display_name', escapeIlike(trimmedUsername))
        .maybeSingle();

      if (usernameError) {
        console.error('send-otp: username lookup failed:', usernameError.message);
      } else if (existingUsername) {
        return NextResponse.json(
          { error: 'That username is already taken. Please choose another.' },
          { status: 409 }
        );
      }
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
