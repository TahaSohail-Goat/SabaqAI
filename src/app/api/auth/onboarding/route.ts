import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';

// Writes the real board/class/subjects/exam_date a student chose during onboarding — replacing
// the class_level=10/board='FBISE' defaults signup writes at account-creation time (see
// src/app/api/auth/signup/route.ts). Same tables, same admin-client pattern signup already uses;
// this is the "actually asked the student" follow-up write, not a new subsystem.
export async function POST(req: NextRequest) {
  try {
    const { board, classLevel, subjects, examDate } = await req.json();

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
