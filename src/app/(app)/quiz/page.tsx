'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RefreshCw, CheckCircle2, XCircle, BookOpen, FileQuestion, Sparkles } from 'lucide-react';
import { useScope } from '@/components/app/ScopeContext';
import EmptyState from '@/components/app/EmptyState';
import SelectField from '@/components/app/SelectField';
import { SUBJECT_LABELS } from '@/lib/subjects';

type QuestionType = 'mcq' | 'short' | 'long';

interface QuizQuestion {
  id: string;
  position: number;
  stem: string;
  questionType: QuestionType;
  options?: string[];
  maxScore?: number;
  chunkId: string;
  chapterNo: number;
  page: number;
  section: string;
}

interface GradedQuestion {
  questionId: string;
  questionType: QuestionType;
  selectedIndex: number | null;
  answerText: string | null;
  correctIndex: number | null;
  correct: boolean;
  explanation: string | null;
  pointsAwarded: number | null;
  pointsPossible: number | null;
  feedback: string | null;
}

interface QuizGrade {
  score: number;
  total: number;
  answered: number;
  results: GradedQuestion[];
}

interface Chapter {
  chapterNo: number;
  chapterTitle: string | null;
}

const QUIZ_SCOPE_DESCRIPTION = '50 MCQs, 10 short-answer and 2 long-answer questions';

// useSearchParams requires a Suspense boundary in the App Router — this wrapper exists only for
// that; all the real page logic lives in QuizPageInner.
export default function QuizPage() {
  return (
    <Suspense fallback={null}>
      <QuizPageInner />
    </Suspense>
  );
}

function QuizPageInner() {
  const { board, classLevel, subject: scopeSubject, profile } = useScope();
  // A student is enrolled in every seeded subject by default (see create-account.ts) — filter
  // to just those so this doesn't offer subjects with no reason to appear here.
  const enrolledSubjects = profile?.subjects?.length ? profile.subjects : [scopeSubject];

  // The Revision Planner links here with ?subject=&chapterNo= for its "Practice quiz" action —
  // pre-select that scope when present and valid, instead of always defaulting to the current
  // scope subject / the first ingested chapter.
  const searchParams = useSearchParams();
  const linkedSubject = searchParams.get('subject');
  const linkedChapterNo = searchParams.get('chapterNo') ? Number(searchParams.get('chapterNo')) : null;

  const [selectedSubject, setSelectedSubject] = useState(
    linkedSubject && enrolledSubjects.includes(linkedSubject) ? linkedSubject : scopeSubject
  );
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(true);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);

  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [isPartial, setIsPartial] = useState(false);
  const [effectiveCounts, setEffectiveCounts] = useState<{ mcq: number; short: number; long: number } | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number | string>>({});
  const [isQuizSubmitted, setIsQuizSubmitted] = useState(false);
  // Nothing about this quiz is recorded server-side until submitQuiz() posts this token —
  // generation only ever seals a token, it never writes a DB row (see /api/quiz/grade).
  const [quizToken, setQuizToken] = useState<string | null>(null);
  const [quizGrade, setQuizGrade] = useState<QuizGrade | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [isGrading, setIsGrading] = useState(false);

  const generateQuiz = async () => {
    if (selectedChapter === null || quizLoading) return;
    setQuizLoading(true);
    setQuizError(null);
    setHasGenerated(true);
    setIsPartial(false);
    setEffectiveCounts(null);
    setSelectedAnswers({});
    setIsQuizSubmitted(false);
    setQuizGrade(null);
    setGradeError(null);
    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterNo: selectedChapter,
          subject: selectedSubject,
          board,
          classLevel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQuizError(data.error || 'Could not generate a quiz for this scope.');
        setQuizQuestions([]);
        setQuizToken(null);
        return;
      }
      setQuizQuestions(data.questions || []);
      setQuizToken(data.quizToken ?? null);
      setIsPartial(!!data.partial);
      setEffectiveCounts(data.effectiveCounts ?? null);
    } catch (err) {
      console.error('Quiz generation error:', err);
      setQuizError('Could not reach the server. Check your connection and try again.');
    } finally {
      setQuizLoading(false);
    }
  };

  // Which chapters actually have ingested content for the selected subject — driven by the
  // real corpus, not a hardcoded chapter list that could claim coverage the corpus doesn't have.
  useEffect(() => {
    let cancelled = false;
    setChaptersLoading(true);
    setChapters([]);
    setSelectedChapter(null);
    setQuizQuestions([]);
    setHasGenerated(false);

    const params = new URLSearchParams({ board, classLevel: String(classLevel), subject: selectedSubject });
    fetch(`/api/quiz/scope?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const chs: Chapter[] = data.chapters || [];
        setChapters(chs);
        if (chs.length > 0) {
          // Only honor the linked chapter while still on the subject the link pointed at — if
          // the student manually switches subjects afterward, fall back to the normal default
          // rather than reapplying a chapter number that belonged to a different subject.
          const linked =
            selectedSubject === linkedSubject &&
            linkedChapterNo !== null &&
            chs.some((c) => c.chapterNo === linkedChapterNo);
          setSelectedChapter(linked ? linkedChapterNo : chs[0].chapterNo);
        }
      })
      .catch((err) => console.error('Quiz scope (chapters) load error:', err))
      .finally(() => {
        if (!cancelled) setChaptersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSubject, board, classLevel, linkedSubject, linkedChapterNo]);

  // Grading happens on the server — the browser never held the answer key/rubric. This is also
  // the ONLY point the quiz is ever recorded: generation never writes a DB row, so a quiz the
  // student generates and never submits leaves no trace.
  const submitQuiz = async () => {
    if (!quizToken || isGrading) return;
    setIsGrading(true);
    setGradeError(null);

    const answersById: Record<string, number | string> = {};
    quizQuestions.forEach((q, idx) => {
      const selected = selectedAnswers[idx];
      if (typeof selected === 'number' || (typeof selected === 'string' && selected.trim().length > 0)) {
        answersById[q.id] = selected;
      }
    });

    try {
      const res = await fetch('/api/quiz/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizToken, answers: answersById }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGradeError(data.error || 'Could not grade this quiz. Load a new one and try again.');
        return;
      }
      setQuizGrade(data);
      setIsQuizSubmitted(true);
    } catch {
      setGradeError('Could not reach the server to grade this quiz. Check your connection.');
    } finally {
      setIsGrading(false);
    }
  };

  const gradeFor = (questionId: string): GradedQuestion | undefined =>
    quizGrade?.results.find((r) => r.questionId === questionId);

  const answeredCount = Object.values(selectedAnswers).filter(
    (v) => typeof v === 'number' || (typeof v === 'string' && v.trim().length > 0)
  ).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Subject + chapter pickers */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-wrap gap-4">
        <SelectField id="quiz-subject" label="Subject" value={selectedSubject} onChange={setSelectedSubject} className="flex-1 min-w-[180px]">
          {enrolledSubjects.map((s) => (
            <option key={s} value={s}>
              {SUBJECT_LABELS[s] || s}
            </option>
          ))}
        </SelectField>

        {!chaptersLoading && chapters.length > 0 && (
          <SelectField
            id="quiz-chapter"
            label="Chapter"
            value={selectedChapter !== null ? String(selectedChapter) : ''}
            onChange={(v) => setSelectedChapter(Number(v))}
            className="flex-1 min-w-[180px]"
          >
            {chapters.map((c) => (
              <option key={c.chapterNo} value={c.chapterNo}>
                Ch {c.chapterNo}{c.chapterTitle ? `: ${c.chapterTitle}` : ''}
              </option>
            ))}
          </SelectField>
        )}
      </div>

      {/* Generate button */}
      {!chaptersLoading && selectedChapter !== null && chapters.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-navy">
              {board} Class {classLevel} {SUBJECT_LABELS[selectedSubject] || selectedSubject} — Chapter {selectedChapter}
            </h3>
            <p className="text-xs text-text-2">
              {QUIZ_SCOPE_DESCRIPTION}, grounded in the ingested textbook — a fresh quiz every time.
            </p>
          </div>
          <button
            type="button"
            onClick={generateQuiz}
            disabled={quizLoading}
            className="flex items-center gap-2 px-5 py-2 bg-brand hover:bg-brand-dark disabled:bg-disabled disabled:text-disabled-text text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {quizLoading ? 'Generating…' : hasGenerated ? 'Regenerate Quiz' : 'Generate Quiz'}
          </button>
        </div>
      )}

      {isPartial && !quizLoading && quizQuestions.length > 0 && (
        <div className="text-xs text-navy bg-quiz-light border border-quiz-border rounded-lg px-3.5 py-2.5">
          This chapter doesn't have enough ingested content yet for the full quiz size
          {effectiveCounts && (
            <> — generated {effectiveCounts.mcq} MCQs, {effectiveCounts.short} short-answer and {effectiveCounts.long} long-answer questions instead.</>
          )}
        </div>
      )}

      {/* States: loading chapters, no chapters ingested, not yet generated, loading quiz, quiz error, or the quiz itself */}
      {chaptersLoading ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-brand animate-spin mx-auto" />
          <div className="text-sm text-navy-2">Checking what's been ingested for this subject...</div>
        </div>
      ) : chapters.length === 0 ? (
        <EmptyState
          icon={FileQuestion}
          title="Nothing ingested yet"
          message={`No content has been ingested for ${board} Class ${classLevel} ${SUBJECT_LABELS[selectedSubject] || selectedSubject} yet — quizzes can only be generated from chapters that are actually in the syllabus database.`}
        />
      ) : quizLoading ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-brand animate-spin mx-auto" />
          <div className="text-sm text-navy-2">
            Generating a fresh chapter quiz — this can take a little longer for larger quizzes...
          </div>
        </div>
      ) : quizError ? (
        <EmptyState icon={FileQuestion} title="Quiz unavailable" message={quizError} />
      ) : !hasGenerated ? (
        <EmptyState
          icon={Sparkles}
          title="Ready when you are"
          message="Pick a subject and chapter, then generate a quiz."
        />
      ) : (
        <div className="space-y-4">
          {quizQuestions.map((q, qIdx) => {
            const selectedOpt = selectedAnswers[qIdx];
            const graded = gradeFor(q.id);
            const isCorrect = graded?.correct ?? false;

            return (
              <div key={q.id || qIdx} className="bg-surface border border-border rounded-xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-surface-2 text-brand border border-border-strong">
                      Q{qIdx + 1}
                    </span>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-navy">{q.stem}</h4>
                      {q.questionType !== 'mcq' && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-2">
                          {q.questionType === 'short' ? 'Short answer' : 'Long answer'} · {q.maxScore ?? 1} marks
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] text-text-2 bg-surface-2 px-2 py-0.5 rounded border border-border flex-shrink-0">
                    p. {q.page}
                  </span>
                </div>

                {q.questionType === 'mcq' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {(q.options || []).map((opt, oIdx) => {
                      let optStyle = 'bg-surface-2 border-border text-navy-2 hover:border-border-strong';

                      if (graded) {
                        if (oIdx === graded.correctIndex) {
                          optStyle = 'bg-brand-light border-brand text-brand-dark font-semibold';
                        } else if (selectedOpt === oIdx && !isCorrect) {
                          optStyle = 'bg-error-bg border-error text-error';
                        }
                      } else if (selectedOpt === oIdx) {
                        optStyle = 'bg-brand-mint border-brand text-brand-dark';
                      }

                      return (
                        <button
                          key={oIdx}
                          type="button"
                          disabled={isQuizSubmitted}
                          onClick={() => setSelectedAnswers((prev) => ({ ...prev, [qIdx]: oIdx }))}
                          className={`p-3 rounded-lg border text-xs text-left transition flex items-center justify-between ${optStyle}`}
                        >
                          <span>{opt}</span>
                          {graded && oIdx === graded.correctIndex && (
                            <CheckCircle2 className="w-4 h-4 text-brand" />
                          )}
                          {graded && selectedOpt === oIdx && !isCorrect && (
                            <XCircle className="w-4 h-4 text-error" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <textarea
                    value={typeof selectedOpt === 'string' ? selectedOpt : ''}
                    onChange={(e) => setSelectedAnswers((prev) => ({ ...prev, [qIdx]: e.target.value }))}
                    disabled={isQuizSubmitted}
                    rows={q.questionType === 'long' ? 6 : 3}
                    placeholder="Type your answer here..."
                    className="w-full p-3 rounded-lg border border-border bg-surface-2 text-xs text-navy disabled:opacity-70 focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                )}

                {graded && q.questionType === 'mcq' && (
                  <div className="bg-surface-2 p-3 rounded-lg border border-border text-xs space-y-1">
                    <div className="font-semibold text-brand flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Textbook Explanation ({q.section}):</span>
                    </div>
                    <p className="text-navy-2">{graded.explanation}</p>
                  </div>
                )}

                {graded && q.questionType !== 'mcq' && (
                  <div className="bg-surface-2 p-3 rounded-lg border border-border text-xs space-y-1">
                    <div className="font-semibold text-brand flex items-center justify-between gap-1.5">
                      <span className="flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5" />
                        Feedback ({q.section}):
                      </span>
                      <span className="text-navy font-mono">
                        {graded.pointsAwarded ?? 0} / {graded.pointsPossible ?? q.maxScore ?? 1} marks
                      </span>
                    </div>
                    <p className="text-navy-2">{graded.feedback}</p>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex flex-col gap-3 bg-surface border border-border p-4 rounded-xl">
            {gradeError && (
              <div className="text-xs text-navy bg-quiz-light border border-quiz-border rounded-lg px-3 py-2">
                {gradeError}
              </div>
            )}
            {!isQuizSubmitted ? (
              <button
                type="button"
                onClick={submitQuiz}
                disabled={answeredCount === 0 || isGrading}
                className="px-6 py-2 bg-brand hover:bg-brand-dark disabled:bg-disabled disabled:text-disabled-text text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer self-start"
              >
                {isGrading
                  ? 'Grading…'
                  : `Submit & Grade Quiz (${answeredCount}/${quizQuestions.length} answered)`}
              </button>
            ) : (
              <div className="flex items-center justify-between w-full">
                <div className="text-sm font-semibold">
                  Score:{' '}
                  <span className="text-brand">
                    {quizGrade?.score ?? 0} / {quizGrade?.total ?? quizQuestions.length} passed
                  </span>
                </div>
                <button
                  type="button"
                  onClick={generateQuiz}
                  className="px-4 py-2 bg-surface-2 hover:bg-border text-navy-2 text-xs font-medium rounded-lg transition"
                >
                  Retake Quiz
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
