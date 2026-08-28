'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import SabaqLogoBadge from '@/components/SabaqLogoBadge';

// PCTB removed for now, coming back later — FBISE only until then.
const BOARDS = [
  { code: 'FBISE', name: 'Federal Board of Intermediate and Secondary Education' },
];

const CLASS_LEVELS = [9, 10, 11, 12];

const SUBJECTS = [
  { code: 'physics', label: 'Physics' },
  { code: 'chemistry', label: 'Chemistry' },
  { code: 'biology', label: 'Biology' },
  { code: 'mathematics', label: 'Mathematics' },
  { code: 'english', label: 'English' },
  { code: 'urdu', label: 'Urdu' },
];

const STEPS = ['Board', 'Class', 'Subjects', 'Exam date'] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  // Only one board exists right now, so it's pre-selected — nothing to choose yet, but the
  // picker UI stays in place so adding PCTB back later is a one-line array change.
  const [board, setBoard] = useState<string | null>('FBISE');
  const [classLevel, setClassLevel] = useState<number | null>(null);
  const [subjects, setSubjects] = useState<string[]>(['physics']);
  const [examDate, setExamDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSubject = (code: string) => {
    setSubjects((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const canAdvance = step === 0 ? !!board : step === 1 ? !!classLevel : step === 2 ? subjects.length > 0 : true;

  const finish = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board, classLevel, subjects, examDate: examDate || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not save your setup. Please try again.');
      }
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-page flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-center gap-3 mb-8">
          <SabaqLogoBadge size={44} />
          <span className="font-display text-2xl font-semibold tracking-tight text-navy">
            Sabaq<span className="text-brand">AI</span>
          </span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((label, i) => (
            <div key={label} className="flex-1">
              <div className={`h-1.5 rounded-full transition-colors ${i <= step ? 'bg-brand' : 'bg-border'}`} />
              <p className={`mt-1.5 text-[10px] font-semibold uppercase tracking-wide ${i === step ? 'text-brand-dark' : 'text-text-3'}`}>
                {label}
              </p>
            </div>
          ))}
        </div>

        <div className="bg-surface border border-border-strong rounded-2xl p-6 sm:p-8 shadow-sm">
          {error && (
            <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-xl border border-error/30 bg-error-bg p-3.5 text-sm text-error">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 0 && (
            <div className="space-y-1.5">
              <h2 className="font-display text-2xl font-semibold text-navy">Which board are you on?</h2>
              <p className="text-sm text-text-2 mb-5">This decides which textbooks and past papers we search.</p>
              <div className="space-y-2.5">
                {BOARDS.map((b) => (
                  <button
                    key={b.code}
                    type="button"
                    onClick={() => setBoard(b.code)}
                    className={`w-full flex items-center justify-between gap-3 rounded-xl border p-4 text-left transition-colors ${
                      board === b.code
                        ? 'border-brand bg-accent-subtle'
                        : 'border-border hover:border-border-strong hover:bg-surface-hover'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-bold text-navy">{b.code}</p>
                      <p className="text-xs text-text-2 mt-0.5">{b.name}</p>
                    </div>
                    {board === b.code && <Check className="w-5 h-5 text-brand shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-1.5">
              <h2 className="font-display text-2xl font-semibold text-navy">What class are you in?</h2>
              <p className="text-sm text-text-2 mb-5">We'll only show you content for your class.</p>
              <div className="grid grid-cols-4 gap-2.5">
                {CLASS_LEVELS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setClassLevel(c)}
                    className={`rounded-xl border p-4 text-center transition-colors ${
                      classLevel === c
                        ? 'border-brand bg-accent-subtle text-brand-dark'
                        : 'border-border text-navy-2 hover:border-border-strong hover:bg-surface-hover'
                    }`}
                  >
                    <span className="text-lg font-bold">{c}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-1.5">
              <h2 className="font-display text-2xl font-semibold text-navy">Your subjects</h2>
              <p className="text-sm text-text-2 mb-5">Pick everything you study — you can change this later in Settings.</p>
              <div className="grid grid-cols-2 gap-2.5">
                {SUBJECTS.map((s) => {
                  const selected = subjects.includes(s.code);
                  return (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => toggleSubject(s.code)}
                      className={`flex items-center justify-between gap-2 rounded-xl border p-3.5 text-left transition-colors ${
                        selected
                          ? 'border-brand bg-accent-subtle'
                          : 'border-border hover:border-border-strong hover:bg-surface-hover'
                      }`}
                    >
                      <span className={`text-sm font-semibold ${selected ? 'text-brand-dark' : 'text-navy-2'}`}>{s.label}</span>
                      {selected && <Check className="w-4 h-4 text-brand shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-1.5">
              <h2 className="font-display text-2xl font-semibold text-navy">When's your exam?</h2>
              <p className="text-sm text-text-2 mb-5">Optional — lets us tell you how many days you have left. You can set this later in Settings.</p>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-2/60 px-4 py-3.5 text-[15px] text-navy focus:bg-surface focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none transition-all duration-300"
              />
            </div>
          )}

          {/* Nav */}
          <div className="flex items-center justify-between mt-7 pt-5 border-t border-border">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-navy-2 hover:bg-surface-hover transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            ) : (
              <span />
            )}

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canAdvance}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-brand hover:bg-brand-dark disabled:bg-disabled disabled:text-disabled-text transition-colors"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {!examDate && (
                  <button
                    type="button"
                    onClick={finish}
                    disabled={submitting}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-navy-2 hover:bg-surface-hover transition-colors"
                  >
                    Skip for now
                  </button>
                )}
                <button
                  type="button"
                  onClick={finish}
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-brand hover:bg-brand-dark disabled:opacity-60 transition-colors"
                >
                  {submitting ? 'Saving...' : 'Finish'} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
