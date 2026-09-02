// Per-chapter mastery — real accuracy computed from a student's actual quiz attempts, never a
// hardcoded or guessed number (invariant 1). Shared by /api/dashboard/progress (M9) and
// /api/dashboard/plan/[id] (M10, which ranks chapters by this same data) — extracted here so
// both read identical logic instead of two copies drifting apart.
//
// Join path deliberately does NOT follow the modules.md spec's literal wording
// (quiz_attempt_answers -> quiz_questions.chunk_id -> content_chunks -> sections ->
// chapter_sources -> chapters). quiz_questions.chunk_id is nullable (on delete set null, and
// the local-dev fallback corpus never has real chunk rows at all) — an inner join on it would
// silently drop answered questions from mastery. Every quiz is tied directly to exactly one
// chapter via quizzes.chapter_id (not-null; topic-scoped quizzes were removed from the quiz
// module entirely, see src/app/api/quiz/route.ts), so that's the robust path here:
// quiz_attempt_answers -> quiz_attempts.quiz_id -> quizzes.chapter_id -> chapters.

import type { SupabaseClient } from '@supabase/supabase-js';

export type MasteryBand = 'strong' | 'getting_there' | 'needs_work' | 'insufficient_data' | 'not_started';

export interface ChapterMastery {
  chapterNo: number;
  chapterTitle: string | null;
  band: MasteryBand;
  accuracy: number | null;
  answered: number;
  correct: number;
}

export interface SubjectMastery {
  subject: string;
  chapters: ChapterMastery[];
}

// A lucky 1-of-1 correct answer isn't mastery — same floor the module spec calls for.
const MIN_ANSWERED_FOR_BAND = 5;

export function bandFor(answered: number, correct: number): { band: MasteryBand; accuracy: number | null } {
  if (answered === 0) return { band: 'not_started', accuracy: null };
  const accuracy = correct / answered;
  if (answered < MIN_ANSWERED_FOR_BAND) return { band: 'insufficient_data', accuracy };
  if (accuracy >= 0.8) return { band: 'strong', accuracy };
  if (accuracy >= 0.5) return { band: 'getting_there', accuracy };
  return { band: 'needs_work', accuracy };
}

/** Computes per-chapter mastery for a student, scoped to board/classLevel and the given
 *  subjects. Returns one entry per subject that has at least one real textbook chapter or a
 *  real attempted chapter — subjects with neither are simply absent from the result. */
export async function computeChapterMastery(
  admin: SupabaseClient,
  userId: string,
  board: string,
  classLevel: number,
  subjects: string[]
): Promise<SubjectMastery[]> {
  if (subjects.length === 0) return [];

  // 1. The universe: every chapter with real ingested textbook content in this student's scope,
  // across the requested subjects — same source_type filter as /api/quiz/scope, since mastery
  // only ever makes sense for chapters a quiz could actually be generated from.
  const { data: chapterRows, error: chaptersError } = await admin
    .from('content_chunks_expanded')
    .select('subject, chapter_no, chapter_title')
    .eq('board', board)
    .eq('class_level', classLevel)
    .in('subject', subjects)
    .eq('source_type', 'textbook');

  if (chaptersError) {
    throw new Error(`Mastery: chapters query failed: ${chaptersError.message}`);
  }

  const chapterUniverse = new Map<string, { subject: string; chapterNo: number; chapterTitle: string | null }>();
  for (const r of chapterRows ?? []) {
    const key = `${r.subject}::${r.chapter_no}`;
    if (!chapterUniverse.has(key)) {
      chapterUniverse.set(key, { subject: r.subject, chapterNo: r.chapter_no, chapterTitle: r.chapter_title });
    }
  }

  // 2. What this student has actually attempted, aggregated in application code — a one-off
  // per-user aggregation like this doesn't need a DB function, matching how the rest of this
  // codebase (e.g. /api/dashboard/stats) keeps aggregation logic in TS rather than SQL.
  const { data: attempts, error: attemptsError } = await admin
    .from('quiz_attempts')
    .select(
      'quizzes(chapter_id, chapters(chapter_no, chapter_title, subject_code, chapter_sources(source_type))), quiz_attempt_answers(selected_option_index, answer_text, is_correct)'
    )
    .eq('user_id', userId);

  if (attemptsError) {
    throw new Error(`Mastery: attempts query failed: ${attemptsError.message}`);
  }

  const aggregateByKey = new Map<string, { answered: number; correct: number }>();
  for (const attempt of (attempts ?? []) as any[]) {
    const quiz = Array.isArray(attempt.quizzes) ? attempt.quizzes[0] : attempt.quizzes;
    const chapter = quiz ? (Array.isArray(quiz.chapters) ? quiz.chapters[0] : quiz.chapters) : null;
    if (!chapter || !subjects.includes(chapter.subject_code)) continue;

    const key = `${chapter.subject_code}::${chapter.chapter_no}`;

    // A handful of "chapters" in the corpus (chapter_no 2025, "Model Paper 2025 — <subject>")
    // are ingestion artifacts that only ever had model_paper source content — never real
    // textbook curriculum. Before the quiz module was scoped to source_type='textbook' only
    // (see /api/quiz), it was possible to generate and submit a quiz against one of these, so
    // real quiz_attempts rows can still point at them. Verify against chapter_sources rather
    // than trusting chapterUniverse membership alone — a chapter not in scope for OTHER
    // reasons (e.g. board/class mismatch) should still count, but one that never had textbook
    // content at all is not a real chapter and must never appear as student progress.
    if (!chapterUniverse.has(key)) {
      const sources = Array.isArray(chapter.chapter_sources) ? chapter.chapter_sources : [];
      const isRealTextbookChapter = sources.some((s: { source_type: string }) => s.source_type === 'textbook');
      if (!isRealTextbookChapter) continue;
      chapterUniverse.set(key, { subject: chapter.subject_code, chapterNo: chapter.chapter_no, chapterTitle: chapter.chapter_title });
    }

    const bucket = aggregateByKey.get(key) ?? { answered: 0, correct: 0 };

    const answers = Array.isArray(attempt.quiz_attempt_answers) ? attempt.quiz_attempt_answers : [];
    for (const a of answers) {
      const wasAnswered = a.selected_option_index !== null || (typeof a.answer_text === 'string' && a.answer_text.length > 0);
      if (!wasAnswered) continue;
      bucket.answered += 1;
      if (a.is_correct) bucket.correct += 1;
    }

    aggregateByKey.set(key, bucket);
  }

  // 3. Merge into the response shape, grouped by subject.
  const bySubject = new Map<string, ChapterMastery[]>();
  for (const [key, entry] of chapterUniverse) {
    const agg = aggregateByKey.get(key) ?? { answered: 0, correct: 0 };
    const { band, accuracy } = bandFor(agg.answered, agg.correct);
    const list = bySubject.get(entry.subject) ?? [];
    list.push({ chapterNo: entry.chapterNo, chapterTitle: entry.chapterTitle, band, accuracy, answered: agg.answered, correct: agg.correct });
    bySubject.set(entry.subject, list);
  }

  return [...bySubject.entries()]
    .map(([subject, chapters]) => ({ subject, chapters: chapters.sort((a, b) => a.chapterNo - b.chapterNo) }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
}
