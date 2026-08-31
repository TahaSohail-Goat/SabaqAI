'use client';

import React, { useEffect, useState } from 'react';
import type { AskOptionsResponse, AskSourceType, AskUnit } from '@/lib/types';
import { useScope } from '@/components/app/ScopeContext';
import { ALL_SUBJECT_CODES } from '@/lib/subjects';
import { ASK_SOURCE_META, ASK_SOURCE_TYPES } from '@/lib/ask/source-meta';
import AskSubjectSelector from '@/components/app/AskSubjectSelector';
import AskSourceSelector from '@/components/app/AskSourceSelector';
import AskUnitSelector from '@/components/app/AskUnitSelector';
import SyllabusPdfReader from '@/components/app/SyllabusPdfReader';

const EMPTY_SOURCES: AskOptionsResponse['sources'] = ASK_SOURCE_TYPES.map((sourceType) => ({ sourceType, units: [] }));

// The Syllabus Explorer: the same scope picker as /ask (subject → source → chapter/paper),
// but no question box — pick a unit and its real source PDF opens in the reader alongside,
// scrolled top-to-bottom. Class + board come from the profile. Retrieval/generation never
// touch this screen.
export default function SyllabusPage() {
  const { board, classLevel, subject, setSubject } = useScope();

  const [sources, setSources] = useState(EMPTY_SOURCES);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [sourceType, setSourceType] = useState<AskSourceType | null>(null);
  const [unit, setUnit] = useState<AskUnit | null>(null);

  // Re-fetch and reset the cascade whenever the scope changes.
  useEffect(() => {
    let cancelled = false;
    setOptionsLoading(true);
    setSourceType(null);
    setUnit(null);

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
  const readerTitle = unit
    ? unit.chapterTitle ?? `${ASK_SOURCE_META[sourceType!].unitNoun} ${unit.chapterNo}`
    : '';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
      {/* Left: scope picker (no question box) */}
      <div className="lg:col-span-5 space-y-6">
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-4">
          <AskSubjectSelector value={subject} subjects={ALL_SUBJECT_CODES} onChange={setSubject} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AskSourceSelector
              value={sourceType}
              sources={sources}
              loading={optionsLoading}
              onChange={(t) => {
                setSourceType(t);
                setUnit(null);
              }}
            />
            {sourceType ? (
              <AskUnitSelector
                sourceType={sourceType}
                units={activeUnits}
                value={unit}
                onChange={setUnit}
              />
            ) : (
              <div className="flex items-center px-4 py-3 rounded-xl border border-dashed border-border text-[13px] text-text-3">
                Choose a source first
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: the real source PDF, scrolled top-to-bottom */}
      <div className="lg:col-span-7">
        <div className="bg-surface border border-border rounded-2xl p-6 sticky top-24 h-[calc(100vh-7rem)] flex flex-col">
          <SyllabusPdfReader
            key={unit ? `${sourceType}-${unit.chapterNo}` : 'none'}
            pdfUrl={unit?.pdfUrl ?? null}
            title={readerTitle}
          />
        </div>
      </div>
    </div>
  );
}
