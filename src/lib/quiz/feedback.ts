// Computed, deterministic feedback for a graded quiz attempt — no LLM, no DB. Every number is
// derived straight from the attempt's own results, matching invariant 1 ("no hardcoded/guessed
// metrics") and the way the rest of the app keeps aggregation in TS (src/lib/mastery.ts,
// /api/dashboard/stats) rather than in SQL or a model call.
//
// Shared by the live quiz page (src/app/(app)/quiz/page.tsx, right after grading) and the
// history detail route (/api/quiz/history/[id]) so the "how did this attempt go" summary is
// computed identically in both places instead of two copies drifting apart.
//
// Per-question feedback (MCQ explanations, LLM-graded free-text feedback) is separate and
// already produced by /api/quiz/grade — this is only the attempt-level roll-up.

export type QuestionType = 'mcq' | 'short' | 'long';

export interface AttemptItem {
  questionType: QuestionType;
  /** sections.section_label, when the question's source chunk is known. */
  section: string | null;
  page: number | null;
  correct: boolean;
  pointsAwarded: number;
  pointsPossible: number;
  answered: boolean;
}

export interface SectionStat {
  section: string;
  page: number | null;
  correct: number;
  total: number;
  pct: number;
}

export interface TypeStat {
  correct: number;
  total: number;
  /** null when the quiz had no questions of this type. */
  pct: number | null;
}

export interface AttemptSummary {
  /** Points-based, 0–100, rounded. The fine-grained score (partial credit counts). */
  scorePct: number;
  pointsAwarded: number;
  pointsPossible: number;
  /** "Passed" = at least half credit on the question — the same coarse count quiz_attempts.score
   *  stores and the Dashboard reads. */
  passedCount: number;
  totalCount: number;
  answeredCount: number;
  byType: Record<QuestionType, TypeStat>;
  /** Sections the student did worst on (asc by pct), then best on (desc). Only sections with at
   *  least 2 questions and a known label — a 1-of-1 result isn't a signal worth calling out. */
  weakestSections: SectionStat[];
  strongestSections: SectionStat[];
  recommendation: string;
}

const TYPE_LABEL: Record<QuestionType, string> = { mcq: 'MCQs', short: 'short answers', long: 'long answers' };
const MIN_QS_FOR_SECTION_SIGNAL = 2;

function round(n: number): number {
  return Math.round(n);
}

function buildRecommendation(
  scorePct: number,
  byType: Record<QuestionType, TypeStat>,
  weakest: SectionStat[]
): string {
  const parts: string[] = [];

  if (scorePct >= 85) {
    parts.push('Strong attempt. You have a solid grip on this chapter.');
  } else if (scorePct >= 60) {
    parts.push("Decent attempt, but there's room to tighten up.");
  } else if (scorePct >= 40) {
    parts.push('This chapter needs another pass before you rely on it in an exam.');
  } else {
    parts.push('Re-study this chapter from the textbook before retaking. The fundamentals need work.');
  }

  // Call out the weakest question type only when it's clearly behind the others.
  const typed = (Object.entries(byType) as [QuestionType, TypeStat][]).filter(([, s]) => s.pct !== null && s.total > 0);
  if (typed.length > 1) {
    const worst = typed.reduce((a, b) => (a[1].pct! <= b[1].pct! ? a : b));
    const best = typed.reduce((a, b) => (a[1].pct! >= b[1].pct! ? a : b));
    if (best[1].pct! - worst[1].pct! >= 25) {
      parts.push(`Your ${TYPE_LABEL[worst[0]]} (${round(worst[1].pct!)}%) lagged your ${TYPE_LABEL[best[0]]} (${round(best[1].pct!)}%).`);
    }
  }

  if (weakest.length > 0) {
    const names = weakest.slice(0, 2).map((s) => (s.page ? `${s.section} (p. ${s.page})` : s.section));
    parts.push(`Focus your review on ${names.join(' and ')}.`);
  }

  return parts.join(' ');
}

export function summarizeAttempt(items: AttemptItem[]): AttemptSummary {
  const totalCount = items.length;
  const pointsAwarded = items.reduce((s, i) => s + i.pointsAwarded, 0);
  const pointsPossible = items.reduce((s, i) => s + i.pointsPossible, 0);
  const passedCount = items.filter((i) => i.correct).length;
  const answeredCount = items.filter((i) => i.answered).length;
  const scorePct = pointsPossible > 0 ? round((pointsAwarded / pointsPossible) * 100) : 0;

  const byType = { mcq: emptyType(), short: emptyType(), long: emptyType() } as Record<QuestionType, TypeStat>;
  for (const i of items) {
    const t = byType[i.questionType];
    t.total += 1;
    if (i.correct) t.correct += 1;
  }
  for (const t of Object.values(byType)) {
    t.pct = t.total > 0 ? round((t.correct / t.total) * 100) : null;
  }

  const bySection = new Map<string, { section: string; page: number | null; correct: number; total: number }>();
  for (const i of items) {
    if (!i.section) continue;
    const entry = bySection.get(i.section) ?? { section: i.section, page: i.page, correct: 0, total: 0 };
    entry.total += 1;
    if (i.correct) entry.correct += 1;
    if (entry.page == null && i.page != null) entry.page = i.page;
    bySection.set(i.section, entry);
  }

  const sectionStats: SectionStat[] = [...bySection.values()]
    .filter((s) => s.total >= MIN_QS_FOR_SECTION_SIGNAL)
    .map((s) => ({ ...s, pct: round((s.correct / s.total) * 100) }));

  const weakestSections = sectionStats
    .filter((s) => s.pct < 100)
    .sort((a, b) => a.pct - b.pct || b.total - a.total)
    .slice(0, 3);
  const strongestSections = sectionStats
    .filter((s) => s.pct >= 70)
    .sort((a, b) => b.pct - a.pct || b.total - a.total)
    .slice(0, 3);

  return {
    scorePct,
    pointsAwarded: Math.round(pointsAwarded * 100) / 100,
    pointsPossible: Math.round(pointsPossible * 100) / 100,
    passedCount,
    totalCount,
    answeredCount,
    byType,
    weakestSections,
    strongestSections,
    recommendation: buildRecommendation(scorePct, byType, weakestSections),
  };
}

function emptyType(): TypeStat {
  return { correct: 0, total: 0, pct: null };
}
