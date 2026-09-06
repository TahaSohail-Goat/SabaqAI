// In-progress (generated-but-ungraded) quizzes for the signed-in student — the resumable
// drafts /api/quiz parks (quiz_drafts). This is the list the /quiz/history "In progress"
// section and the plan page read; the full draft (for resuming) comes from
// /api/quiz/drafts/[id].
//
// Auth + client pattern matches /api/dashboard/stats: resolve the user server-side, read with
// the service-role client filtered by user_id.

import { NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { TOKEN_TTL_MS } from '@/lib/quiz/answer-key';

export interface QuizDraftRow {
  id: string;
  boardCode: string;
  classLevel: number;
  subjectCode: string;
  chapterNo: number;
  chapterTitle: string | null;
  answeredCount: number;
  totalQuestions: number;
  generatedAt: string;
  updatedAt: string;
  /** Token has aged past the 2h grading TTL — still resumable for review, but the student
   *  will need to regenerate to submit. */
  expired: boolean;
}

function answeredCount(answers: unknown): number {
  if (!answers || typeof answers !== 'object') return 0;
  return Object.values(answers as Record<string, unknown>).filter(
    (v) => typeof v === 'number' || (typeof v === 'string' && v.trim().length > 0)
  ).length;
}

export async function GET() {
  try {
    const { user } = await getCurrentUserAndProfile();
    const admin = getServiceRoleClient();

    if (!user || !admin) {
      return NextResponse.json({ error: 'You need to be logged in to view your quiz drafts.' }, { status: 401 });
    }

    const { data, error } = await admin
      .from('quiz_drafts')
      .select('id, board_code, class_level, subject_code, chapter_no, chapter_title, questions, answers, generated_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Quiz drafts: query failed:', error.message);
      return NextResponse.json({ error: 'Could not load your quiz drafts.' }, { status: 500 });
    }

    const now = Date.now();
    const drafts: QuizDraftRow[] = (data ?? []).map((row: any) => ({
      id: row.id,
      boardCode: row.board_code,
      classLevel: row.class_level,
      subjectCode: row.subject_code,
      chapterNo: row.chapter_no,
      chapterTitle: row.chapter_title || null,
      answeredCount: answeredCount(row.answers),
      totalQuestions: Array.isArray(row.questions) ? row.questions.length : 0,
      generatedAt: row.generated_at,
      updatedAt: row.updated_at,
      expired: now - new Date(row.generated_at).getTime() > TOKEN_TTL_MS,
    }));

    return NextResponse.json({ drafts });
  } catch (error) {
    console.error('Quiz drafts error:', error);
    return NextResponse.json({ error: 'Could not load your quiz drafts.' }, { status: 500 });
  }
}
