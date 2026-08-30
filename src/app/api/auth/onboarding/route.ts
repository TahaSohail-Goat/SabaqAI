import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';

// Mirrors the server-side check in /api/auth/send-otp — client-side copy exists only for
// immediate feedback, the server never trusts it.
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

// Writes the real username/board/class/subjects/exam_date a student chose during onboarding.
// For a normal email/password signup this replaces the class_level=10/board='FBISE' defaults
// signup writes at account-creation time (see src/app/api/auth/signup/route.ts) — but this
// route is now reached almost exclusively by Google/OAuth sign-ins, which create the Supabase
// auth user directly and never go through the signup form at all: no `users` row (no
// username), no student_profiles row. The username write below exists specifically for that
// case — (app)/layout.tsx redirects here whenever a signed-in user has no profile yet.
export async function POST(req: NextRequest) {
  try {
    const { username, board, classLevel, subjects, examDate } = await req.json();

    const trimmedUsername = typeof username === 'string' ? username.trim() : '';
    if (!trimmedUsername || !USERNAME_RE.test(trimmedUsername)) {
      return NextResponse.json(
        { error: 'Username must be 3-20 characters — letters, numbers and underscores only.' },
        { status: 400 }
      );
    }
    if (!board || typeof board !== 'string') {
      return NextResponse.json({ error: 'A board is required.' }, { status: 400 });
    }
    if (!classLevel || typeof classLevel !== 'number') {
      return NextResponse.json({ error: 'A class level is required.' }, { status: 400 });
    }
    if (!Array.isArray(subjects) || subjects.length === 0) {
      return NextResponse.json({ error: 'At least one subject is required.' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      // Demo mode: nothing to persist, but don't fail the wizard over it.
      return NextResponse.json({ success: true, isDemo: true });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'You need to be signed in to finish setup.' }, { status: 401 });
    }

    const admin = getServiceRoleClient();
    if (!admin) {
      return NextResponse.json({ error: 'Server is not configured for this yet.' }, { status: 500 });
    }

    // student_profiles.user_id has a foreign key to users(id), not auth.users(id) directly —
    // this insert has to happen first, or the student_profiles upsert below fails outright for
    // anyone who's never had a `users` row (every OAuth sign-in, today).
    const { error: usersError } = await admin.from('users').upsert(
      { id: user.id, role_code: 'student', display_name: trimmedUsername, preferred_language: 'en' },
      { onConflict: 'id' }
    );
    // Same race-condition backstop as create-account.ts: send-otp-equivalent client-side
    // checking doesn't exist on this page, so the case-insensitive unique index is the only
    // thing catching a taken username here.
    if (usersError?.code === '23505') {
      return NextResponse.json({ error: 'That username is already taken. Please choose another.' }, { status: 409 });
    }
    if (usersError) {
      console.error('Onboarding: users write failed:', usersError.message);
      return NextResponse.json({ error: 'Could not save your username. Please try again.' }, { status: 500 });
    }

    const { error: profileError } = await admin.from('student_profiles').upsert(
      {
        user_id: user.id,
        board_code: board,
        class_level: classLevel,
        exam_date: examDate || null,
      },
      { onConflict: 'user_id' }
    );

    if (profileError) {
      console.error('Onboarding: student_profiles write failed:', profileError.message);
      return NextResponse.json({ error: 'Could not save your board and class. Please try again.' }, { status: 500 });
    }

    // Replace rather than merge — onboarding is the authoritative statement of "these are my
    // subjects right now," not an incremental add.
    const { error: deleteError } = await admin.from('student_subjects').delete().eq('user_id', user.id);
    if (deleteError) {
      console.error('Onboarding: student_subjects clear failed:', deleteError.message);
    }

    const { error: subjectsError } = await admin
      .from('student_subjects')
      .insert(subjects.map((subject_code: string) => ({ user_id: user.id, subject_code })));

    if (subjectsError) {
      console.error('Onboarding: student_subjects write failed:', subjectsError.message);
      return NextResponse.json({ error: 'Could not save your subjects. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Onboarding error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
