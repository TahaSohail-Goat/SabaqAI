// Server-side quiz grading — and the ONLY place a quiz is ever recorded.
//
// Generation (/api/quiz) deliberately never touches the database. It seals everything the quiz
// needs — questions, options, correct answers/rubrics, chunk citations — into an encrypted
// token (src/lib/quiz/answer-key.ts) and hands that to the browser. This route decrypts it,
// grades the submission, and — only when there's an actual submission from a logged-in user —
// persists the quiz (quizzes/quiz_questions/quiz_options/quiz_answer_keys/quiz_answer_rubrics)
// and the attempt (quiz_attempts/quiz_attempt_answers) together, in that order. A quiz that was
// generated but never submitted leaves no database row at all — there's nothing to "take back."
//
// MCQs grade by index match. Short/long answers are free text: one batched Gemini call grades
// every free-text answer in the attempt against its stored model answer/rubric, returning
// partial credit + brief feedback rather than a binary right/wrong.

import { NextRequest, NextResponse } from 'next/server';
import { openQuizToken, type QuizTokenQuestion } from '@/lib/quiz/answer-key';
import { persistQuiz, persistAttempt, type PersistableQuestion, type AttemptResult } from '@/lib/quiz/persist';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { gradeTextAnswers, type TextGradeItem } from '@/lib/quiz/grade-written';
import { buildWrittenReview, quoteInSource } from '@/lib/quiz/grading';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { QuizGradedQuestion } from '@/lib/types';

export type GradedQuestion = QuizGradedQuestion;

async function loadTextSources(admin: SupabaseClient | null, chapterId: string | null, questions: QuizTokenQuestion[]): Promise<Map<string, TextGradeItem['source']>> {
  const sources = new Map<string, TextGradeItem['source']>();
  if (!admin || !chapterId) return sources;
  const ids = [...new Set(questions.filter((q) => q.questionType !== 'mcq').map((q) => q.chunkId).filter((id): id is string => !!id))];
  if (ids.length === 0) return sources;
  const { data: chapter, error: chapterError } = await admin.from('chapters')
    .select('board_code, class_level, subject_code, chapter_no').eq('id', chapterId).maybeSingle();
  if (chapterError || !chapter) return sources;
  const { data, error } = await admin.from('content_chunks_expanded')
    .select('id, content, chapter_no, chapter_title, section, page_from, page_to')
    .in('id', ids).eq('board', chapter.board_code).eq('class_level', chapter.class_level)
    .eq('subject', chapter.subject_code).eq('chapter_no', chapter.chapter_no).eq('source_type', 'textbook');
  if (error) return sources;
  for (const row of data ?? []) sources.set(row.id, {
    chunkId: row.id, chapterNo: row.chapter_no, chapterTitle: row.chapter_title,
    section: row.section, pageFrom: row.page_from, pageTo: row.page_to, content: row.content,
  });
  return sources;
}

async function gradeAll(
  questions: QuizTokenQuestion[],
  selectedFor: (questionId: string) => number | null,
  textFor: (questionId: string) => string | null,
  sources: Map<string, TextGradeItem['source']>
): Promise<GradedQuestion[]> {
  const mcqEntries = questions.filter((q): q is Extract<QuizTokenQuestion, { questionType: 'mcq' }> => q.questionType === 'mcq');
  const textEntries = questions.filter((q) => q.questionType !== 'mcq') as Extract<
    QuizTokenQuestion,
    { questionType: 'short' | 'long' }
  >[];

  const textItems: TextGradeItem[] = textEntries.flatMap((e) => {
    const source = e.chunkId ? sources.get(e.chunkId) : null;
    const answerText = textFor(e.id);
    if (!source || !Array.isArray(e.criteria) || e.criteria.length !== e.maxScore ||
        !e.criteria.every((c) => typeof c.id === 'string' && typeof c.expectation === 'string' &&
          typeof c.sourceQuote === 'string' && quoteInSource(c.sourceQuote, source.content)) || !answerText) return [];
    return [{ questionId: e.id, stem: e.stem, modelAnswer: e.modelAnswer, rubric: e.rubric,
      answerText, criteria: e.criteria, source }];
  });

  const textGrades = await gradeTextAnswers(textItems);

  const mcqResults: GradedQuestion[] = mcqEntries.map((e) => {
    const selectedIndex = selectedFor(e.id);
    const correct = selectedIndex === e.correctIndex;
    return {
      questionId: e.id,
      questionType: 'mcq',
      gradingState: 'graded',
      selectedIndex,
      answerText: null,
      correctIndex: e.correctIndex,
      correct,
      explanation: e.explanation,
      pointsAwarded: correct ? 1 : 0,
      pointsPossible: 1,
      feedback: null,
      review: null,
    };
  });

  const textResults: GradedQuestion[] = textEntries.map((e) => {
    const answerText = textFor(e.id);
    const source = e.chunkId ? sources.get(e.chunkId) : null;
    const blankReview = !answerText && source && Array.isArray(e.criteria) && e.criteria.length === e.maxScore
      ? buildWrittenReview(e.criteria.map((criterion) => ({
          criterionId: criterion.id, awarded: 0,
          reason: 'No answer was submitted, so this textbook marking point was not covered.',
        })), e.criteria, source)
      : null;
    const grade = textGrades.get(e.id) ?? (blankReview
      ? { pointsAwarded: 0, feedback: 'No answer submitted.', gradingState: 'graded' as const, review: blankReview }
      : { pointsAwarded: null, feedback: 'Textbook evidence or marking criteria could not be verified. This answer has not been marked.', gradingState: 'unavailable' as const, review: null });
    return {
      questionId: e.id,
      questionType: e.questionType,
      gradingState: grade.gradingState,
      selectedIndex: null,
      answerText,
      correctIndex: null,
      correct: grade.gradingState === 'graded' && grade.pointsAwarded !== null && grade.pointsAwarded >= e.maxScore * 0.5,
      explanation: null,
      pointsAwarded: grade.pointsAwarded,
      pointsPossible: e.maxScore,
      feedback: grade.feedback,
      review: grade.review,
    };
  });

  return [...mcqResults, ...textResults];
}

export async function POST(req: NextRequest) {
  try {
    const { quizToken, answers, draftId } = await req.json();

    if (typeof quizToken !== 'string' || !quizToken) {
      return NextResponse.json({ error: 'quizToken is required.' }, { status: 400 });
    }
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return NextResponse.json(
        { error: 'answers must be an object mapping question id to the selected option index or free-text answer.' },
        { status: 400 }
      );
    }

    const token = openQuizToken(quizToken);
    if (!token) {
      return NextResponse.json(
        { error: 'This quiz session is invalid or has expired. Generate a new quiz and try again.' },
        { status: 400 }
      );
    }

    const submitted = answers as Record<string, unknown>;
    const selectedFor = (questionId: string): number | null => {
      const raw = submitted[questionId];
      return typeof raw === 'number' && Number.isInteger(raw) ? raw : null;
    };
    const textFor = (questionId: string): string | null => {
      const raw = submitted[questionId];
      return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
    };

    const questionsByPosition = [...token.questions].sort((a, b) => a.position - b.position);
    const admin = getServiceRoleClient();
    const sources = await loadTextSources(admin, token.chapterId, questionsByPosition);
    const results = await gradeAll(questionsByPosition, selectedFor, textFor, sources);

    // Nothing about this quiz has been recorded yet — /api/quiz never persists. This is the
    // first and only point a quiz + its attempt get written, and only because there's a real
    // submission in hand. A generated-but-abandoned quiz never reaches this code path at all.
    let quizId: string | null = null;
    let attemptId: string | null = null;
    const realIdByTokenId = new Map<string, string>();
    let saved = false;
    const { user } = await getCurrentUserAndProfile();
    const reviewColumnAvailable = admin
      ? !(await admin.from('quiz_attempt_answers').select('grading_review').limit(0)).error
      : false;

    if (user && admin && token.chapterId && reviewColumnAvailable) {
      const persistable: PersistableQuestion[] = questionsByPosition.map((q) => ({
        position: q.position,
        stem: q.stem,
        questionType: q.questionType,
        chunkId: q.chunkId,
        options: q.questionType === 'mcq' ? q.options : undefined,
        correctIndex: q.questionType === 'mcq' ? q.correctIndex : undefined,
        explanation: q.questionType === 'mcq' ? q.explanation : undefined,
        modelAnswer: q.questionType !== 'mcq' ? q.modelAnswer : undefined,
        rubric: q.questionType !== 'mcq' ? q.rubric : undefined,
        maxScore: q.questionType !== 'mcq' ? q.maxScore : undefined,
      }));

      const persisted = await persistQuiz(admin, user.id, token.chapterId, token.topicLabel, persistable);

      if (persisted) {
        quizId = persisted.quizId;
        // Token ids and real DB ids are unrelated (the token never touched the database) —
        // match them back up by array order, which both persistQuiz and questionsByPosition
        // preserve as position-ascending.
        questionsByPosition.forEach((q, idx) => realIdByTokenId.set(q.id, persisted.questionIds[idx]));

        const attemptResults: AttemptResult[] = results.map((r) => ({
          questionId: realIdByTokenId.get(r.questionId) ?? r.questionId,
          selectedIndex: r.selectedIndex,
          answerText: r.answerText,
          correct: r.correct,
          pointsAwarded: r.pointsAwarded ?? 0,
          pointsPossible: r.pointsPossible ?? 1,
          feedback: r.feedback,
          gradingState: r.gradingState,
          review: r.review,
        }));
        attemptId = await persistAttempt(admin, quizId, user.id, attemptResults);
        saved = attemptId !== null;

        // The quiz is now real normalized rows (quizzes/quiz_attempts) — drop its parked draft
        // so it moves from "in progress" to "completed" everywhere. Best-effort + ownership-
        // scoped; a stale draft would otherwise just expire on its own.
        if (saved && typeof draftId === 'string' && draftId) {
          const { error: draftDeleteError } = await admin
            .from('quiz_drafts')
            .delete()
            .eq('id', draftId)
            .eq('user_id', user.id);
          if (draftDeleteError) console.warn('Quiz grade: quiz_drafts cleanup failed:', draftDeleteError.message);
        }
      } else {
        console.warn('Quiz grading: quiz persistence failed — this attempt will not be saved to history.');
      }
    } else if (user && admin && token.chapterId && !reviewColumnAvailable) {
      console.warn('Quiz grading: apply local migration 0024_quiz_grading_review.sql before saving attempts.');
    }

    return NextResponse.json({
      score: results.filter((r) => r.correct).length,
      total: results.length,
      answered: results.filter((r) => r.selectedIndex !== null || r.answerText !== null).length,
      results: results.map((r) => ({ ...r, persistedQuestionId: saved ? realIdByTokenId.get(r.questionId) ?? null : null })),
      saved,
      quizId,
      attemptId,
    });
  } catch (error) {
    console.error('Quiz grading error:', error);
    return NextResponse.json({ error: 'Failed to grade quiz' }, { status: 500 });
  }
}
