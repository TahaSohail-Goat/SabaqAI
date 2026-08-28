import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    // PCTB removed for now, coming back later — this interim default is overwritten moments
    // later by /api/auth/onboarding for any account that completes it.
    const { email, password, full_name, class_level = 10, board = 'FBISE' } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    if (!supabase) {
      // Demo / simulated mode if Supabase credentials are not yet entered in .env
      return NextResponse.json({
        success: true,
        user: {
          id: 'demo-user-101',
          email,
          user_metadata: { full_name: full_name || 'Student', class_level, board },
        },
        message: 'Signed up in Demo Mode (Supabase keys not yet configured in .env)',
        isDemo: true,
      });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
          class_level,
          board,
        },
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Create the users + student_profiles rows the schema expects.
    //
    // Without a student_profiles row, the chunks_match_profile RLS policy matches nothing, so any
    // query made with the user's own session returns zero rows — the guardrail then correctly
    // refuses EVERY question, with no error anywhere explaining why. Retrieval currently avoids
    // this by running with the service_role key, but the row still has to exist for anything that
    // reads as the user. Creating it at signup is the fix at source.
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
          {
            user_id: data.user.id,
            board_code: board,
            class_level: class_level,
          },
          { onConflict: 'user_id' }
        );

        // Subjects are a junction table in schema v2, not an array column on the profile.
        const { error: subjectsError } = await admin.from('student_subjects').upsert(
          { user_id: data.user.id, subject_code: 'physics' },
          { onConflict: 'user_id,subject_code' }
        );

        // Don't fail the signup over this — the account exists and the user can log in. Log it
        // loudly so it's visible, and surface a flag so the UI can tell them setup is incomplete.
        if (profileError || studentError || subjectsError) {
          console.error(
            'Signup succeeded but profile creation failed:',
            profileError?.message ?? studentError?.message ?? subjectsError?.message
          );
          return NextResponse.json({
            success: true,
            user: data.user,
            session: data.session,
            profileCreated: false,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      user: data.user,
      session: data.session,
      profileCreated: true,
    });
  } catch (err: any) {
    console.error('Signup error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
