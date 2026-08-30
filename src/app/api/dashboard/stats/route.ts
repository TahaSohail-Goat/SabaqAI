// Real per-student activity counts for the Dashboard — questions asked (qa_log, now attributed
// via userId — see /api/ask) and quizzes taken (quiz_attempts, src/lib/quiz/persist.ts). Both
// tables existed before either count was ever computed from them.

import { NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';

export interface DashboardStats {
  questionsAsked: number;
  quizzesTaken: number;
}

export async function GET() {
  try {
    const { user } = await getCurrentUserAndProfile();
    const admin = getServiceRoleClient();

    if (!user || !admin) {
      return NextResponse.json<DashboardStats>({ questionsAsked: 0, quizzesTaken: 0 });
    }

    const [questionsResult, quizzesResult] = await Promise.all([
      admin.from('qa_log').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      admin.from('quiz_attempts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ]);

    if (questionsResult.error) console.error('Dashboard stats: qa_log count failed:', questionsResult.error.message);
    if (quizzesResult.error) console.error('Dashboard stats: quiz_attempts count failed:', quizzesResult.error.message);

    return NextResponse.json<DashboardStats>({
      questionsAsked: questionsResult.count ?? 0,
      quizzesTaken: quizzesResult.count ?? 0,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json<DashboardStats>({ questionsAsked: 0, quizzesTaken: 0 }, { status: 500 });
  }
}
