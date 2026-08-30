// Shared server-side "who is signed in, and what's their profile" lookup — used by both
// /api/auth/user (for client-side re-checks, e.g. after logout) and the (app) shell layout
// (for the initial server-rendered load, so Dashboard/Sidebar/Topbar arrive with the real
// name/board/class/subjects already baked in instead of fetching it client-side after the
// page has already painted a "Welcome back." / skeleton state).

import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { ACTIVITY_COOKIE_NAME, activityCookieOptions, isActivityFresh } from '@/lib/auth/session-activity';

export interface CurrentUser {
  id: string;
  email?: string;
  metadata?: Record<string, unknown>;
}

export interface Profile {
  username: string;
  board: string;
  classLevel: number;
  examDate: string | null;
  subjects: string[];
}

export interface CurrentUserResult {
  user: CurrentUser | null;
  profile: Profile | null;
  configured: boolean;
}

export async function getCurrentUserAndProfile(): Promise<CurrentUserResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { user: null, profile: null, configured: false };
  }

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { user: null, profile: null, configured: true };
  }

  // Same idle/closed-browser enforcement as middleware.ts, for requests middleware never
  // sees (every /api/ route) — see src/lib/auth/session-activity.ts. Most real activity in
  // this app (chat, quiz grading) happens here, via API calls, not page navigation, so this
  // is also what keeps the activity timestamp from going stale during a long chat session.
  const cookieStore = await cookies();
  const activityCookie = cookieStore.get(ACTIVITY_COOKIE_NAME)?.value;
  if (!isActivityFresh(activityCookie)) {
    return { user: null, profile: null, configured: true };
  }
  try {
    cookieStore.set(ACTIVITY_COOKIE_NAME, Date.now().toString(), activityCookieOptions());
  } catch {
    // Called from a Server Component (e.g. (app)/layout.tsx) — can't write cookies there.
    // Fine: middleware refreshes the same cookie for page navigations, and Route Handlers
    // (every API call) can write it themselves.
  }

  // Real board/class/subjects, read with the service-role client — a student's own session
  // can hit RLS gaps, and this is what the app scopes retrieval by, so it needs to be
  // reliable, not best-effort. Both queries only depend on user.id, not on each other.
  let profile: Profile | null = null;
  const admin = getServiceRoleClient();
  if (admin) {
    const [{ data: userRow }, { data: profileRow }, { data: subjectRows }] = await Promise.all([
      admin
        .from('users')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle(),
      admin
        .from('student_profiles')
        .select('board_code, class_level, exam_date')
        .eq('user_id', user.id)
        .maybeSingle(),
      admin
        .from('student_subjects')
        .select('subject_code')
        .eq('user_id', user.id),
    ]);

    if (profileRow) {
      profile = {
        username: userRow?.display_name ?? '',
        board: profileRow.board_code,
        classLevel: profileRow.class_level,
        examDate: profileRow.exam_date,
        subjects: (subjectRows ?? []).map((r) => r.subject_code),
      };
    }
  }

  return {
    user: { id: user.id, email: user.email, metadata: user.user_metadata },
    profile,
    configured: true,
  };
}
