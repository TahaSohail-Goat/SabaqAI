'use client';

import React, { useEffect, useState } from 'react';
import {
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  BookOpen,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react';
import type { AskResponse, Citation, AskOptionsResponse, AskSourceType, AskUnit } from '@/lib/types';
import { useScope } from '@/components/app/ScopeContext';
import AskSourceSelector from '@/components/app/AskSourceSelector';
import AskUnitSelector from '@/components/app/AskUnitSelector';
import AskDocumentReader from '@/components/app/AskDocumentReader';
import { ASK_SOURCE_TYPES } from '@/lib/ask/source-meta';

const EMPTY_SOURCES: AskOptionsResponse['sources'] = ASK_SOURCE_TYPES.map((sourceType) => ({ sourceType, units: [] }));

export default function AskPage() {
  const { board, classLevel, subject, language } = useScope();

  const [sources, setSources] = useState(EMPTY_SOURCES);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [sourceType, setSourceType] = useState<AskSourceType | null>(null);
  const [unit, setUnit] = useState<AskUnit | null>(null);

  const [query, setQuery] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [askResult, setAskResult] = useState<AskResponse | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  // Re-fetch (and reset the cascade) whenever the underlying scope changes — e.g. the
  // student switches subject in Settings while this page is already open.
  useEffect(() => {
    let cancelled = false;
    setOptionsLoading(true);
    setSourceType(null);
    setUnit(null);
    setAskResult(null);
    setSelectedCitation(null);

    fetch(`/api/ask/options?board=${encodeURIComponent(board)}&classLevel=${classLevel}&subject=${encodeURIComponent(subject)}`)
      .then((res) => res.json())
      .then((data: AskOptionsResponse) => {
        if (!cancelled) setSources(data.sources);
      })
      .catch(() => {
        if (!cancelled) setSources(EMPTY_SOURCES);
      })
      .finally(() => {
        if (!cancelled) setOptionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [board, classLevel, subject]);

  const activeUnits = sourceType ? sources.find((s) => s.sourceType === sourceType)?.units ?? [] : [];
  const canAsk = Boolean(sourceType && unit);

  const handleAsk = async () => {
    if (!query.trim() || isAsking || !sourceType || !unit) return;

    setIsAsking(true);
    setAskResult(null);
    setSelectedCitation(null);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: query.trim(),
          board,
          classLevel,
          subject,
          language,
          sourceType,
          chapterNo: unit.chapterNo,
        }),
      });
      const data: AskResponse = await res.json();
      setAskResult(data);
      if (data.status === 'answered' && data.citations.length > 0) {
        setSelectedCitation(data.citations[0]);
      }
    } catch (err) {
      console.error('Ask error:', err);
    } finally {
      setIsAsking(false);
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AskSourceSelector
              value={sourceType}
              sources={sources}
              loading={optionsLoading}
              onChange={(t) => {
                setSourceType(t);
                setUnit(null);
                setAskResult(null);
              }}
            />
            {sourceType ? (
              <AskUnitSelector
                sourceType={sourceType}
                units={activeUnits}
                value={unit}
                onChange={(u) => {
                  setUnit(u);
                  setAskResult(null);
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
              onChange={(e) => setQuery(e.target.value)}
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
                  <span>Searching</span>
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
            <div className="text-xs text-text-2">Searching the selected {unit?.chapterTitle ?? 'source'}…</div>
          </div>
        )}

        {/* Result */}
        {askResult && !isAsking && (
          <div className="space-y-4 animate-fade-up">
            {askResult.status === 'answered' ? (
              <div className="bg-surface border border-border rounded-2xl p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
                  <div className="flex items-center gap-2 text-brand">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wide">
                      Grounded ({askResult.confidence.band === 'high' ? 'High' : 'Borderline'} confidence)
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-text-2">
                    Top-1: <span className="font-bold text-navy-2">{askResult.confidence.top1.toFixed(2)}</span> · Support: {askResult.confidence.support}
                  </div>
                </div>

                <div className="space-y-3 text-navy-2 text-sm leading-relaxed" dir={askResult.language === 'ur' ? 'rtl' : 'ltr'}>
                  {askResult.statements.map((stmt, sIdx) => (
                    <div key={sIdx} className="bg-surface-2/60 p-4 rounded-xl border border-border/60">
                      <span>{stmt.text}</span>
                      <span className="inline-flex gap-1.5 ml-2">
                        {stmt.chunkIds.map((cid, cIdx) => {
                          const citeObj = askResult.citations.find((c) => c.chunkId === cid);
                          return (
                            <button
                              key={cIdx}
                              type="button"
                              onClick={() => citeObj && setSelectedCitation(citeObj)}
                              className="inline-flex items-center gap-1 text-[11px] bg-brand-mint hover:bg-brand-light text-brand-dark border border-brand/20 px-2 py-0.5 rounded-md cursor-pointer transition-colors font-mono font-bold"
                            >
                              <span>[p. {citeObj?.pageFrom ?? '?'}]</span>
                            </button>
                          );
                        })}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {askResult.citations.map((cite, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedCitation(cite)}
                      className={`text-xs px-3 py-2 rounded-xl border flex items-center gap-2 transition-colors ${
                        selectedCitation?.chunkId === cite.chunkId
                          ? 'bg-brand text-white border-brand'
                          : 'bg-surface border-border text-navy-2 hover:border-brand/30'
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span className="font-semibold truncate max-w-[220px]">{cite.chapterTitle ?? `Ch ${cite.chapterNo}`}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Refusal — calm, neutral, never styled as an error */
              <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3 pb-4 border-b border-border">
                  <div className="p-2 rounded-full bg-warning/10 text-warning">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-navy">Question refused</h3>
                    <p className="text-[11px] text-text-2 mt-0.5">The AI was intentionally skipped rather than guess.</p>
                  </div>
                </div>

                <div className="bg-surface-2/50 p-4 rounded-xl text-sm text-navy-2 leading-relaxed">
                  {askResult.message}
                </div>

                <div className="text-xs bg-surface-2/40 text-navy-2 p-3.5 rounded-xl flex items-start gap-3">
                  <HelpCircle className="w-4 h-4 text-text-3 flex-shrink-0 mt-0.5" />
                  <span>{askResult.suggestion}</span>
                </div>
              </div>
            )}
          </div>
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
            unit={unit}
            activeChunkId={selectedCitation?.chunkId ?? null}
          />
        </div>
      </div>
    </div>
  );
}
