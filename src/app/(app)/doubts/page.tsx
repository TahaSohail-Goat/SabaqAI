'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  RefreshCw,
  ArrowRight,
  WifiOff,
} from 'lucide-react';
import type { AskResponse, Citation, AskOptionsResponse, AskSourceType, AskUnit } from '@/lib/types';
import { useScope } from '@/components/app/ScopeContext';
import AskSubjectSelector from '@/components/app/AskSubjectSelector';
import AskSourceSelector from '@/components/app/AskSourceSelector';
import AskUnitSelector from '@/components/app/AskUnitSelector';
import AskDocumentReader from '@/components/app/AskDocumentReader';
import AskResultView from '@/components/app/AskResultView';
import { askResponseSchema } from '@/lib/ask/contracts';
import { ASK_SOURCE_TYPES } from '@/lib/ask/source-meta';
import { loadPageProgress, savePageProgress } from '@/lib/persist/page-progress';

const EMPTY_SOURCES: AskOptionsResponse['sources'] = ASK_SOURCE_TYPES.map((sourceType) => ({ sourceType, units: [] }));

const PROGRESS_KEY = 'doubts';

interface DoubtsProgress {
  sourceType: AskSourceType | null;
  unit: AskUnit | null;
  query: string;
  askResult: AskResponse | null;
  selectedCitation: Citation | null;
}

// Transport/invalid-envelope errors are distinct from typed service errors and evidence refusals.
const CONNECTION_ERROR_MESSAGE = "Sabaq couldn't reach the server to answer that. Check your internet connection and try again.";

export default function DoubtsPage() {
  const { board, classLevel, subject, language, setSubject, profile, user } = useScope();
  const enrolledSubjects = profile?.subjects ?? [subject];
  // Includes the account id so a shared device never surfaces one student's in-progress
  // question for whoever's signed in next — logout also clears this key outright (see
  // Sidebar/IdleLogoutWatcher), this is the belt-and-suspenders half for the case where the
  // browser was just closed (ending the session per src/lib/auth/session-activity.ts) rather
  // than an explicit logout click.
  const scopeKey = `${user?.id ?? 'anon'}|${board}|${classLevel}|${subject}`;

  // These all start at the same empty defaults the page always had — deliberately NOT read
  // from localStorage here. This component is server-rendered before it's hydrated, and a
  // lazy useState initializer that reads localStorage runs on the client only, so it would
  // return different content than the server-rendered HTML on the very first client render —
  // a hydration mismatch. Restoring happens in the effect below instead, which (like
  // ScopeContext's own localStorage restore) only ever runs client-side, after hydration.
  const [sources, setSources] = useState(EMPTY_SOURCES);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState(false);
  const [sourceType, setSourceType] = useState<AskSourceType | null>(null);
  const [unit, setUnit] = useState<AskUnit | null>(null);

  const [query, setQuery] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [askResult, setAskResult] = useState<AskResponse | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  const submitLock = useRef(false);
  const languageRef = useRef(language);
  const cancelRequest = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    sequenceRef.current++;
    submitLock.current = false;
    setIsAsking(false);
  };
  useEffect(() => {
    cancelRequest();
    return () => { requestRef.current?.abort(); sequenceRef.current++; submitLock.current = false; };
    // Selection changes invalidate every older response, including clarification choices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, sourceType, unit?.chapterNo, language]);
  useEffect(() => {
    if (languageRef.current !== language) { setAskResult(null); setAskError(null); setSelectedCitation(null); }
    languageRef.current = language;
  }, [language]);

  // Tracks the last scope this effect actually ran for, to tell "the underlying scope really
  // changed" apart from "React re-invoked this same mount's effect a second time" — which
  // React's Strict Mode does deliberately, once, in dev only. A run-count ref (e.g. a boolean
  // flipped after the first run) gets this wrong: the ref survives the double-invoke, so the
  // second call would look like a genuine later change and wrongly wipe out what the first
  // call just restored. Comparing scope-to-scope instead is idempotent — both StrictMode calls
  // see the identical scopeKey, so only an actual student-driven change (a real prior scope
  // that differs from the current one) triggers the reset below.
  const lastScopeRef = useRef<string | null>(null);

  // Re-fetch (and reset the cascade) whenever the underlying scope changes — e.g. the
  // student switches subject in Settings while this page is already open. On the very first
  // run for this component instance, restore whatever was saved for this exact scope instead.
  useEffect(() => {
    let cancelled = false;
    setOptionsLoading(true);
    setOptionsError(false);

    const isInitialMount = lastScopeRef.current === null;
    const isRealScopeChange = !isInitialMount && lastScopeRef.current !== scopeKey;
    lastScopeRef.current = scopeKey;

    if (isInitialMount) {
      const restored = loadPageProgress<DoubtsProgress>(PROGRESS_KEY, scopeKey);
      if (restored) {
        setSourceType(restored.sourceType);
        setUnit(restored.unit);
        setQuery(restored.query);
        const valid = askResponseSchema.safeParse(restored.askResult);
        // Clarification contexts are short lived; re-enter through normal validation on reload.
        setAskResult(valid.success && valid.data.status !== 'needs_clarification' ? valid.data : null);
        setSelectedCitation(restored.selectedCitation);
      }
    } else if (isRealScopeChange) {
      setSourceType(null);
      setUnit(null);
      setAskResult(null);
      setSelectedCitation(null);
    }

    fetch(`/api/ask/options?board=${encodeURIComponent(board)}&classLevel=${classLevel}&subject=${encodeURIComponent(subject)}`)
      .then((res) => res.json())
      .then((data: AskOptionsResponse) => {
        if (!cancelled) setSources(data.sources);
      })
      .catch(() => {
        // A real connection failure, not "this subject has nothing ingested" (that case
        // still returns 200 with empty categories — see /api/ask/options). Worth telling
        // the student apart from an honest "nothing here yet", not just falling back silently.
        if (!cancelled) {
          setSources(EMPTY_SOURCES);
          setOptionsError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setOptionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scopeKey is derived from exactly
    // board/classLevel/subject/user.id; depending on it directly is equivalent and simpler.
  }, [scopeKey]);

  // Persists the in-progress question/answer so a refresh or navigating away and back to this
  // page restores it — see src/lib/persist/page-progress.ts. Deliberately excludes `isAsking`/
  // `askError`: those describe an in-flight request or a dropped connection, neither of which
  // should still be true after the page reloads.
  useEffect(() => {
    savePageProgress<DoubtsProgress>(PROGRESS_KEY, scopeKey, { sourceType, unit, query, askResult, selectedCitation });
  }, [scopeKey, sourceType, unit, query, askResult, selectedCitation]);

  const activeUnits = sourceType ? sources.find((s) => s.sourceType === sourceType)?.units ?? [] : [];
  // Saved progress contains an old unit snapshot. Use current Storage availability and
  // page offsets after options reload, so recovered PDFs do not stay stuck in OCR mode.
  const readerUnit = unit?.sourceId ? activeUnits.find((candidate) => candidate.sourceId === unit.sourceId) ?? null : null;
  const canAsk = Boolean(sourceType && readerUnit);

  const handleAsk = async (options?: { question?: string; clarification?: { context: string; optionId?: string; freeText?: string } }) => {
    const submittedQuestion = options?.question ?? query;
    if (!submittedQuestion.trim() || submitLock.current || !sourceType || !readerUnit?.sourceId) return;
    submitLock.current = true;
    const controller = new AbortController();
    requestRef.current = controller;
    const sequence = ++sequenceRef.current;

    setIsAsking(true);
    setAskResult(null);
    setAskError(null);
    setSelectedCitation(null);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          question: submittedQuestion,
          board,
          classLevel,
          subject,
          language,
          sourceType,
          chapterNo: readerUnit.chapterNo,
          sourceId: readerUnit.sourceId,
          clarification: options?.clarification,
        }),
      });
      const data = askResponseSchema.parse(await res.json());
      if (controller.signal.aborted || sequence !== sequenceRef.current) return;
      if (!res.ok && data.status !== 'error') throw new Error('Unexpected response.');
      setAskResult(data);
      if (data.status === 'answered' && data.citations.length > 0) {
        setSelectedCitation(data.citations[0]);
      }
    } catch (err) {
      if (controller.signal.aborted || sequence !== sequenceRef.current) return;
      // Do not surface raw transport/provider details or interpret an unknown status as success.
      console.error('Ask request could not be completed.');
      setAskError(CONNECTION_ERROR_MESSAGE);
    } finally {
      if (sequence === sequenceRef.current) { setIsAsking(false); submitLock.current = false; requestRef.current = null; }
    }
  };

  const placeholder = canAsk
    ? `Ask a question from ${unit!.chapterTitle ?? 'this selection'}…`
    : 'Choose a source and a chapter or paper above to start asking';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
      {/* Left: scope picker, input & result */}
      <div className="lg:col-span-6 space-y-6">
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-4">
          {optionsError && (
            <div className="flex items-center gap-2 rounded-xl bg-error-bg text-error text-xs font-medium px-3 py-2">
              <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Couldn&apos;t load your chapters and papers. Check your connection and reload the page.</span>
            </div>
          )}
          <AskSubjectSelector value={subject} subjects={enrolledSubjects} onChange={(next) => { cancelRequest(); setAskResult(null); setSubject(next); }} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AskSourceSelector
              value={sourceType}
              sources={sources}
              loading={optionsLoading}
              onChange={(t) => {
                cancelRequest();
                setSourceType(t);
                setUnit(null);
                setAskResult(null);
                setAskError(null);
                // Otherwise a citation from the PREVIOUS chapter's PDF stays "active" and gets
                // re-applied against the newly selected chapter's page offset once its own PDF
                // loads — pageFrom re-basing on a citation that doesn't belong to this chapter
                // produces a nonsense local page number (e.g. "129 / 10").
                setSelectedCitation(null);
              }}
            />
            {sourceType ? (
              <AskUnitSelector
                sourceType={sourceType}
                units={activeUnits}
                value={unit}
                onChange={(u) => {
                  cancelRequest();
                  setUnit(u);
                  setAskResult(null);
                  setAskError(null);
                  setSelectedCitation(null);
                }}
              />
            ) : (
              <div className="flex items-center px-4 py-3 rounded-xl border border-dashed border-border text-[13px] text-text-3">
                Choose a source first
              </div>
            )}
          </div>

          <div className="relative">
            <textarea
              id="question-input"
              rows={3}
              value={query}
              onChange={(e) => { cancelRequest(); setQuery(e.target.value); setAskResult(null); setAskError(null); setSelectedCitation(null); }}
              maxLength={1600}
              aria-label="Your textbook question"
              dir="auto"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAsk();
                }
              }}
              disabled={!canAsk}
              placeholder={placeholder}
              className="w-full bg-surface-2 border border-border rounded-xl p-4 pr-28 text-sm text-navy placeholder:text-text-3 focus:outline-none focus:border-brand/50 focus:bg-surface disabled:opacity-60 disabled:cursor-not-allowed transition-colors resize-none"
            />
            <button
              type="button"
              id="submit-ask-btn"
              onClick={() => handleAsk()}
              disabled={isAsking || !query.trim() || !canAsk}
              className="absolute right-3 bottom-3.5 px-5 py-2 bg-brand hover:bg-brand-dark disabled:bg-disabled disabled:text-disabled-text text-white text-xs font-bold rounded-lg transition-colors active:scale-[0.97] flex items-center gap-2"
            >
              {isAsking ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Working</span>
                </>
              ) : (
                <>
                  <span>Ask Sabaq</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Loading state */}
        {isAsking && (
          <div className="bg-surface border border-border rounded-2xl p-8 text-center space-y-3">
            <div className="flex justify-center">
              <div className="w-8 h-8 rounded-full border-2 border-brand/20 border-t-brand animate-spin" />
            </div>
            <div className="text-xs text-text-2">Working on your question using the selected {unit?.chapterTitle ?? 'source'}…</div>
            <button type="button" onClick={cancelRequest} className="text-xs text-brand font-bold">Cancel</button>
          </div>
        )}

        {/* Connection/send failure — distinct from a refusal: this is a real problem, not the
            product working correctly, so it's allowed to look like one (unlike a refusal card,
            which stays deliberately calm and never red). */}
        {askError && !isAsking && (
          <div className="bg-surface border border-error/30 rounded-2xl p-6 animate-fade-up">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-error-bg text-error flex-shrink-0">
                <WifiOff className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-navy">Couldn&apos;t send your question</h3>
                <p className="text-[13px] text-navy-2 mt-1 leading-relaxed">{askError}</p>
                <button
                  type="button"
                  onClick={() => handleAsk()}
                  className="mt-3 text-xs font-bold text-brand hover:text-brand-dark transition-colors"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {askResult && !isAsking && (
          <AskResultView
            key={askResult.requestId ?? askResult.status}
            result={askResult}
            selectedCitation={selectedCitation}
            onCitation={setSelectedCitation}
            onRetry={() => handleAsk()}
            onEdit={(question) => { setQuery(question); handleAsk({ question }); }}
            onClarify={(optionId, freeText) => {
              if (askResult.status === 'needs_clarification') handleAsk({
                question: askResult.originalQuestion,
                clarification: { context: askResult.context, optionId, freeText },
              });
            }}
          />
        )}
      </div>

      {/* Right: immersive reader for the selected chapter/paper — a clicked citation scrolls
          to and highlights its exact origin in here, rather than a separate excerpt card. */}
      <div className="lg:col-span-6">
        <div className="bg-surface border border-border rounded-2xl p-6 sticky top-24 h-[calc(100vh-7rem)] flex flex-col">
          <AskDocumentReader
            board={board}
            classLevel={classLevel}
            subject={subject}
            sourceType={sourceType}
            unit={readerUnit}
            activeCitation={selectedCitation}
          />
        </div>
      </div>
    </div>
  );
}
