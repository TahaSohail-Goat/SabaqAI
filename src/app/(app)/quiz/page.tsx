'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { RefreshCw, CheckCircle2, XCircle, BookOpen, FileQuestion, Sparkles, History, ArrowDown, X } from 'lucide-react';
import { useScope } from '@/components/app/ScopeContext';
import EmptyState from '@/components/app/EmptyState';
import SelectField from '@/components/app/SelectField';
import QuizResultsSummary from '@/components/app/QuizResultsSummary';
import { SUBJECT_LABELS } from '@/lib/subjects';
import { loadPageProgress, savePageProgress, clearPageProgress } from '@/lib/persist/page-progress';
import { getQuizDraft, saveQuizDraftAnswers, deleteQuizDraft } from '@/lib/quiz/drafts-api';
import { summarizeAttempt, type AttemptItem } from '@/lib/quiz/feedback';

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

const PROGRESS_KEY = 'quiz';

interface QuizProgress {
  selectedSubject: string;
  selectedChapter: number | null;
  quizQuestions: QuizQuestion[];
  hasGenerated: boolean;
  isPartial: boolean;
  effectiveCounts: { mcq: number; short: number; long: number } | null;
  selectedAnswers: Record<number, number | string>;
  isQuizSubmitted: boolean;
  quizToken: string | null;
  quizGrade: QuizGrade | null;
  /** ms — when the quiz was generated, for the draft-registry staleness hint. Absent on
   *  progress saved before this field existed. */
  generatedAt?: number | null;
}

function QuizPageInner() {
  const { board, classLevel, subject: scopeSubject, profile, user } = useScope();
  // A student is enrolled in every seeded subject by default (see create-account.ts) — filter
  // to just those so this doesn't offer subjects with no reason to appear here.
  const enrolledSubjects = profile?.subjects?.length ? profile.subjects : [scopeSubject];

  // The Revision Planner links here with ?subject=&chapterNo= for its "Practice quiz" action —
  // pre-select that scope when present and valid, instead of always defaulting to the current
  // scope subject / the first ingested chapter.
  const searchParams = useSearchParams();
  const linkedSubject = searchParams.get('subject');
  const linkedChapterNo = searchParams.get('chapterNo') ? Number(searchParams.get('chapterNo')) : null;
  // A full deep link (both subject and chapter) is an explicit "take me here" — it should win
  // over restoring whatever quiz was saved from a previous, unrelated visit to this page, not
  // get silently overridden by it.
  const arrivedViaLink = linkedSubject !== null && linkedChapterNo !== null;
  // The history / plan pages' "Resume" button links here with ?draft=<id> (plus the same
  // ?subject=&chapterNo= so selectedSubject initialises right) to reopen one specific parked,
  // un-submitted quiz from the server (src/lib/quiz/drafts-api.ts). Loaded async in the
  // deep-link effect below, so like arrivedViaLink it pre-settles the restore path.
  const draftParam = searchParams.get('draft');
  const arrivedViaDraft = draftParam !== null;
  const isDeepLink = arrivedViaLink || arrivedViaDraft;

  // Scoped by account + board/class only — not the page-local selectedSubject state below,
  // since that's exactly the field the restore effect corrects, and part of what's saved.
  // Scoping by account also means a shared device never surfaces one student's ungraded quiz
  // for whoever's signed in next; logout also clears this key outright (see
  // Sidebar/IdleLogoutWatcher).
  const progressScope = `${user?.id ?? 'anon'}|${board}|${classLevel}`;

  // Every one of these starts at the same pristine defaults the page always had — deliberately
  // NOT read from localStorage here. This component is server-rendered before it's hydrated,
  // and a lazy useState initializer that reads localStorage runs on the client only, so it
  // would return different content than the server-rendered HTML on the very first client
  // render — a hydration mismatch. Restoring happens in the effect below instead, which (like
  // ScopeContext's own localStorage restore) only ever runs client-side, after hydration.
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
  // When the current quiz was generated — carried into the draft registry so the history page
  // can flag a quiz whose grading token has aged past its 2h TTL.
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);

  // Tracks the last scope (subject+board+class) this effect actually ran for, to tell "the
  // student really changed subject" apart from "React re-invoked this same mount's effect a
  // second time" — which React's Strict Mode does deliberately, once, in dev only. A run-count
  // ref gets this wrong: it survives the double-invoke, so the second call would look like a
  // genuine later change and wrongly wipe out what the first call just restored. Comparing
  // scope-to-scope instead is idempotent — both StrictMode calls see the identical scope key,
  // so only an actual change triggers the reset below.
  const lastScopeRef = useRef<string | null>(null);
  // Whether this component instance has ever finished attempting a one-time restore (found a
  // match and applied it, or confirmed there was nothing to restore). Stays false across a
  // subject *correction* below — that's not a completed attempt, it's this same attempt
  // continuing on the next render once selectedSubject actually matches what was saved.
  // Starts pre-settled (skips the restore branch entirely) when a full Practice Quiz deep link
  // brought us here — see arrivedViaLink above. Otherwise starts false, same as always.
  const hasRestoredRef = useRef(isDeepLink);
  // A STATE mirror of hasRestoredRef's final value, purely to gate the persist effect further
  // down. It has to be state, not the ref: the persist effect needs to know, from its OWN
  // render's closure, whether that render's quizQuestions/etc are pre- or post-restore. Reading
  // the ref there wouldn't help — by the time the ref flips true (inside the effect below), the
  // *state* values that same effect just restored haven't landed in any closure yet; they only
  // become visible together, in the next render, once React applies that batch. Until then, the
  // persist effect must not write at all — otherwise it saves this render's still-blank values
  // over whatever the restore is about to bring back (a real bug this caught: restoring a saved
  // quiz needs a subject correction first, which takes an extra render — the persist effect's
  // one intervening write, using that render's pre-correction blanks, silently destroyed the
  // saved attempt before the corrected render ever got to read it).
  const [restoreSettled, setRestoreSettled] = useState(isDeepLink);
  // The server draft id backing the current in-progress quiz (from /api/quiz on generate, or
  // from getQuizDraft on resume). Autosave PATCHes answers to it; submit/start-over delete it.
  const [serverDraftId, setServerDraftId] = useState<string | null>(null);

  // A quiz was restored from a previous visit and is still unsubmitted — drives the visible
  // "Resume" banner. The quiz state itself is already restored silently by the effect below;
  // this is only the affordance that tells the student it happened and lets them jump to where
  // they left off or start over.
  const [resumedInProgress, setResumedInProgress] = useState(false);
  const [resumeDismissed, setResumeDismissed] = useState(false);

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
    setResumedInProgress(false);
    setResumeDismissed(false);
    setServerDraftId(null);
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
      setGeneratedAt(Date.now());
      setServerDraftId(data.draftId ?? null);
    } catch (err) {
      console.error('Quiz generation error:', err);
      setQuizError('Could not reach the server. Check your connection and try again.');
    } finally {
      setQuizLoading(false);
    }
  };

  // Which chapters actually have ingested content for the selected subject — driven by the
  // real corpus, not a hardcoded chapter list that could claim coverage the corpus doesn't have.
  // Also where a saved quiz attempt gets restored, on this component instance's first run only.
  useEffect(() => {
    let cancelled = false;
    setChaptersLoading(true);
    setChapters([]);

    const scopeKey = `${selectedSubject}|${board}|${classLevel}`;
    const isRealScopeChange = lastScopeRef.current !== null && lastScopeRef.current !== scopeKey;
    lastScopeRef.current = scopeKey;

    let restored: QuizProgress | null = null;
    if (!hasRestoredRef.current) {
      // The single "your last quiz on this page" entry (page-progress). A ?draft= deep link
      // pre-settles hasRestoredRef so this branch is skipped entirely — that quiz is loaded
      // from the server in the deep-link effect below.
      const saved = loadPageProgress<QuizProgress>(PROGRESS_KEY, progressScope);
      if (!saved) {
        // Nothing to restore, ever — stop checking on every future run, and let the persist
        // effect start writing (see restoreSettled's own comment above).
        hasRestoredRef.current = true;
        setRestoreSettled(true);
      } else if (saved.selectedSubject !== selectedSubject) {
        // A saved attempt exists, but for a different subject than this render currently has.
        // Correct it — this effect will run again once selectedSubject actually updates to
        // match, and will restore then. Deliberately doesn't mark restoration "done" yet, and
        // doesn't settle restoreSettled either — the persist effect must stay silent through
        // this correction, or it would save this render's still-blank quiz state and destroy
        // the very thing about to be restored.
        setSelectedSubject(saved.selectedSubject);
      } else {
        // Now on the matching subject (either it was the current one all along, or a prior
        // run of this same effect just corrected it) — restore, once, for this instance.
        hasRestoredRef.current = true;
        restored = saved;
        setSelectedChapter(saved.selectedChapter);
        setQuizQuestions(saved.quizQuestions);
        setHasGenerated(saved.hasGenerated);
        setIsPartial(saved.isPartial);
        setEffectiveCounts(saved.effectiveCounts);
        setSelectedAnswers(saved.selectedAnswers);
        setIsQuizSubmitted(saved.isQuizSubmitted);
        setQuizToken(saved.quizToken);
        setQuizGrade(saved.quizGrade);
        setGeneratedAt(saved.generatedAt ?? null);
        setRestoreSettled(true);
        if (saved.hasGenerated && !saved.isQuizSubmitted && saved.quizQuestions.length > 0) {
          setResumedInProgress(true);
        }
      }
    } else if (isRealScopeChange) {
      setSelectedChapter(null);
      setQuizQuestions([]);
      setHasGenerated(false);
      setIsPartial(false);
      setEffectiveCounts(null);
      setSelectedAnswers({});
      setIsQuizSubmitted(false);
      setQuizToken(null);
      setQuizGrade(null);
      setGeneratedAt(null);
      setResumedInProgress(false);
      setResumeDismissed(false);
    }

    const params = new URLSearchParams({ board, classLevel: String(classLevel), subject: selectedSubject });
    fetch(`/api/quiz/scope?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const chs: Chapter[] = data.chapters || [];
        setChapters(chs);
        // Only honor the linked chapter while still on the subject the link pointed at — if
        // the student manually switches subjects afterward, fall back to the normal
        // restore/default logic rather than reapplying a chapter number that belonged to a
        // different subject.
        const linked =
          selectedSubject === linkedSubject &&
          linkedChapterNo !== null &&
          chs.some((c) => c.chapterNo === linkedChapterNo);
        if (linked) {
          setSelectedChapter(linkedChapterNo);
        } else {
          // A restored chapter that's still real just stays selected (with its question/answers
          // already restored above) — only fall back to chs[0] when there's nothing to restore,
          // or the student genuinely picked a different subject.
          const keepRestored = restored && chs.some((c) => c.chapterNo === restored!.selectedChapter);
          if (!keepRestored) {
            setSelectedChapter(chs.length > 0 ? chs[0].chapterNo : null);
          }
        }
      })
      .catch((err) => console.error('Quiz scope (chapters) load error:', err))
      .finally(() => {
        if (!cancelled) setChaptersLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `progressScope` is only read
    // inside the `!hasRestoredRef.current` branch, which by construction only ever runs
    // before that ref flips true; it doesn't need to be reactive here.
  }, [selectedSubject, board, classLevel, linkedSubject, linkedChapterNo, draftParam]);

  // Persists the in-progress quiz attempt so a refresh or navigating away and back restores
  // it — see src/lib/persist/page-progress.ts. Excludes `quizLoading`/`quizError`/`gradeError`/
  // `isGrading`: transient in-flight/failure states that shouldn't still be true on reload.
  // Stays silent until restoreSettled — see that state's own comment for why writing any
  // earlier would corrupt a save still being restored.
  useEffect(() => {
    if (!restoreSettled) return;
    savePageProgress<QuizProgress>(PROGRESS_KEY, progressScope, {
      selectedSubject,
      selectedChapter,
      quizQuestions,
      hasGenerated,
      isPartial,
      effectiveCounts,
      selectedAnswers,
      isQuizSubmitted,
      quizToken,
      quizGrade,
      generatedAt,
    });
  }, [
    restoreSettled,
    progressScope,
    selectedSubject,
    selectedChapter,
    quizQuestions,
    hasGenerated,
    isPartial,
    effectiveCounts,
    selectedAnswers,
    isQuizSubmitted,
    quizToken,
    quizGrade,
    generatedAt,
  ]);

  // Debounced autosave of partial answers to the server draft (quiz_drafts) so an un-submitted
  // quiz can be resumed after logout or on another device. The draft row itself is created by
  // /api/quiz on generation (or already exists when resumed) — this only syncs the answers.
  useEffect(() => {
    if (!serverDraftId || isQuizSubmitted || !hasGenerated) return;
    const t = setTimeout(() => {
      saveQuizDraftAnswers(serverDraftId, selectedAnswers);
    }, 1500);
    return () => clearTimeout(t);
  }, [serverDraftId, isQuizSubmitted, hasGenerated, selectedAnswers]);

  // Deep-link entry, one-shot:
  //   ?draft=<id>          → load that specific parked quiz from the server and resume it.
  //   ?subject=&chapterNo= → the Revision Planner's "Practice quiz" — generate now, instead of
  //                          leaving the student on a Generate button.
  const didAutoActOnLinkRef = useRef(false);
  useEffect(() => {
    if (!isDeepLink || didAutoActOnLinkRef.current) return;
    if (chaptersLoading || quizLoading || hasGenerated) return;
    // For a plain (no-draft) link, wait until the linked scope has actually resolved.
    if (!arrivedViaDraft && (selectedSubject !== linkedSubject || selectedChapter !== linkedChapterNo)) return;

    didAutoActOnLinkRef.current = true;

    if (arrivedViaDraft && draftParam) {
      let cancelled = false;
      getQuizDraft(draftParam).then((d) => {
        if (cancelled) return;
        if (!d) {
          // Draft gone (submitted elsewhere / discarded) — fall back to a normal fresh page.
          setRestoreSettled(true);
          return;
        }
        setSelectedSubject(d.subject);
        setSelectedChapter(d.chapterNo);
        setQuizQuestions(d.questions as QuizQuestion[]);
        setSelectedAnswers(d.answers as Record<number, number | string>);
        setQuizToken(d.quizToken);
        setIsPartial(d.isPartial);
        setEffectiveCounts(d.effectiveCounts);
        setGeneratedAt(new Date(d.generatedAt).getTime());
        setServerDraftId(d.id);
        setHasGenerated(true);
        setResumedInProgress(true);
      });
      return () => {
        cancelled = true;
      };
    }

    generateQuiz();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generateQuiz is stable enough for
    // this one-shot guarded call; re-running on its identity would defeat didAutoActOnLinkRef.
  }, [isDeepLink, arrivedViaDraft, draftParam, chaptersLoading, quizLoading, hasGenerated, selectedSubject, selectedChapter, linkedSubject, linkedChapterNo]);

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
        body: JSON.stringify({ quizToken, answers: answersById, draftId: serverDraftId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGradeError(data.error || 'Could not grade this quiz. Load a new one and try again.');
        return;
      }
      setQuizGrade(data);
      setIsQuizSubmitted(true);
      // The grade route deleted the parked draft (it's a completed attempt now) — stop autosave.
      setServerDraftId(null);
    } catch {
      setGradeError('Could not reach the server to grade this quiz. Check your connection.');
    } finally {
      setIsGrading(false);
    }
  };

  const gradeFor = (questionId: string): GradedQuestion | undefined =>
    quizGrade?.results.find((r) => r.questionId === questionId);

  const isAnswered = (v: number | string | undefined) =>
    typeof v === 'number' || (typeof v === 'string' && v.trim().length > 0);

  const answeredCount = Object.values(selectedAnswers).filter(isAnswered).length;

  // Attempt-level roll-up, computed the same way the history detail route does it (via the
  // shared summarizeAttempt helper) — shown above the graded questions after submitting.
  const attemptSummary = useMemo(() => {
    if (!isQuizSubmitted || !quizGrade) return null;
    const items: AttemptItem[] = quizQuestions.map((q) => {
      const g = quizGrade.results.find((r) => r.questionId === q.id);
      const pointsPossible = g?.pointsPossible ?? (q.questionType === 'mcq' ? 1 : q.maxScore ?? 1);
      return {
        questionType: q.questionType,
        section: q.section || null,
        page: q.page || null,
        correct: g?.correct ?? false,
        pointsAwarded: g?.pointsAwarded ?? 0,
        pointsPossible,
        answered: (g?.selectedIndex ?? null) !== null || !!(g?.answerText && g.answerText.trim()),
      };
    });
    return summarizeAttempt(items);
  }, [isQuizSubmitted, quizGrade, quizQuestions]);

  const firstUnansweredIdx = quizQuestions.findIndex((_q, idx) => !isAnswered(selectedAnswers[idx]));

  const jumpToUnanswered = () => {
    const idx = firstUnansweredIdx === -1 ? 0 : firstUnansweredIdx;
    document.getElementById(`quiz-q-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const startOver = () => {
    clearPageProgress(PROGRESS_KEY);
    if (serverDraftId) deleteQuizDraft(serverDraftId);
    setServerDraftId(null);
    setQuizQuestions([]);
    setGeneratedAt(null);
    setHasGenerated(false);
    setIsPartial(false);
    setEffectiveCounts(null);
    setSelectedAnswers({});
    setIsQuizSubmitted(false);
    setQuizToken(null);
    setQuizGrade(null);
    setQuizError(null);
    setGradeError(null);
    setResumedInProgress(false);
    setResumeDismissed(false);
  };

  const showResumeBanner =
    resumedInProgress && !resumeDismissed && !isQuizSubmitted && hasGenerated && quizQuestions.length > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Toolbar — history lives on its own page, reachable only from here (not the sidebar) */}
      <div className="flex justify-end">
        <Link
          href="/quiz/history"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 hover:bg-border text-navy-2 text-xs font-semibold rounded-lg transition"
        >
          <History className="w-3.5 h-3.5" />
          Quiz history
        </Link>
      </div>

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
              {board} Class {classLevel} {SUBJECT_LABELS[selectedSubject] || selectedSubject} · Chapter {selectedChapter}
            </h3>
            <p className="text-xs text-text-2">
              {QUIZ_SCOPE_DESCRIPTION}, grounded in your textbook. A fresh quiz every time.
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
          This chapter doesn't have enough content yet for the full quiz size
          {effectiveCounts && (
            <>, so we generated {effectiveCounts.mcq} MCQs, {effectiveCounts.short} short-answer and {effectiveCounts.long} long-answer questions instead.</>
          )}
        </div>
      )}

      {showResumeBanner && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-quiz-light border border-quiz-border rounded-lg px-4 py-3">
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-4 h-4 text-quiz shrink-0" />
            <div>
              <p className="text-xs font-semibold text-navy">Picked up your last quiz</p>
              <p className="text-[11px] text-text-2">
                {answeredCount}/{quizQuestions.length} answered. Carry on where you left off.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {firstUnansweredIdx !== -1 && (
              <button
                type="button"
                onClick={jumpToUnanswered}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand hover:bg-brand-dark text-white text-xs font-semibold rounded-lg transition"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                Jump to where you left off
              </button>
            )}
            <button
              type="button"
              onClick={startOver}
              className="px-3 py-1.5 bg-surface-2 hover:bg-border text-navy-2 text-xs font-medium rounded-lg transition"
            >
              Start over
            </button>
            <button
              type="button"
              onClick={() => setResumeDismissed(true)}
              title="Dismiss"
              className="p-1.5 rounded-lg text-text-2 hover:bg-surface-hover hover:text-navy transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* States: loading chapters, no chapters ingested, not yet generated, loading quiz, quiz error, or the quiz itself */}
      {chaptersLoading ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-brand animate-spin mx-auto" />
          <div className="text-sm text-navy-2">Checking what's available for this subject...</div>
        </div>
      ) : chapters.length === 0 ? (
        <EmptyState
          icon={FileQuestion}
          title="Nothing added yet"
          message={`No content is available yet for ${board} Class ${classLevel} ${SUBJECT_LABELS[selectedSubject] || selectedSubject}. Quizzes can only be generated from chapters that are actually in the syllabus.`}
        />
      ) : quizLoading ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-brand animate-spin mx-auto" />
          <div className="text-sm text-navy-2">
            Generating a fresh chapter quiz. This can take a little longer for larger quizzes...
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
          {attemptSummary && <QuizResultsSummary summary={attemptSummary} />}

          {quizQuestions.map((q, qIdx) => {
            const selectedOpt = selectedAnswers[qIdx];
            const graded = gradeFor(q.id);
            const isCorrect = graded?.correct ?? false;

            return (
              <div key={q.id || qIdx} id={`quiz-q-${qIdx}`} className="bg-surface border border-border rounded-xl p-5 space-y-4 scroll-mt-20">
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
