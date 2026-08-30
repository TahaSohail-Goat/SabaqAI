'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, ShieldCheck } from 'lucide-react';
import type { AskDocumentResponse, AskSourceType, AskUnit } from '@/lib/types';

interface AskDocumentReaderProps {
  board: string;
  classLevel: number;
  subject: string;
  sourceType: AskSourceType | null;
  unit: AskUnit | null;
  /** The chunk backing the citation the student last clicked — scrolled to and highlighted
   *  in place, so "where did this come from" is answered inside the actual document instead
   *  of a disconnected excerpt card. */
  activeChunkId: string | null;
}

// The immersive half of /ask: once a chapter/paper is chosen, its full ingested content reads
// here — not just the one excerpt behind an answer. Replaces the old, separate "Verified
// Excerpt" card entirely; highlighting a citation in place is strictly more honest than a
// second copy of the same text next to it.
export default function AskDocumentReader({ board, classLevel, subject, sourceType, unit, activeChunkId }: AskDocumentReaderProps) {
  const [doc, setDoc] = useState<AskDocumentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chunkRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!sourceType || !unit) {
      setDoc(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      board,
      classLevel: String(classLevel),
      subject,
      sourceType,
      chapterNo: String(unit.chapterNo),
    });

    fetch(`/api/ask/document?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Failed to load this document.');
        return res.json();
      })
      .then((data: AskDocumentResponse) => {
        if (!cancelled) setDoc(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load this document.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [board, classLevel, subject, sourceType, unit]);

  useEffect(() => {
    if (!activeChunkId) return;
    const el = chunkRefs.current[activeChunkId];
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeChunkId, doc]);

  if (!sourceType || !unit) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-center gap-2 opacity-60">
        <BookOpen className="w-8 h-8 text-text-3" />
        <p className="text-text-2 text-xs max-w-[220px]">
          Choose a source and a chapter or paper to read it here.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[320px] gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-brand/20 border-t-brand animate-spin" />
        <span className="text-xs text-text-2">Loading document…</span>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-center gap-2 opacity-70">
        <BookOpen className="w-8 h-8 text-text-3" />
        <p className="text-text-2 text-xs max-w-[220px]">{error ?? 'Nothing to show yet.'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="pb-3 mb-3 border-b border-border flex-shrink-0">
        <h4 className="text-sm font-bold text-navy leading-tight">{doc.chapterTitle ?? `Chapter ${doc.chapterNo}`}</h4>
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-text-2">
          <ShieldCheck className="w-3.5 h-3.5 text-brand" />
          <span>Full ingested content — verified against the stored source, never generated.</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-5">
        {doc.sections.map((section, sIdx) => (
          <div key={sIdx}>
            {section.sectionLabel && (
              <div className="flex items-center justify-between mb-2 sticky top-0 bg-surface/95 backdrop-blur-sm py-1 -mx-1 px-1">
                <span className="text-[11px] font-bold text-brand uppercase tracking-wide">{section.sectionLabel}</span>
                {section.pageFrom !== null && (
                  <span className="text-[10px] font-mono text-text-3">
                    p. {section.pageFrom}
                    {section.pageTo && section.pageTo !== section.pageFrom ? `-${section.pageTo}` : ''}
                  </span>
                )}
              </div>
            )}
            <div className="space-y-2">
              {section.chunks.map((chunk) => {
                const isActive = chunk.id === activeChunkId;
                return (
                  <div
                    key={chunk.id}
                    ref={(el) => {
                      chunkRefs.current[chunk.id] = el;
                    }}
                    className={`text-xs leading-relaxed rounded-lg p-3 border transition-colors duration-500 ${
                      isActive
                        ? 'bg-brand-mint border-brand/40 text-brand-dark'
                        : 'bg-surface-2/40 border-transparent text-navy-2'
                    }`}
                  >
                    {chunk.content}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
