// Shared Supabase account-creation logic used by both /api/auth/signup and
// /api/auth/verify-otp. Extracted here to avoid duplication — the two routes
// had identical code and would have drifted apart.
//
// Returns a plain object (not a NextResponse) so each route can shape its own
// HTTP response.
//
// IMPORTANT: creates the user via the admin API with email_confirm: true, not the
// public auth.signUp() call. Our own OTP (src/lib/email/otp-store.ts) already proved
// the student owns this address before this function is ever called — using signUp()
// here would ALSO trigger Supabase's own built-in "Confirm your signup" email and
// leave the account unconfirmed until that separate link is clicked, meaning the
// student gets two different verification emails for one signup and can't log in
// until they act on both. This was a real bug, not a hypothetical one.

import { getServiceRoleClient } from '@/lib/supabase/admin';

// Matches the subjects seeded in 0001_init.sql. Every new student is enrolled in all of
// them by default — signup doesn't ask which ones apply, and content coverage (what's
// actually been ingested) is what really gates usefulness, not enrollment.
const ALL_SUBJECT_CODES = ['physics', 'chemistry', 'biology', 'mathematics', 'english', 'urdu'];

export interface CreateAccountParams {
  email: string;
  password: string;
  full_name?: string;
  class_level?: number;
  board?: string;
}

export interface CreateAccountResult {
  success: true;
  user: object;
  session: object | null;
  profileCreated: boolean;
  isDemo?: boolean;
  message?: string;
}

export type CreateAccountError = {
  success: false;
  error: string;
};

export async function createAccount(
  params: CreateAccountParams
): Promise<CreateAccountResult | CreateAccountError> {
  const { email, password, full_name, class_level = 10, board = 'FBISE' } = params;

  const admin = getServiceRoleClient();

  if (!admin) {
    return {
      success: true,
      user: {
        id: 'demo-user-101',
        email,
        user_metadata: { full_name: full_name || 'Student', class_level, board },
      },
      session: null,
      profileCreated: false,
      isDemo: true,
      message: 'Signed up in Demo Mode (Supabase keys not yet configured in .env)',
    };
  }

  // email_confirm: true — the OTP the caller already verified IS the email confirmation.
  // No session comes back from an admin-created user (expected: verify-otp sends the
  // student to /login afterward regardless, so this doesn't change the user-facing flow).
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, class_level, board },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (data.user) {
    const { error: profileError } = await admin.from('users').upsert(
      {
        id: data.user.id,
        role_code: 'student',
        display_name: full_name || '',
        preferred_language: 'en',
      },
      { onConflict: 'id' }
    );

    // Postgres unique_violation on the username's case-insensitive index
    // (0006_username_unique.sql). send-otp already checks this before a code is ever
    // sent — this only fires on the race where two signups for the same username land
    // within the same window. Known limitation: the auth user above already exists at
    // this point (confirmed, no password reset needed) with no matching profile row;
    // not auto-deleted here rather than risk destroying a real account on a flaky
    // network error being mistaken for this one.
    if (profileError?.code === '23505') {
      console.error('Signup: username collision at insert time:', profileError.message);
      return { success: false, error: 'That username is already taken. Please choose another.' };
    }

    const { error: studentError } = await admin.from('student_profiles').upsert(
      { user_id: data.user.id, board_code: board, class_level },
      { onConflict: 'user_id' }
    );

    const { error: subjectsError } = await admin.from('student_subjects').upsert(
      ALL_SUBJECT_CODES.map((subject_code) => ({ user_id: data.user.id, subject_code })),
      { onConflict: 'user_id,subject_code' }
    );

    if (profileError || studentError || subjectsError) {
      console.error(
        'Signup succeeded but profile creation failed:',
        profileError?.message ?? studentError?.message ?? subjectsError?.message
      );
      return {
        success: true,
        user: data.user,
        session: null,
        profileCreated: false,
      };
    }
  }

  return {
    success: true,
    user: data.user!,
    session: null,
    profileCreated: true,
  };
}
