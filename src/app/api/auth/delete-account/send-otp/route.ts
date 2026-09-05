// POST /api/auth/delete-account/send-otp
// Step 1 of account deletion. Sends a 6-digit code to the CURRENT session's own email —
// never a client-supplied one, so this can't be used to spam or probe a different account.
// Same reasoning as /api/auth/forgot-password's OTP, sent through our own Nodemailer
// pipeline rather than Supabase's built-in mailer.

import { NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import {
  generateOtp,
  storeOtp,
  deleteAccountOtpKey,
  secondsUntilResendAllowed,
} from '@/lib/email/otp-store';
import { sendEmail, buildDeleteAccountEmail } from '@/lib/email/mailer';

export async function POST() {
  try {
    const { user } = await getCurrentUserAndProfile();
    if (!user || !user.email) {
      return NextResponse.json({ error: 'You need to be logged in.' }, { status: 401 });
    }

    const key = user.email.toLowerCase().trim();

    // Rate-limit resends, tracked in auth_otps so the limit holds across serverless instances
    // (see otp-store.ts).
    const waitSec = await secondsUntilResendAllowed(deleteAccountOtpKey(key));
    if (waitSec > 0) {
      return NextResponse.json(
        { error: `Please wait ${waitSec}s before requesting another code.` },
        { status: 429 }
      );
    }

    const code = generateOtp();
    await storeOtp(deleteAccountOtpKey(key), code);

    const sent = await sendEmail(key, 'Confirm deleting your SabaqAI account', buildDeleteAccountEmail(code));
    if (!sent) {
      console.log(`[delete-account/send-otp] DEV MODE — OTP for ${key}: ${code}`);
    }

    return NextResponse.json({ success: true, emailSent: sent });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('delete-account/send-otp error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
