// Hard account deletion — confirmed with the user as the intended behavior (immediate,
// permanent, no soft-delete/grace-period). Requires a fresh email OTP first (see
// /api/auth/delete-account/send-otp), not a re-entered password: a Google/social-only
// account has no password to re-enter, and rather than branch between two different
// confirmation methods depending on how the account signed up, every account confirms the
// same way — proving control of the inbox is exactly as strong a check as a password would
// be, and it's the same reasoning /api/auth/reset-password already uses.
//
// admin.auth.admin.deleteUser() removes the auth.users row, which cascades through
// users → student_profiles → student_subjects → quizzes → quiz_questions/quiz_attempts →
// everything else keyed off it (all "on delete cascade" — see supabase/migrations/0001_init.sql).
// One call, no manual table-by-table cleanup needed.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { verifyOtp, deleteAccountOtpKey } from '@/lib/email/otp-store';

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUserAndProfile();
    if (!user || !user.email) {
      return NextResponse.json({ error: 'You need to be logged in.' }, { status: 401 });
    }

    const admin = getServiceRoleClient();
    if (!admin) {
      return NextResponse.json({ error: 'Server is not configured for this yet.' }, { status: 500 });
    }

    const { otp } = await req.json();
    if (!otp || typeof otp !== 'string') {
      return NextResponse.json({ error: 'Enter the code we emailed you to confirm account deletion.' }, { status: 400 });
    }

    const result = verifyOtp(deleteAccountOtpKey(user.email.toLowerCase().trim()), otp.trim());
    switch (result) {
      case 'expired':
        return NextResponse.json({ error: 'This code has expired. Please request a new one.' }, { status: 400 });
      case 'too_many_attempts':
        return NextResponse.json({ error: 'Too many incorrect attempts. Please request a new code.' }, { status: 429 });
      case 'invalid':
        return NextResponse.json({ error: 'Incorrect code. Please check your email and try again.' }, { status: 400 });
      case 'valid':
        break; // proceed to deletion
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error('Delete account: deleteUser failed:', deleteError.message);
      return NextResponse.json({ error: 'Could not delete your account. Please try again.' }, { status: 500 });
    }

    // Same clearing mechanism /api/auth/logout already uses — the @supabase/ssr cookie
    // adapter, not a manual cookie-name guess. Still clears the browser's session cookies
    // correctly even though the underlying auth user is already gone.
    const supabase = await createServerSupabaseClient();
    if (supabase) await supabase.auth.signOut();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Delete account error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
