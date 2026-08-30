// Real profile editing — Settings' Profile section used to be read-only with an explicit
// "there's no profile-edit endpoint yet" comment. This is that endpoint: username, class
// level, and exam date, all genuinely persisted (users.display_name, student_profiles).

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';

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

    const { username, classLevel, examDate } = await req.json();

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

    if (classLevel !== undefined || examDate !== undefined) {
      const updates: Record<string, unknown> = {};
      if (classLevel !== undefined) {
        const n = Number(classLevel);
        if (!Number.isInteger(n) || n < 9 || n > 12) {
          return NextResponse.json({ error: 'Class must be 9, 10, 11, or 12.' }, { status: 400 });
        }
        updates.class_level = n;
      }
      if (examDate !== undefined) {
        updates.exam_date = examDate || null;
      }

      // A plain update, not an upsert — (app)/layout.tsx already redirects anyone without a
      // student_profiles row to /onboarding before they can ever reach Settings, so the row is
      // guaranteed to exist here. An upsert would need a class_level default for the "row
      // doesn't exist" branch, and specifying one would silently overwrite the real value
      // whenever only examDate was being changed.
      const { error: profileError } = await admin
        .from('student_profiles')
        .update(updates)
        .eq('user_id', user.id);

      if (profileError) {
        console.error('Profile: student_profiles upsert failed:', profileError.message);
        return NextResponse.json({ error: 'Could not save your profile. Please try again.' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Profile update error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
