// Quiz attempt history for the signed-in student — read side of the data /api/quiz/grade
// already writes (quiz_attempts + quiz_attempt_answers, see src/lib/quiz/persist.ts). Nothing
// new is stored; this route only surfaces it for the /quiz/history page.
//
// Auth + client pattern is identical to /api/dashboard/stats: resolve the user server-side,
// then read with the service-role client filtered by user_id (a student's own session can hit
// RLS gaps, and history must be reliable, not best-effort).

import { NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';

export interface QuizHistoryRow {
  id: string;
  submittedAt: string;
  score: number;
  total: number;
  answered: number;
  /** Coarse score/total percentage (the half-credit "passed" count). The fine points-based
   *  percentage needs the answer rows and is computed only on the detail page. */
  scorePct: number;
  subjectCode: string | null;
  chapterNo: number | null;
  chapterTitle: string | null;
  topicLabel: string | null;
}

export async function GET() {
  try {
    const { user } = await getCurrentUserAndProfile();
    const admin = getServiceRoleClient();

    if (!user || !admin) {
      return NextResponse.json({ error: 'You need to be logged in to view your quiz history.' }, { status: 401 });
    }

    const { data, error } = await admin
      .from('quiz_attempts')
      .select(
        'id, score, total, answered, submitted_at, quizzes(topic_label, chapters(chapter_no, chapter_title, subject_code))'
      )
      .eq('user_id', user.id)
      .order('submitted_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Quiz history: quiz_attempts query failed:', error.message);
      return NextResponse.json({ error: 'Could not load your quiz history.' }, { status: 500 });
    }

    const attempts: QuizHistoryRow[] = (data ?? []).map((row: any) => {
      const quiz = Array.isArray(row.quizzes) ? row.quizzes[0] : row.quizzes;
      const chapter = quiz ? (Array.isArray(quiz.chapters) ? quiz.chapters[0] : quiz.chapters) : null;
      return {
        id: row.id,
        submittedAt: row.submitted_at,
        score: row.score,
        total: row.total,
        answered: row.answered,
        scorePct: row.total > 0 ? Math.round((row.score / row.total) * 100) : 0,
        subjectCode: chapter?.subject_code ?? null,
        chapterNo: chapter?.chapter_no ?? null,
        chapterTitle: chapter?.chapter_title ?? null,
        topicLabel: quiz?.topic_label ?? null,
      };
    });

    return NextResponse.json({ attempts });
  } catch (error) {
    console.error('Quiz history error:', error);
    return NextResponse.json({ error: 'Could not load your quiz history.' }, { status: 500 });
  }
}
