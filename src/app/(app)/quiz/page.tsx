'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw, CheckCircle2, XCircle, BookOpen, FileQuestion } from 'lucide-react';
import { useScope } from '@/components/app/ScopeContext';
import EmptyState from '@/components/app/EmptyState';
import { SUBJECT_LABELS } from '@/lib/subjects';

interface QuizQuestion {
  id: string;
  position: number;
  stem: string;
  options: string[];
  chunkId: string;
  chapterNo: number;
  page: number;
  section: string;
}

interface GradedQuestion {
  questionId: string;
  selectedIndex: number | null;
  correctIndex: number;
  correct: boolean;
  explanation: string;
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

export default function QuizPage() {
  const { board, classLevel, subject: scopeSubject, profile } = useScope();
  // A student is enrolled in every seeded subject by default (see create-account.ts) — filter
  // to just those so this doesn't offer subjects with no reason to appear here.
  const enrolledSubjects = profile?.subjects?.length ? profile.subjects : [scopeSubject];

  const [selectedSubject, setSelectedSubject] = useState(scopeSubject);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(true);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);

  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [isQuizSubmitted, setIsQuizSubmitted] = useState(false);
  const [answerToken, setAnswerToken] = useState<string | null>(null);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [quizGrade, setQuizGrade] = useState<QuizGrade | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [isGrading, setIsGrading] = useState(false);

  const loadQuiz = async (chapterNo: number, subject: string) => {
    setQuizLoading(true);
    setQuizError(null);
    setIsFallback(false);
    setSelectedAnswers({});
    setIsQuizSubmitted(false);
    setQuizGrade(null);
    setGradeError(null);
    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterNo, subject, board, classLevel }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQuizError(data.error || 'Could not load a quiz for this chapter.');
        setQuizQuestions([]);
        setAnswerToken(null);
        setQuizId(null);
        return;
      }
      setQuizQuestions(data.questions || []);
      setAnswerToken(data.answerToken ?? null);
      setQuizId(data.quizId ?? null);
      setIsFallback(!!data.isFallback);
    } catch (err) {
      console.error('Quiz load error:', err);
      setQuizError('Could not reach the server. Check your connection and try again.');
    } finally {
      setQuizLoading(false);
    }
  };

  // Which chapters actually have ingested content for the selected subject — driven by the real
  // corpus (same endpoint /syllabus uses), not a hardcoded chapter list that could claim
  // coverage the corpus doesn't have.
  useEffect(() => {
    let cancelled = false;
    setChaptersLoading(true);
    setChapters([]);
    setSelectedChapter(null);
    setQuizQuestions([]);

    const params = new URLSearchParams({ board, classLevel: String(classLevel), subject: selectedSubject });
    fetch(`/api/syllabus?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const chs: Chapter[] = data.chapters || [];
        setChapters(chs);
        if (chs.length > 0) {
          setSelectedChapter(chs[0].chapterNo);
          loadQuiz(chs[0].chapterNo, selectedSubject);
        }
      })
      .catch((err) => console.error('Syllabus chapters load error:', err))
      .finally(() => {
        if (!cancelled) setChaptersLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubject, board, classLevel]);

  // Grading happens on the server — the browser never held the answer key. quizId (a real,
  // persisted quiz) is preferred when present; answerToken is the fallback for when this quiz
  // couldn't be persisted (see /api/quiz's respondWithQuiz).
  const submitQuiz = async () => {
    if ((!answerToken && !quizId) || isGrading) return;
    setIsGrading(true);
    setGradeError(null);

    const answersById: Record<string, number> = {};
    quizQuestions.forEach((q, idx) => {
      const selected = selectedAnswers[idx];
      if (typeof selected === 'number') answersById[q.id] = selected;
    });

    try {
      const res = await fetch('/api/quiz/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId, answerToken, answers: answersById }),
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Subject filter */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-text-2 uppercase tracking-wide">Subject</p>
        <div className="flex flex-wrap gap-2">
          {enrolledSubjects.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSelectedSubject(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                selectedSubject === s
                  ? 'bg-brand text-white border-brand'
                  : 'bg-surface-2 text-navy-2 border-border-strong hover:bg-border'
              }`}
            >
              {SUBJECT_LABELS[s] || s}
            </button>
          ))}
        </div>
      </div>

      {/* Chapter selection */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-navy">
            {board} Class {classLevel} {SUBJECT_LABELS[selectedSubject] || selectedSubject} Chapter Quizzes
          </h3>
          <p className="text-xs text-text-2">Board-pattern multiple choice questions grounded in textbook chunks</p>
        </div>

        {!chaptersLoading && chapters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {chapters.map((c) => (
              <button
                key={c.chapterNo}
                type="button"
                onClick={() => {
                  setSelectedChapter(c.chapterNo);
                  loadQuiz(c.chapterNo, selectedSubject);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  selectedChapter === c.chapterNo
                    ? 'bg-brand text-white border-brand'
                    : 'bg-surface-2 text-navy-2 border-border-strong hover:bg-border'
                }`}
              >
                Ch {c.chapterNo}{c.chapterTitle ? `: ${c.chapterTitle}` : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      {isFallback && !quizLoading && quizQuestions.length > 0 && (
        <div className="text-xs text-navy bg-quiz-light border border-quiz-border rounded-lg px-3.5 py-2.5">
          Live generation was unavailable for this request — showing a fallback question bank instead of a freshly generated quiz.
        </div>
      )}

      {/* States: loading chapters, no chapters ingested, loading quiz, quiz error, or the quiz itself */}
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
          <div className="text-sm text-navy-2">Generating syllabus-verified quiz from Chapter {selectedChapter}...</div>
        </div>
      ) : quizError ? (
        <EmptyState icon={FileQuestion} title="Quiz unavailable" message={quizError} />
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
                    <h4 className="text-sm font-medium text-navy">{q.stem}</h4>
                  </div>
                  <span className="text-[11px] text-text-2 bg-surface-2 px-2 py-0.5 rounded border border-border flex-shrink-0">
                    p. {q.page}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {q.options.map((opt, oIdx) => {
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

                {graded && (
                  <div className="bg-surface-2 p-3 rounded-lg border border-border text-xs space-y-1">
                    <div className="font-semibold text-brand flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Textbook Explanation ({q.section}):</span>
                    </div>
                    <p className="text-navy-2">{graded.explanation}</p>
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
                disabled={Object.keys(selectedAnswers).length === 0 || isGrading}
                className="px-6 py-2 bg-brand hover:bg-brand-dark disabled:bg-disabled disabled:text-disabled-text text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer self-start"
              >
                {isGrading
                  ? 'Grading…'
                  : `Submit & Grade Quiz (${Object.keys(selectedAnswers).length}/${quizQuestions.length} answered)`}
              </button>
            ) : (
              <div className="flex items-center justify-between w-full">
                <div className="text-sm font-semibold">
                  Score:{' '}
                  <span className="text-brand">
                    {quizGrade?.score ?? 0} / {quizGrade?.total ?? quizQuestions.length} Correct
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => selectedChapter !== null && loadQuiz(selectedChapter, selectedSubject)}
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
