// One graded quiz attempt, in full — the "solved paper" behind the View quiz button on
// /quiz/history. Every question with its correct answer / model answer, the student's own
// answer, per-question feedback, and the computed attempt-level summary (src/lib/quiz/feedback.ts).
//
// quiz_answer_keys / quiz_answer_rubrics have NO anon/authenticated RLS policy (deny by
// default) — read here only because this route uses the service-role client AND only after the
// ownership check below. The "correct answer never reaches the browser before submission" rule
// (src/lib/quiz/answer-key.ts) is about the live quiz; this attempt is already submitted and
// graded, so showing the key back to its own author is the point.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { summarizeAttempt, type AttemptItem, type QuestionType } from '@/lib/quiz/feedback';
import type { GradedQuestionView } from '@/components/app/GradedQuestionCard';

export interface QuizAttemptDetail {
  attempt: {
    id: string;
    submittedAt: string;
    score: number;
    total: number;
    answered: number;
    subjectCode: string | null;
    chapterNo: number | null;
    chapterTitle: string | null;
    topicLabel: string | null;
  };
  questions: GradedQuestionView[];
  summary: ReturnType<typeof summarizeAttempt>;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await getCurrentUserAndProfile();
    const admin = getServiceRoleClient();

    if (!user || !admin) {
      return NextResponse.json({ error: 'You need to be logged in to view this quiz.' }, { status: 401 });
    }

    const { data: attempt, error } = await admin
      .from('quiz_attempts')
      .select(
        `id, user_id, score, total, answered, submitted_at,
         quizzes(topic_label, chapters(chapter_no, chapter_title, subject_code)),
         quiz_attempt_answers(
           selected_option_index, answer_text, is_correct, points_awarded, points_possible, feedback,
           quiz_questions(
             id, position, stem, question_type, chunk_id,
             quiz_options(option_index, option_text),
             quiz_answer_keys(correct_option_index, explanation),
             quiz_answer_rubrics(model_answer, rubric, max_score)
           )
         )`
      )
      .eq('id', id)
      .maybeSingle();

    // Not-found and not-yours are the same 404 — don't confirm an id exists to someone who
    // doesn't own it.
    if (error || !attempt || attempt.user_id !== user.id) {
      return NextResponse.json({ error: 'This quiz could not be found.' }, { status: 404 });
    }

    const quiz = Array.isArray(attempt.quizzes) ? attempt.quizzes[0] : attempt.quizzes;
    const chapter = quiz ? (Array.isArray(quiz.chapters) ? quiz.chapters[0] : quiz.chapters) : null;

    const answerRows: any[] = Array.isArray(attempt.quiz_attempt_answers) ? attempt.quiz_attempt_answers : [];

    // Best-effort section/page labels for the questions whose source chunk is a real row.
    const chunkIds = answerRows
      .map((r) => {
        const qq = Array.isArray(r.quiz_questions) ? r.quiz_questions[0] : r.quiz_questions;
        return qq?.chunk_id as string | null;
      })
      .filter((c): c is string => !!c);

    const chunkMeta = new Map<string, { section: string | null; page: number | null }>();
    if (chunkIds.length > 0) {
      const { data: chunks } = await admin
        .from('content_chunks_expanded')
        .select('id, section, page_from')
        .in('id', [...new Set(chunkIds)]);
      for (const c of chunks ?? []) {
        chunkMeta.set(c.id, { section: c.section ?? null, page: c.page_from ?? null });
      }
    }

    const merged = answerRows
      .map((r) => {
        const qq = Array.isArray(r.quiz_questions) ? r.quiz_questions[0] : r.quiz_questions;
        if (!qq) return null;
        const type = (qq.question_type ?? 'mcq') as QuestionType;
        const key = Array.isArray(qq.quiz_answer_keys) ? qq.quiz_answer_keys[0] : qq.quiz_answer_keys;
        const rubric = Array.isArray(qq.quiz_answer_rubrics) ? qq.quiz_answer_rubrics[0] : qq.quiz_answer_rubrics;
        const options = (Array.isArray(qq.quiz_options) ? qq.quiz_options : [])
          .slice()
          .sort((a: any, b: any) => a.option_index - b.option_index)
          .map((o: any) => o.option_text as string);
        const meta = qq.chunk_id ? chunkMeta.get(qq.chunk_id) : undefined;

        const answered =
          r.selected_option_index !== null ||
          (typeof r.answer_text === 'string' && r.answer_text.trim().length > 0);
        const pointsPossible =
          r.points_possible != null ? Number(r.points_possible) : type === 'mcq' ? 1 : rubric?.max_score ?? 1;
        const pointsAwarded = r.points_awarded != null ? Number(r.points_awarded) : r.is_correct ? pointsPossible : 0;

        const view: GradedQuestionView = {
          position: qq.position,
          stem: qq.stem,
          questionType: type,
          options: type === 'mcq' ? options : undefined,
          correctIndex: key?.correct_option_index ?? null,
          yourIndex: r.selected_option_index,
          yourText: r.answer_text ?? null,
          correct: !!r.is_correct,
          explanation: key?.explanation ?? null,
          modelAnswer: rubric?.model_answer ?? null,
          feedback: r.feedback ?? null,
          pointsAwarded,
          pointsPossible,
          section: meta?.section ?? null,
          page: meta?.page ?? null,
        };
        const item: AttemptItem = {
          questionType: type,
          section: meta?.section ?? null,
          page: meta?.page ?? null,
          correct: !!r.is_correct,
          pointsAwarded,
          pointsPossible,
          answered,
        };
        return { view, item };
      })
      .filter((x): x is { view: GradedQuestionView; item: AttemptItem } => x !== null)
      .sort((a, b) => a.view.position - b.view.position);

    const detail: QuizAttemptDetail = {
      attempt: {
        id: attempt.id,
        submittedAt: attempt.submitted_at,
        score: attempt.score,
        total: attempt.total,
        answered: attempt.answered,
        subjectCode: chapter?.subject_code ?? null,
        chapterNo: chapter?.chapter_no ?? null,
        chapterTitle: chapter?.chapter_title ?? null,
        topicLabel: quiz?.topic_label ?? null,
      },
      questions: merged.map((m) => m.view),
      summary: summarizeAttempt(merged.map((m) => m.item)),
    };

    return NextResponse.json(detail);
  } catch (error) {
    console.error('Quiz attempt detail error:', error);
    return NextResponse.json({ error: 'Could not load this quiz.' }, { status: 500 });
  }
}
