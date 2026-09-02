'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, RefreshCw, History, ArrowRight, Play, X, Clock } from 'lucide-react';
import EmptyState from '@/components/app/EmptyState';
import { SUBJECT_LABELS } from '@/lib/subjects';
import { listQuizDrafts, deleteQuizDraft, type QuizDraftRow } from '@/lib/quiz/drafts-api';
import type { QuizHistoryRow } from '@/app/api/quiz/history/route';

/** Full-scope resume link so the /quiz page initialises its subject state correctly (see the
 *  arrivedViaLink comment there) before the async draft load applies. */
function resumeHref(d: QuizDraftRow): string {
  return `/quiz?draft=${encodeURIComponent(d.id)}&subject=${encodeURIComponent(d.subjectCode)}&chapterNo=${d.chapterNo}`;
}

function relativeDate(iso: string | number): string {
  const then = new Date(iso);
  const diffMs = Date.now() - then.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day && then.getDate() === new Date().getDate()) {
    return then.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  if (diffMs < 7 * day) {
    return then.toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  }
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function scorePillClass(pct: number): string {
  if (pct >= 70) return 'bg-brand-light text-brand-dark';
  if (pct >= 40) return 'bg-quiz-light text-quiz';
  return 'bg-error-bg text-error';
}

export default function QuizHistoryPage() {
  const [attempts, setAttempts] = useState<QuizHistoryRow[] | null>(null);
  const [drafts, setDrafts] = useState<QuizDraftRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/quiz/history')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setAttempts(data.attempts ?? []);
      })
      .catch(() => {
        if (!cancelled) setAttempts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    listQuizDrafts().then((d) => {
      if (!cancelled) setDrafts(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const discardDraft = (id: string) => {
    deleteQuizDraft(id);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-navy">Quiz history</h2>
          <p className="text-xs text-text-2 mt-1.5">
            Resume a quiz you started, or open a finished one to see the solved paper and its feedback.
          </p>
        </div>
        <Link
          href="/quiz"
          className="flex items-center gap-1.5 text-xs font-semibold text-navy-2 hover:text-navy transition"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back to Quiz
        </Link>
      </div>

      {/* In progress — parked server-side (quiz_drafts), so these survive logout and show on
          any device. A quiz only becomes a real record once it's submitted and graded. */}
      {drafts.length > 0 && (
        <section className="space-y-3 animate-fade-up">
          <h3 className="text-xs font-bold text-text-2 uppercase tracking-wider">In progress</h3>
          {drafts.map((d) => {
            const stale = d.expired;
            return (
              <div
                key={d.id}
                className="flex items-center justify-between gap-4 bg-surface border border-border rounded-2xl p-4"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-bold text-navy truncate">
                    {SUBJECT_LABELS[d.subjectCode] || d.subjectCode}
                    <span className="text-text-2 font-medium">
                      {' '}
                      · Ch {d.chapterNo}
                      {d.chapterTitle ? `: ${d.chapterTitle}` : ''}
                    </span>
                  </p>
                  <p className="text-[11px] text-text-2">
                    {d.answeredCount}/{d.totalQuestions} answered · started {relativeDate(d.generatedAt)}
                  </p>
                  {stale && (
                    <p className="text-[11px] text-quiz flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Session expired — reopen to review, but you&apos;ll need to regenerate to submit.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={resumeHref(d)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand hover:bg-brand-dark text-white text-xs font-semibold rounded-lg transition"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Resume
                  </Link>
                  <button
                    type="button"
                    onClick={() => discardDraft(d.id)}
                    title="Discard this draft"
                    className="p-1.5 rounded-lg text-text-2 hover:bg-error-bg hover:text-error transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Completed */}
      <section className="space-y-3">
        {drafts.length > 0 && (
          <h3 className="text-xs font-bold text-text-2 uppercase tracking-wider animate-fade-up">Completed</h3>
        )}

        {attempts === null ? (
          <div className="bg-surface border border-border rounded-xl p-12 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-brand animate-spin mx-auto" />
            <div className="text-sm text-navy-2">Loading your quiz history...</div>
          </div>
        ) : attempts.length === 0 ? (
          <EmptyState
            icon={History}
            title={drafts.length > 0 ? 'No finished quizzes yet' : 'No quizzes yet'}
            message="Once you submit a quiz, it shows up here with the full solved paper and a breakdown of how you did."
            ctaLabel="Take a quiz"
            ctaHref="/quiz"
          />
        ) : (
          <div className="space-y-3 animate-fade-up">
            {attempts.map((a) => (
              <Link
                key={a.id}
                href={`/quiz/history/${a.id}`}
                className="group flex items-center justify-between gap-4 bg-surface border border-border rounded-2xl p-4 hover:shadow-sm transition"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-bold text-navy truncate">
                    {a.subjectCode ? SUBJECT_LABELS[a.subjectCode] || a.subjectCode : 'Quiz'}
                    {a.chapterNo !== null && (
                      <span className="text-text-2 font-medium">
                        {' '}
                        · Ch {a.chapterNo}
                        {a.chapterTitle ? `: ${a.chapterTitle}` : ''}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-text-2">
                    {relativeDate(a.submittedAt)} · {a.answered}/{a.total} answered
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${scorePillClass(a.scorePct)}`}>
                    {a.score}/{a.total}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] font-bold text-brand group-hover:text-brand-dark transition">
                    View quiz
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
