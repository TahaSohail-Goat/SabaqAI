'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, RefreshCw, FileQuestion } from 'lucide-react';
import EmptyState from '@/components/app/EmptyState';
import QuizResultsSummary from '@/components/app/QuizResultsSummary';
import GradedQuestionCard from '@/components/app/GradedQuestionCard';
import { SUBJECT_LABELS } from '@/lib/subjects';
import type { QuizAttemptDetail } from '@/app/api/quiz/history/[id]/route';

export default function QuizAttemptDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [detail, setDetail] = useState<QuizAttemptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`/api/quiz/history/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setError('Could not reach the server.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="animate-fade-up">
        <Link
          href="/quiz/history"
          className="flex items-center gap-1.5 text-xs font-semibold text-navy-2 hover:text-navy transition w-fit"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back to history
        </Link>
        {detail && (
          <div className="mt-3">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-navy">
              {detail.attempt.subjectCode
                ? SUBJECT_LABELS[detail.attempt.subjectCode] || detail.attempt.subjectCode
                : 'Quiz'}
              {detail.attempt.chapterNo !== null && (
                <span className="text-text-2 font-medium text-lg"> · Ch {detail.attempt.chapterNo}</span>
              )}
            </h2>
            <p className="text-xs text-text-2 mt-1.5">
              {detail.attempt.chapterTitle ? `${detail.attempt.chapterTitle} · ` : ''}
              Submitted {new Date(detail.attempt.submittedAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          </div>
        )}
      </div>

      {error ? (
        <EmptyState icon={FileQuestion} title="Quiz unavailable" message={error} ctaLabel="Back to history" ctaHref="/quiz/history" />
      ) : !detail ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-brand animate-spin mx-auto" />
          <div className="text-sm text-navy-2">Loading the solved paper...</div>
        </div>
      ) : (
        <div className="space-y-4 animate-fade-up">
          <QuizResultsSummary summary={detail.summary} />
          {detail.questions.map((q) => (
            <GradedQuestionCard key={q.position} q={q} />
          ))}
        </div>
      )}
    </div>
  );
}
