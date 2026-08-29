// Shared Supabase account-creation logic used by both /api/auth/signup and
// /api/auth/verify-otp. Extracted here to avoid duplication — the two routes
// had identical code and would have drifted apart.
//
// Returns a plain object (not a NextResponse) so each route can shape its own
// HTTP response.

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';

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

  const supabase = await createServerSupabaseClient();

  if (!supabase) {
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

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, class_level, board },
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (data.user) {
    const admin = getServiceRoleClient();
    if (admin) {
      const { error: profileError } = await admin.from('users').upsert(
        {
          id: data.user.id,
          role_code: 'student',
          display_name: full_name || '',
          preferred_language: 'en',
        },
        { onConflict: 'id' }
      );

      const { error: studentError } = await admin.from('student_profiles').upsert(
        { user_id: data.user.id, board_code: board, class_level },
        { onConflict: 'user_id' }
      );

      const { error: subjectsError } = await admin.from('student_subjects').upsert(
        { user_id: data.user.id, subject_code: 'physics' },
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
          session: data.session,
          profileCreated: false,
        };
      }
    }
  }

  return {
    success: true,
    user: data.user!,
    session: data.session,
    profileCreated: true,
  };
}
