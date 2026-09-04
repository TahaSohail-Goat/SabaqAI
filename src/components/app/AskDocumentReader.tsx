'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
// The legacy build (not the default 'pdfjs-dist' entry) — this component's top-level import
// still executes once during Next's server-side prerender pass even though it's client-only,
// and the default build assumes a browser and warns/misbehaves under Node.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { AskDocumentResponse, AskSourceType, AskUnit, Citation } from '@/lib/types';

// Marks an error whose .message is already student-safe (built from /api/ask/document's own
// controlled error string, or a fixed fallback below) — anything else caught (a raw network
// rejection, a JSON parse failure) is a debugging detail, never shown as-is.
class DocumentLoadError extends Error {}

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
}

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

// ─── Real PDF, rendered onto a canvas via pdf.js — not the browser's native viewer. ─────────
//
// An earlier version of this pointed an iframe at `${pdfUrl}#page=N}`, remounting it (keyed
// on the fragment) to force a fresh load per click. That's not just unreliable browser
// behavior — for a textbook chapter it was outright wrong: chapter PDFs are rebuilt as their
// own file starting at local page 1 (see rebuildChapterPdf in scripts/crawl.ts), but a
// citation's pageFrom is always the ABSOLUTE page number in the original book. E.g. "Work And
// Energy" spans book pages 138-169, so its PDF has 32 pages — a citation for book page 139
// means local page 2, not literal page 139 (which doesn't exist in that file and just got
// clamped/ignored). unit.pageFrom (see AskUnit) carries the offset needed to convert one into
// the other; see the effect below. Rendering with pdf.js on top of that also gives full JS
// control over which page is on screen, instead of depending on a browser's native PDF viewer
// to honor a URL fragment.

function PdfDocumentView({ unit, pdfUrl, activeCitation }: { unit: AskUnit; pdfUrl: string; activeCitation: Citation | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);

  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load the document whenever the PDF itself changes (a different chapter selected).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    docRef.current = null;
    setNumPages(0);
    setPageNum(1);

    const task = pdfjsLib.getDocument({ url: pdfUrl });
    task.promise
      .then((doc) => {
        if (cancelled) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Could not load this PDF.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
      docRef.current = null;
      task.destroy();
    };
  }, [pdfUrl]);

  // Jump to the cited page whenever a new citation is selected (or a fresh document loads).
  // activeCitation.pageFrom is always an absolute page in the original source — re-base it
  // against unit.pageFrom (the absolute page that maps to local page 1 of THIS pdfUrl) before
  // using it, or a textbook citation lands on the wrong page (or gets clamped past the end).
  useEffect(() => {
    if (!activeCitation?.pageFrom) return;
    const local = unit.pageFrom ? activeCitation.pageFrom - unit.pageFrom + 1 : activeCitation.pageFrom;
    setPageNum(Math.max(1, local));
  }, [activeCitation, unit.pageFrom, pdfUrl]);

  // The page actually rendered below — pageNum can transiently point past the end (a stale
  // citation re-applied against a different chapter's offset, or simply clicking past the last
  // page) and clamping only where the page gets rendered would leave the pagination LABEL still
  // showing the raw, out-of-range value. Deriving one clamped value and using it everywhere below
  // keeps what's on screen and what the label says in sync.
  const clampedPage = numPages > 0 ? Math.min(Math.max(1, pageNum), numPages) : pageNum;

  // Render the current page onto the canvas. This is the part that actually moves the
  // reader — deterministic, not dependent on any browser's native PDF viewer.
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || numPages === 0) return;
    let cancelled = false;

    doc.getPage(clampedPage).then((page) => {
      if (cancelled) return;
      const containerWidth = containerRef.current?.clientWidth || 700;
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = containerWidth / baseViewport.width;
      const viewport = page.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      page.render({ canvas, canvasContext: ctx, viewport }).promise.catch(() => {
        if (!cancelled) setError('Could not render this page.');
      });
    });

    return () => {
      cancelled = true;
    };
  }, [clampedPage, numPages]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="pb-3 mb-3 border-b border-border flex-shrink-0 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-navy leading-tight truncate">{unit.chapterTitle ?? `Chapter ${unit.chapterNo}`}</h4>
          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-text-2">
            <ShieldCheck className="w-3.5 h-3.5 text-brand flex-shrink-0" />
            <span>The real source PDF, not a reconstruction.</span>
          </div>
        </div>
        {numPages > 0 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => setPageNum(clampedPage - 1)}
              disabled={clampedPage <= 1}
              aria-label="Previous page"
              className="p-1 rounded-md text-text-2 hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-mono text-text-2 min-w-[52px] text-center">
              {clampedPage} / {numPages}
            </span>
            <button
              type="button"
              onClick={() => setPageNum(clampedPage + 1)}
              disabled={clampedPage >= numPages}
              aria-label="Next page"
              className="p-1 rounded-md text-text-2 hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto rounded-lg border border-border bg-surface-2/40 flex items-start justify-center p-2"
      >
        {loading && (
          <div className="flex items-center justify-center w-full h-full min-h-[200px]">
            <div className="w-8 h-8 rounded-full border-2 border-brand/20 border-t-brand animate-spin" />
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center w-full h-full min-h-[200px] text-center text-xs text-text-2 px-4">
            {error}
          </div>
        )}
        <canvas ref={canvasRef} className={`rounded shadow-sm ${loading || error ? 'hidden' : ''}`} />
      </div>
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
        if (!res.ok) throw new DocumentLoadError((await res.json().catch(() => null))?.error ?? 'Failed to load this document.');
        return res.json();
      })
      .then((data: AskDocumentResponse) => {
        if (!cancelled) setDoc(data);
      })
      .catch((err) => {
        // A DocumentLoadError's message is always one of ours (the API's own controlled error
        // string, or the fixed fallback above) — anything else is a raw exception (dropped
        // connection, invalid JSON) that a student was never meant to read.
        if (!cancelled) {
          setError(err instanceof DocumentLoadError ? err.message : 'Could not load this document. Check your connection and try again.');
        }
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
          <span>Text version. The original PDF hasn&apos;t been uploaded for this source yet.</span>
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
