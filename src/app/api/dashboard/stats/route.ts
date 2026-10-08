// Real per-student activity counts for the Dashboard — questions asked (qa_log, now attributed
// via userId — see /api/ask) and quizzes taken (quiz_attempts, src/lib/quiz/persist.ts). Both
// tables existed before either count was ever computed from them.

import { NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';

export interface DailyActivity {
  /** YYYY-MM-DD, local calendar date — see the note on toLocalDateKey below for why this is
   *  never built via toISOString(). */
  date: string;
  questions: number;
  quizzes: number;
}

export interface DashboardStats {
  questionsAsked: number;
  quizzesTaken: number;
  /** Last 14 real calendar days, oldest first, zero-filled for days with no activity — never
   *  interpolated or estimated. A brand-new account gets 14 honest zeros, not a fabricated
   *  trend line. */
  dailyActivity: DailyActivity[];
}

const TREND_DAYS = 14;

// Same reasoning as the Revision Planner's addDaysIso (src/app/api/dashboard/plan/[id]/route.ts):
// toISOString() converts to UTC first, which silently rolls the date back a day for anyone in a
// positive UTC offset — Pakistan is +5, this app's entire audience — during the first few hours
// after local midnight. Extracting the fields directly and joining them sidesteps that entirely.
function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function GET() {
  try {
    const { user } = await getCurrentUserAndProfile();
    const admin = getServiceRoleClient();

    if (!user || !admin) {
      return NextResponse.json<DashboardStats>({ questionsAsked: 0, quizzesTaken: 0, dailyActivity: [] });
    }

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - (TREND_DAYS - 1));
    windowStart.setHours(0, 0, 0, 0);

    const [questionsResult, quizzesResult, recentQuestions, recentQuizzes] = await Promise.all([
      admin.from('qa_log').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      admin.from('quiz_attempts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      admin
        .from('qa_log')
        .select('created_at')
        .eq('user_id', user.id)
        .gte('created_at', windowStart.toISOString()),
      admin
        .from('quiz_attempts')
        .select('submitted_at')
        .eq('user_id', user.id)
        .gte('submitted_at', windowStart.toISOString()),
    ]);

    if (questionsResult.error) console.error('Dashboard stats: qa_log count failed:', questionsResult.error.message);
    if (quizzesResult.error) console.error('Dashboard stats: quiz_attempts count failed:', quizzesResult.error.message);
    if (recentQuestions.error) console.error('Dashboard stats: recent qa_log failed:', recentQuestions.error.message);
    if (recentQuizzes.error) console.error('Dashboard stats: recent quiz_attempts failed:', recentQuizzes.error.message);

    // Zero-filled day buckets first, in real calendar order — so a day with no rows still gets
    // an honest 0 rather than being silently absent from the series.
    const buckets = new Map<string, DailyActivity>();
    for (let i = 0; i < TREND_DAYS; i++) {
      const d = new Date(windowStart);
      d.setDate(d.getDate() + i);
      const key = toLocalDateKey(d);
      buckets.set(key, { date: key, questions: 0, quizzes: 0 });
    }
    for (const row of recentQuestions.data ?? []) {
      const bucket = buckets.get(toLocalDateKey(new Date(row.created_at as string)));
      if (bucket) bucket.questions += 1;
    }
    for (const row of recentQuizzes.data ?? []) {
      const bucket = buckets.get(toLocalDateKey(new Date(row.submitted_at as string)));
      if (bucket) bucket.quizzes += 1;
    }

    return NextResponse.json<DashboardStats>({
      questionsAsked: questionsResult.count ?? 0,
      quizzesTaken: quizzesResult.count ?? 0,
      dailyActivity: Array.from(buckets.values()),
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json<DashboardStats>({ questionsAsked: 0, quizzesTaken: 0, dailyActivity: [] }, { status: 500 });
  }
}
