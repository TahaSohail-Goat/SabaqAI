import React from 'react';
import { CheckCircle2, XCircle, BookOpen } from 'lucide-react';

// Read-only replay of one graded question — used on the quiz history detail page
// (src/app/(app)/quiz/history/[id]/page.tsx). Mirrors the graded-state visual language of the
// live quiz page (src/app/(app)/quiz/page.tsx): correct option in brand-light, the student's
// wrong pick in error-bg, explanation/feedback panels below.

export interface GradedQuestionView {
  position: number;
  stem: string;
  questionType: 'mcq' | 'short' | 'long';
  options?: string[];
  correctIndex: number | null;
  yourIndex: number | null;
  yourText: string | null;
  correct: boolean;
  explanation: string | null;
  modelAnswer: string | null;
  feedback: string | null;
  pointsAwarded: number | null;
  pointsPossible: number | null;
  section: string | null;
  page: number | null;
}

export default function GradedQuestionCard({ q }: { q: GradedQuestionView }) {
  const sectionLabel = q.section || `Q${q.position}`;

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-surface-2 text-brand border border-border-strong">
            Q{q.position}
          </span>
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-navy">{q.stem}</h4>
            {q.questionType !== 'mcq' && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-text-2">
                {q.questionType === 'short' ? 'Short answer' : 'Long answer'} · {q.pointsPossible ?? 1} marks
              </span>
            )}
          </div>
        </div>
        {q.page ? (
          <span className="text-[11px] text-text-2 bg-surface-2 px-2 py-0.5 rounded border border-border flex-shrink-0">
            p. {q.page}
          </span>
        ) : null}
      </div>

      {q.questionType === 'mcq' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          {(q.options || []).map((opt, oIdx) => {
            let optStyle = 'bg-surface-2 border-border text-navy-2';
            if (oIdx === q.correctIndex) {
              optStyle = 'bg-brand-light border-brand text-brand-dark font-semibold';
            } else if (q.yourIndex === oIdx && !q.correct) {
              optStyle = 'bg-error-bg border-error text-error';
            }
            return (
              <div
                key={oIdx}
                className={`p-3 rounded-lg border text-xs text-left flex items-center justify-between ${optStyle}`}
              >
                <span>{opt}</span>
                {oIdx === q.correctIndex && <CheckCircle2 className="w-4 h-4 text-brand" />}
                {q.yourIndex === oIdx && !q.correct && <XCircle className="w-4 h-4 text-error" />}
              </div>
            );
          })}
          {q.yourIndex === null && (
            <p className="text-[11px] text-text-2 italic sm:col-span-2">You left this one blank.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-text-2">Your answer</p>
            <p className="w-full p-3 rounded-lg border border-border bg-surface-2 text-xs text-navy whitespace-pre-wrap">
              {q.yourText || <span className="text-text-2 italic">Left blank.</span>}
            </p>
          </div>
        </div>
      )}

      {q.questionType === 'mcq' && q.explanation && (
        <div className="bg-surface-2 p-3 rounded-lg border border-border text-xs space-y-1">
          <div className="font-semibold text-brand flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Textbook Explanation ({sectionLabel}):</span>
          </div>
          <p className="text-navy-2">{q.explanation}</p>
        </div>
      )}

      {q.questionType !== 'mcq' && q.modelAnswer && (
        <div className="bg-surface-2 p-3 rounded-lg border border-border text-xs space-y-1">
          <div className="font-semibold text-brand flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Model answer ({sectionLabel}):</span>
          </div>
          <p className="text-navy-2 whitespace-pre-wrap">{q.modelAnswer}</p>
        </div>
      )}

      {q.questionType !== 'mcq' && (q.feedback || q.pointsAwarded !== null) && (
        <div className="bg-surface-2 p-3 rounded-lg border border-border text-xs space-y-1">
          <div className="font-semibold text-brand flex items-center justify-between gap-1.5">
            <span className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              Feedback ({sectionLabel}):
            </span>
            <span className="text-navy font-mono">
              {q.pointsAwarded ?? 0} / {q.pointsPossible ?? 1} marks
            </span>
          </div>
          {q.feedback && <p className="text-navy-2">{q.feedback}</p>}
        </div>
      )}
    </div>
  );
}
