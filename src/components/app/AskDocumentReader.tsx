'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, ShieldCheck } from 'lucide-react';
import type { AskDocumentResponse, AskSourceType, AskUnit, Citation } from '@/lib/types';

interface AskDocumentReaderProps {
  board: string;
  classLevel: number;
  subject: string;
  sourceType: AskSourceType | null;
  unit: AskUnit | null;
  /** The citation the student last clicked. When the selected unit has a real PDF, this
   *  jumps the viewer to that page; otherwise its chunk is scrolled to and highlighted in
   *  the plain-text fallback below — either way, "where did this come from" is answered in
   *  place, not via a second, disconnected excerpt card. */
  activeCitation: Citation | null;
}

// The immersive half of /ask: once a chapter/paper is chosen, it reads here immediately —
// the real source PDF when one has been uploaded (see scripts/backfill-pdf-storage.ts),
// falling back to the ingested plain text for anything not backfilled yet. Retrieval/
// generation never touch this component's data at all — this is purely what a student sees.
export default function AskDocumentReader({ board, classLevel, subject, sourceType, unit, activeCitation }: AskDocumentReaderProps) {
  if (!sourceType || !unit) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-center gap-2 opacity-60">
        <BookOpen className="w-8 h-8 text-text-3" />
        <p className="text-text-2 text-xs max-w-[220px]">Choose a source and a chapter or paper to read it here.</p>
      </div>
    );
  }

  if (unit.pdfUrl) {
    return <PdfDocumentView unit={unit} pdfUrl={unit.pdfUrl} activeCitation={activeCitation} />;
  }

  return (
    <TextDocumentView
      board={board}
      classLevel={classLevel}
      subject={subject}
      sourceType={sourceType}
      unit={unit}
      activeChunkId={activeCitation?.chunkId ?? null}
    />
  );
}

// ─── Real PDF, rendered by the browser's own viewer — no library shipped for this. ─────────

function PdfDocumentView({ unit, pdfUrl, activeCitation }: { unit: AskUnit; pdfUrl: string; activeCitation: Citation | null }) {
  // Verified live that just changing an already-mounted iframe's src to a new #page=N
  // fragment does NOT move Chrome's native PDF viewer — it only reads that fragment on a
  // genuinely fresh load. Keying the iframe on the target page forces React to remount a
  // new element per click, which does navigate correctly (the file itself is already
  // browser-cached from the first load, so this isn't a real network refetch).
  const page = activeCitation?.pageFrom;
  const src = page ? `${pdfUrl}#page=${page}` : pdfUrl;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="pb-3 mb-3 border-b border-border flex-shrink-0">
        <h4 className="text-sm font-bold text-navy leading-tight">{unit.chapterTitle ?? `Chapter ${unit.chapterNo}`}</h4>
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-text-2">
          <ShieldCheck className="w-3.5 h-3.5 text-brand" />
          <span>The real source PDF — not a reconstruction.</span>
        </div>
      </div>
      <iframe
        key={src}
        src={src}
        title={unit.chapterTitle ?? 'Source document'}
        className="flex-1 min-h-0 w-full rounded-lg border border-border bg-surface-2/40"
      />
    </div>
  );
}

// ─── Fallback: the ingested plain text, for anything without a stored PDF yet. ──────────────

function TextDocumentView({
  board,
  classLevel,
  subject,
  sourceType,
  unit,
  activeChunkId,
}: {
  board: string;
  classLevel: number;
  subject: string;
  sourceType: AskSourceType;
  unit: AskUnit;
  activeChunkId: string | null;
}) {
  const [doc, setDoc] = useState<AskDocumentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chunkRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDoc(null);

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
          <span>Ingested text — the original PDF hasn&apos;t been uploaded for this source yet.</span>
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
                      isActive ? 'bg-brand-mint border-brand/40 text-brand-dark' : 'bg-surface-2/40 border-transparent text-navy-2'
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
