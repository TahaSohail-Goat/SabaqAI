import React from 'react';
import { Target, CheckCircle2, TrendingDown, TrendingUp } from 'lucide-react';
import type { AttemptSummary, QuestionType } from '@/lib/quiz/feedback';

// Attempt-level roll-up shown after grading (src/app/(app)/quiz/page.tsx) and on the history
// detail page. Purely presentational — all numbers come from summarizeAttempt().

const TYPE_LABEL: Record<QuestionType, string> = { mcq: 'MCQ', short: 'Short answer', long: 'Long answer' };

function scoreTone(pct: number): string {
  if (pct >= 70) return 'text-brand';
  if (pct >= 40) return 'text-quiz';
  return 'text-error';
}

export default function QuizResultsSummary({ summary }: { summary: AttemptSummary }) {
  const typeRows = (Object.entries(summary.byType) as [QuestionType, AttemptSummary['byType'][QuestionType]][])
    .filter(([, s]) => s.total > 0);

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-accent-subtle text-brand flex items-center justify-center shrink-0">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-navy">Results summary</h3>
            <p className="text-[11px] text-text-2">
              {summary.passedCount} / {summary.totalCount} questions passed · {summary.answeredCount} answered
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className={`font-display text-3xl font-semibold leading-none ${scoreTone(summary.scorePct)}`}>
            {summary.scorePct}%
          </div>
          <p className="text-[10px] text-text-2 mt-1">
            {summary.pointsAwarded} / {summary.pointsPossible} marks
          </p>
        </div>
      </div>

      {typeRows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {typeRows.map(([type, s]) => (
            <div key={type} className="bg-surface-2 border border-border rounded-lg px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-2">{TYPE_LABEL[type]}</p>
              <p className="text-xs font-semibold text-navy mt-0.5">
                {s.correct} / {s.total}
                {s.pct !== null && <span className="text-text-2 font-normal"> · {s.pct}%</span>}
              </p>
            </div>
          ))}
        </div>
      )}

      {(summary.weakestSections.length > 0 || summary.strongestSections.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {summary.weakestSections.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-2 flex items-center gap-1">
                <TrendingDown className="w-3 h-3" /> Review these
              </p>
              {summary.weakestSections.map((s) => (
                <div key={s.section} className="text-xs text-navy-2 flex items-center justify-between gap-2 bg-error-bg rounded px-2 py-1">
                  <span className="truncate">{s.section}{s.page ? ` · p. ${s.page}` : ''}</span>
                  <span className="text-error font-semibold shrink-0">{s.pct}%</span>
                </div>
              ))}
            </div>
          )}
          {summary.strongestSections.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-2 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Solid on
              </p>
              {summary.strongestSections.map((s) => (
                <div key={s.section} className="text-xs text-navy-2 flex items-center justify-between gap-2 bg-brand-light rounded px-2 py-1">
                  <span className="truncate">{s.section}{s.page ? ` · p. ${s.page}` : ''}</span>
                  <span className="text-brand-dark font-semibold shrink-0">{s.pct}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-start gap-2 text-xs text-navy-2 bg-quiz-light border border-quiz-border rounded-lg px-3 py-2.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-quiz shrink-0 mt-0.5" />
        <p className="leading-relaxed">{summary.recommendation}</p>
      </div>
    </div>
  );
}
