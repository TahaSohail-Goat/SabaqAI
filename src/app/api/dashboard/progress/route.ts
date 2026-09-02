// Per-chapter mastery (M9, docs/modules.md §10) — real accuracy computed from this student's
// actual quiz attempts, never a hardcoded or guessed number (invariant 1). The actual
// computation lives in src/lib/mastery.ts, shared with /api/dashboard/plan/[id] (M10).

import { NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { computeChapterMastery, type SubjectMastery } from '@/lib/mastery';

export type { MasteryBand, ChapterMastery, SubjectMastery } from '@/lib/mastery';

export async function GET() {
  try {
    const { user, profile } = await getCurrentUserAndProfile();
    const admin = getServiceRoleClient();

    if (!user || !admin || !profile) {
      return NextResponse.json<{ subjects: SubjectMastery[] }>({ subjects: [] });
    }

    const enrolledSubjects = profile.subjects.length ? profile.subjects : [];
    const subjects = await computeChapterMastery(admin, user.id, profile.board, profile.classLevel, enrolledSubjects);

    return NextResponse.json<{ subjects: SubjectMastery[] }>({ subjects });
  } catch (error) {
    console.error('Progress API error:', error);
    return NextResponse.json({ error: 'Failed to load progress.' }, { status: 500 });
  }
}
