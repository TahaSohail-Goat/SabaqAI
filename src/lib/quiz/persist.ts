// Real quiz persistence — quizzes/quiz_questions/quiz_options/quiz_answer_keys/quiz_attempts/
// quiz_attempt_answers.
//
// persistQuiz/persistAttempt are called ONLY from /api/quiz/grade, and only when there's an
// actual submission from a logged-in user. /api/quiz (generation) never calls anything in this
// file — it seals the whole quiz into an encrypted token (src/lib/quiz/answer-key.ts) instead,
// so a quiz that's generated but never submitted leaves no database row at all. When Supabase
// isn't configured or the user isn't logged in, grading still works (it grades straight from
// the token), it just isn't recorded anywhere — same resilience pattern the rest of this app
// uses rather than hard-failing when persistence isn't possible.
//
// 0012_quiz_question_types.sql extended this for the dynamic quiz module: quiz_questions now
// carries a question_type ('mcq' | 'short' | 'long'), short/long questions store their
// model-answer/rubric in quiz_answer_rubrics (parallel to quiz_answer_keys, same deny-by-
// default RLS), and quiz_attempt_answers grew columns for free-text answers + partial credit.

import type { SupabaseClient } from '@supabase/supabase-js';

export type QuestionType = 'mcq' | 'short' | 'long';

export interface PersistableQuestion {
  position: number;
  stem: string;
  questionType: QuestionType;
  /** A real content_chunks UUID this question was grounded in, or null when it isn't one (the
   *  hand-written fallback bank used synthetic ids like "pctb-10-phy-ch14-01" that don't exist
   *  as real rows) — quiz_questions.chunk_id is nullable specifically for this. */
  chunkId: string | null;
  /** MCQ only. */
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  /** short/long only. */
  modelAnswer?: string;
  rubric?: string;
  maxScore?: number;
}

export interface PersistedQuiz {
  quizId: string;
  /** Real DB ids, same order/length as the input questions array. */
  questionIds: string[];
}

/** Upserts (or looks up) the chapters row for this board/class/subject/chapter — split out from
 *  persistQuiz so /api/quiz can resolve chapterId once up front and reuse it both for the
 *  recent-stems repeat-avoidance query and for persistence, instead of resolving it twice. */
export async function resolveChapterId(
  admin: SupabaseClient,
  board: string,
  classLevel: number,
  subject: string,
  chapterNo: number,
  chapterTitle: string
): Promise<string | null> {
  const { data: chapter, error } = await admin
    .from('chapters')
    .upsert(
      { board_code: board, class_level: classLevel, subject_code: subject, chapter_no: chapterNo, chapter_title: chapterTitle },
      { onConflict: 'board_code,class_level,subject_code,chapter_no' }
    )
    .select('id')
    .single();

  if (error || !chapter) {
    console.error('Quiz persist: chapters upsert failed:', error?.message);
    return null;
  }
  return chapter.id as string;
}

/** Recent question stems this student has already been asked for this chapter (optionally
 *  scoped further to one topic), fed into generation prompts as a "don't repeat these" list.
 *  Best-effort: a query failure here should never block quiz generation, so it returns []
 *  rather than propagating the error. */
export async function fetchRecentStems(
  admin: SupabaseClient,
  userId: string,
  chapterId: string,
  topicLabel: string | null,
  limit = 30
): Promise<string[]> {
  let query = admin
    .from('quizzes')
    .select('quiz_questions(stem)')
    .eq('user_id', userId)
    .eq('chapter_id', chapterId)
    .order('created_at', { ascending: false })
    .limit(10);

  query = topicLabel ? query.eq('topic_label', topicLabel) : query.is('topic_label', null);

  const { data, error } = await query;
  if (error || !data) return [];

  const stems: string[] = [];
  for (const row of data as any[]) {
    const questions = Array.isArray(row.quiz_questions) ? row.quiz_questions : [];
    for (const q of questions) {
      if (typeof q.stem === 'string') stems.push(q.stem);
    }
  }
  return stems.slice(0, limit);
}

export async function persistQuiz(
  admin: SupabaseClient,
  userId: string,
  chapterId: string,
  topicLabel: string | null,
  questions: PersistableQuestion[]
): Promise<PersistedQuiz | null> {
  const { data: quiz, error: quizError } = await admin
    .from('quizzes')
    .insert({ user_id: userId, chapter_id: chapterId, difficulty: 'medium', topic_label: topicLabel })
    .select('id')
    .single();

  if (quizError || !quiz) {
    console.error('Quiz persist: quizzes insert failed:', quizError?.message);
    return null;
  }

  const { data: insertedQuestions, error: questionsError } = await admin
    .from('quiz_questions')
    .insert(
      questions.map((q) => ({
        quiz_id: quiz.id,
        position: q.position,
        stem: q.stem,
        question_type: q.questionType,
        chunk_id: q.chunkId,
      }))
    )
    .select('id, position');

  if (questionsError || !insertedQuestions) {
    console.error('Quiz persist: quiz_questions insert failed:', questionsError?.message);
    return null;
  }

  // insert().select() doesn't guarantee row order matches input order — match back by position.
  const idByPosition = new Map<number, string>(insertedQuestions.map((q) => [q.position, q.id as string]));

  const mcqQuestions = questions.filter((q) => q.questionType === 'mcq');
  const textQuestions = questions.filter((q) => q.questionType !== 'mcq');

  const optionRows = mcqQuestions.flatMap((q) => {
    const questionId = idByPosition.get(q.position);
    if (!questionId || !q.options) return [];
    return q.options.map((option_text, option_index) => ({ question_id: questionId, option_index, option_text }));
  });

  if (optionRows.length > 0) {
    const { error: optionsError } = await admin.from('quiz_options').insert(optionRows);
    if (optionsError) {
      console.error('Quiz persist: quiz_options insert failed:', optionsError.message);
      return null;
    }
  }

  const answerKeyRows = mcqQuestions.flatMap((q) => {
    const questionId = idByPosition.get(q.position);
    if (!questionId || typeof q.correctIndex !== 'number') return [];
    return [{ question_id: questionId, correct_option_index: q.correctIndex, explanation: q.explanation ?? '' }];
  });

  if (answerKeyRows.length > 0) {
    const { error: answerKeyError } = await admin.from('quiz_answer_keys').insert(answerKeyRows);
    if (answerKeyError) {
      console.error('Quiz persist: quiz_answer_keys insert failed:', answerKeyError.message);
      return null;
    }
  }

  const rubricRows = textQuestions.flatMap((q) => {
    const questionId = idByPosition.get(q.position);
    if (!questionId || !q.modelAnswer) return [];
    return [{ question_id: questionId, model_answer: q.modelAnswer, rubric: q.rubric ?? '', max_score: q.maxScore ?? 1 }];
  });

  if (rubricRows.length > 0) {
    const { error: rubricError } = await admin.from('quiz_answer_rubrics').insert(rubricRows);
    if (rubricError) {
      console.error('Quiz persist: quiz_answer_rubrics insert failed:', rubricError.message);
      return null;
    }
  }

  const questionIds = questions.map((q) => idByPosition.get(q.position)).filter((id): id is string => !!id);
  if (questionIds.length !== questions.length) {
    console.error('Quiz persist: question id count mismatch after insert.');
    return null;
  }

  return { quizId: quiz.id, questionIds };
}

export interface AttemptResult {
  questionId: string;
  /** MCQ: selected option index. short/long: the submitted free text. null = unanswered. */
  selectedIndex: number | null;
  answerText: string | null;
  correct: boolean;
  pointsAwarded: number;
  pointsPossible: number;
  feedback: string | null;
}

export async function persistAttempt(
  admin: SupabaseClient,
  quizId: string,
  userId: string,
  results: AttemptResult[]
): Promise<void> {
  // "Passed" a question = at least half credit — keeps score/total as simple counts (matching
  // existing Dashboard reads of quiz_attempts) while still letting individual answers carry
  // partial credit via quiz_attempt_answers.points_awarded.
  const score = results.filter((r) => r.correct).length;
  const answered = results.filter((r) => r.selectedIndex !== null || r.answerText !== null).length;

  const { data: attempt, error: attemptError } = await admin
    .from('quiz_attempts')
    .insert({ quiz_id: quizId, user_id: userId, score, total: results.length, answered })
    .select('id')
    .single();

  if (attemptError || !attempt) {
    console.error('Quiz persist: quiz_attempts insert failed:', attemptError?.message);
    return;
  }

  const { error: answersError } = await admin.from('quiz_attempt_answers').insert(
    results.map((r) => ({
      attempt_id: attempt.id,
      question_id: r.questionId,
      selected_option_index: r.selectedIndex,
      answer_text: r.answerText,
      is_correct: r.correct,
      points_awarded: r.pointsAwarded,
      points_possible: r.pointsPossible,
      feedback: r.feedback,
    }))
  );
  if (answersError) {
    console.error('Quiz persist: quiz_attempt_answers insert failed:', answersError.message);
  }
}
