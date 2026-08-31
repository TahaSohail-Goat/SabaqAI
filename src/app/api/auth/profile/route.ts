// Real profile editing — Settings' Profile section used to be read-only with an explicit
// "there's no profile-edit endpoint yet" comment. This is that endpoint: username, class
// level, subjects, and language, all genuinely persisted (users.*, student_profiles,
// student_subjects). Every field is independently optional — the client decides which of these
// to send in a given request, so Settings can save a single field (e.g. just a username change)
// without touching the others.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { ALL_SUBJECT_CODES } from '@/lib/subjects';

// Mirrors the server-side check in /api/auth/send-otp and /api/auth/onboarding — client-side
// copies exist only for immediate feedback, the server never trusts them.
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUserAndProfile();
    if (!user) {
      return NextResponse.json({ error: 'You need to be logged in.' }, { status: 401 });
    }

    const admin = getServiceRoleClient();
    if (!admin) {
      return NextResponse.json({ error: 'Server is not configured for this yet.' }, { status: 500 });
    }

    const { username, classLevel, subjects, language } = await req.json();

    if (username !== undefined) {
      const trimmed = String(username).trim();
      if (!USERNAME_RE.test(trimmed)) {
        return NextResponse.json(
          { error: 'Username must be 3-20 characters — letters, numbers and underscores only.' },
          { status: 400 }
        );
      }
      const { error: usersError } = await admin
        .from('users')
        .update({ display_name: trimmed })
        .eq('id', user.id);

      if (usersError?.code === '23505') {
        return NextResponse.json({ error: 'That username is already taken. Please choose another.' }, { status: 409 });
      }
      if (usersError) {
        console.error('Profile: users update failed:', usersError.message);
        return NextResponse.json({ error: 'Could not save your username. Please try again.' }, { status: 500 });
      }
    }

    if (classLevel !== undefined) {
      const n = Number(classLevel);
      if (!Number.isInteger(n) || n < 9 || n > 12) {
        return NextResponse.json({ error: 'Class must be 9, 10, 11, or 12.' }, { status: 400 });
      }

      // A plain update, not an upsert — (app)/layout.tsx already redirects anyone without a
      // student_profiles row to /onboarding before they can ever reach Settings, so the row is
      // guaranteed to exist here.
      const { error: profileError } = await admin
        .from('student_profiles')
        .update({ class_level: n })
        .eq('user_id', user.id);

      if (profileError) {
        console.error('Profile: student_profiles update failed:', profileError.message);
        return NextResponse.json({ error: 'Could not save your class. Please try again.' }, { status: 500 });
      }
    }

    if (subjects !== undefined) {
      if (!Array.isArray(subjects) || subjects.length === 0) {
        return NextResponse.json({ error: 'Pick at least one subject.' }, { status: 400 });
      }
      const invalid = subjects.filter((s: unknown) => typeof s !== 'string' || !ALL_SUBJECT_CODES.includes(s));
      if (invalid.length > 0) {
        return NextResponse.json({ error: 'One or more subjects were not recognized.' }, { status: 400 });
      }

      // Replace rather than merge — same reasoning as the onboarding route: this is the
      // authoritative statement of "these are my subjects right now," not an incremental add.
      const { error: deleteError } = await admin.from('student_subjects').delete().eq('user_id', user.id);
      if (deleteError) {
        console.error('Profile: student_subjects clear failed:', deleteError.message);
        return NextResponse.json({ error: 'Could not save your subjects. Please try again.' }, { status: 500 });
      }

      const { error: insertError } = await admin
        .from('student_subjects')
        .insert(subjects.map((subject_code: string) => ({ user_id: user.id, subject_code })));

      if (insertError) {
        console.error('Profile: student_subjects write failed:', insertError.message);
        return NextResponse.json({ error: 'Could not save your subjects. Please try again.' }, { status: 500 });
      }
    }

    if (language !== undefined) {
      if (language !== 'en' && language !== 'ur') {
        return NextResponse.json({ error: 'Unrecognized language.' }, { status: 400 });
      }
      const { error: languageError } = await admin
        .from('users')
        .update({ preferred_language: language })
        .eq('id', user.id);

      if (languageError) {
        console.error('Profile: preferred_language update failed:', languageError.message);
        return NextResponse.json({ error: 'Could not save your language preference.' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Profile update error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
