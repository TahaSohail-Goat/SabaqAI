// Real quiz persistence — quizzes/quiz_questions/quiz_options/quiz_answer_keys/quiz_attempts/
// quiz_attempt_answers all existed in the schema, fully designed (RLS, FKs, the answer key
// deliberately unreadable except via service role), but nothing ever wrote to them; grading
// used a signed in-memory token instead (src/lib/quiz/answer-key.ts). This is what that
// module's own comment said would let it be retired: grading looks the key up by quiz id.
//
// Used only when a real user + Supabase are both available — /api/quiz falls back to the
// token approach otherwise (demo mode, or a genuine DB error), same resilience pattern the
// rest of this app already uses rather than hard-failing when persistence isn't possible.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface PersistableQuestion {
  position: number;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  /** A real content_chunks UUID this question was grounded in, or null when it isn't one (the
   *  hand-written fallback bank uses synthetic ids like "pctb-10-phy-ch14-01" that don't exist
   *  as real rows) — quiz_questions.chunk_id is nullable specifically for this. */
  chunkId: string | null;
}

export interface PersistedQuiz {
  quizId: string;
  /** Real DB ids, same order/length as the input questions array. */
  questionIds: string[];
}

export async function persistQuiz(
  admin: SupabaseClient,
  userId: string,
  board: string,
  classLevel: number,
  subject: string,
  chapterNo: number,
  chapterTitle: string,
  questions: PersistableQuestion[]
): Promise<PersistedQuiz | null> {
  const { data: chapter, error: chapterError } = await admin
    .from('chapters')
    .upsert(
      { board_code: board, class_level: classLevel, subject_code: subject, chapter_no: chapterNo, chapter_title: chapterTitle },
      { onConflict: 'board_code,class_level,subject_code,chapter_no' }
    )
    .select('id')
    .single();

  if (chapterError || !chapter) {
    console.error('Quiz persist: chapters upsert failed:', chapterError?.message);
    return null;
  }

  const { data: quiz, error: quizError } = await admin
    .from('quizzes')
    .insert({ user_id: userId, chapter_id: chapter.id, difficulty: 'medium' })
    .select('id')
    .single();

  if (quizError || !quiz) {
    console.error('Quiz persist: quizzes insert failed:', quizError?.message);
    return null;
  }

  const { data: insertedQuestions, error: questionsError } = await admin
    .from('quiz_questions')
    .insert(questions.map((q) => ({ quiz_id: quiz.id, position: q.position, stem: q.stem, chunk_id: q.chunkId })))
    .select('id, position');

  if (questionsError || !insertedQuestions) {
    console.error('Quiz persist: quiz_questions insert failed:', questionsError?.message);
    return null;
  }

  // insert().select() doesn't guarantee row order matches input order — match back by position.
  const idByPosition = new Map<number, string>(insertedQuestions.map((q) => [q.position, q.id as string]));

  const optionRows = questions.flatMap((q) => {
    const questionId = idByPosition.get(q.position);
    if (!questionId) return [];
    return q.options.map((option_text, option_index) => ({ question_id: questionId, option_index, option_text }));
  });

  const { error: optionsError } = await admin.from('quiz_options').insert(optionRows);
  if (optionsError) {
    console.error('Quiz persist: quiz_options insert failed:', optionsError.message);
    return null;
  }

  const answerKeyRows = questions.flatMap((q) => {
    const questionId = idByPosition.get(q.position);
    if (!questionId) return [];
    return [{ question_id: questionId, correct_option_index: q.correctIndex, explanation: q.explanation }];
  });

  const { error: answerKeyError } = await admin.from('quiz_answer_keys').insert(answerKeyRows);
  if (answerKeyError) {
    console.error('Quiz persist: quiz_answer_keys insert failed:', answerKeyError.message);
    return null;
  }

  const questionIds = questions.map((q) => idByPosition.get(q.position)).filter((id): id is string => !!id);
  if (questionIds.length !== questions.length) {
    console.error('Quiz persist: question id count mismatch after insert.');
    return null;
  }

  return { quizId: quiz.id, questionIds };
}

export interface AnswerKeyRow {
  questionId: string;
  correctOptionIndex: number;
  explanation: string;
}

/** Looks up a persisted quiz's real answer key by quiz id, verifying it actually belongs to the
 *  requesting user first — quiz_answer_keys has no RLS policy at all (service-role only), so
 *  this ownership check is the only thing stopping one student from grading against another's
 *  quiz id. Returns null if the quiz doesn't exist, isn't theirs, or has no answer key rows. */
export async function fetchAnswerKey(
  admin: SupabaseClient,
  quizId: string,
  userId: string
): Promise<AnswerKeyRow[] | null> {
  const { data: quiz, error: quizError } = await admin
    .from('quizzes')
    .select('id, user_id')
    .eq('id', quizId)
    .maybeSingle();

  if (quizError || !quiz || quiz.user_id !== userId) return null;

  const { data: rows, error: rowsError } = await admin
    .from('quiz_questions')
    .select('id, quiz_answer_keys(correct_option_index, explanation)')
    .eq('quiz_id', quizId);

  if (rowsError || !rows) return null;

  const result: AnswerKeyRow[] = [];
  for (const row of rows as any[]) {
    const key = Array.isArray(row.quiz_answer_keys) ? row.quiz_answer_keys[0] : row.quiz_answer_keys;
    if (!key || typeof key.correct_option_index !== 'number') continue;
    result.push({ questionId: row.id, correctOptionIndex: key.correct_option_index, explanation: key.explanation ?? '' });
  }
  return result;
}

export interface AttemptResult {
  questionId: string;
  selectedIndex: number | null;
  correct: boolean;
}

export async function persistAttempt(
  admin: SupabaseClient,
  quizId: string,
  userId: string,
  results: AttemptResult[]
): Promise<void> {
  const score = results.filter((r) => r.correct).length;
  const answered = results.filter((r) => r.selectedIndex !== null).length;

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
      is_correct: r.correct,
    }))
  );
  if (answersError) {
    console.error('Quiz persist: quiz_attempt_answers insert failed:', answersError.message);
  }
}
