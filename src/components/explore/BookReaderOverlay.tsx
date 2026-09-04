'use client';

import { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, BookOpen, ShieldCheck } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { AskOptionsResponse, AskUnit } from '@/lib/types';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
}

interface BookReaderOverlayProps {
  subjectCode: string;
  subjectLabel: string;
  board: string;
  classLevel: number;
  onClose: () => void;
}

// The payoff of the click-through-the-solar-system moment: right after Explore's "Happy
// Learning" reveal, the actual textbook opens here — full-screen, over the scene, no route
// change. Starts at chapter 1 immediately (no chapter picker step first, unlike Doubts, which
// is for a targeted question against one specific chapter) and pages through the whole book
// from there via Prev/Next chapter, closer to actually opening a real book than dead-ending on
// a dropdown. Own self-contained pdf.js rendering rather than reusing AskDocumentReader's — that
// one's citation-page re-basing logic has no equivalent here (nothing is being cited), so
// duplicating the plain page-render/pagination part is simpler and safer than threading an
// unused code path through a heavily-used component.
export default function BookReaderOverlay({ subjectCode, subjectLabel, board, classLevel, onClose }: BookReaderOverlayProps) {
  const [chapters, setChapters] = useState<AskUnit[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ask/options?board=${encodeURIComponent(board)}&classLevel=${classLevel}&subject=${encodeURIComponent(subjectCode)}`)
      .then((res) => res.json())
      .then((data: AskOptionsResponse) => {
        if (cancelled) return;
        const textbook = data.sources.find((s) => s.sourceType === 'textbook');
        const units = (textbook?.units ?? []).filter((u): u is AskUnit & { pdfUrl: string } => Boolean(u.pdfUrl));
        if (units.length === 0) {
          setLoadError("This book isn't available to read yet.");
          return;
        }
        setChapters(units);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not load this book. Check your connection and try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [board, classLevel, subjectCode]);

  // Close on Escape, matching every other modal-ish overlay in the app.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const activeChapter = chapters?.[activeIndex] ?? null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-navy/60 backdrop-blur-sm p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`${subjectLabel} textbook`}
    >
      <div className="relative flex h-full max-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 flex-shrink-0">
          <div className="flex min-w-0 items-center gap-2.5">
            <BookOpen className="h-5 w-5 flex-shrink-0 text-brand" />
            <h2 className="truncate text-sm font-bold text-navy">{subjectLabel}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close book"
            className="rounded-lg p-1.5 text-text-2 transition-colors hover:bg-surface-hover hover:text-navy"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {chapters && chapters.length > 1 && (
          <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-2.5">
            <button
              type="button"
              onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
              disabled={activeIndex <= 0}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-navy-2 transition-colors hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev chapter
            </button>
            <span className="truncate text-xs font-semibold text-navy-2">
              {activeChapter?.chapterTitle ?? `Chapter ${activeChapter?.chapterNo}`}
            </span>
            <button
              type="button"
              onClick={() => setActiveIndex((i) => Math.min(chapters.length - 1, i + 1))}
              disabled={activeIndex >= chapters.length - 1}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-navy-2 transition-colors hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              Next chapter
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 p-4">
          {loadError ? (
            <div className="flex h-full min-h-[200px] items-center justify-center text-center text-xs text-text-2">
              {loadError}
            </div>
          ) : !activeChapter ? (
            <div className="flex h-full min-h-[200px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand/20 border-t-brand" />
            </div>
          ) : (
            <BookChapterPage key={activeChapter.chapterNo} title={activeChapter.chapterTitle ?? `Chapter ${activeChapter.chapterNo}`} pdfUrl={activeChapter.pdfUrl!} />
          )}
        </div>
      </div>
    </div>
  );
}

// One chapter's PDF, rendered page by page onto a canvas — deliberately plain, no citation/page
// re-basing (nothing here is being cited against). Remounted (via the `key` above) on every
// chapter change, so page state always starts fresh at page 1 of the new file.
function BookChapterPage({ title, pdfUrl }: { title: string; pdfUrl: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);

  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    docRef.current = null;
    setNumPages(0);

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
        setError('Could not load this page.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
      docRef.current = null;
      task.destroy();
    };
  }, [pdfUrl]);

  const clampedPage = numPages > 0 ? Math.min(Math.max(1, pageNum), numPages) : pageNum;

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
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex flex-shrink-0 items-center justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-bold text-navy leading-tight">{title}</h4>
          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-text-2">
            <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 text-brand" />
            <span>The real source PDF, not a reconstruction.</span>
          </div>
        </div>
        {numPages > 0 && (
          <div className="flex flex-shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setPageNum(clampedPage - 1)}
              disabled={clampedPage <= 1}
              aria-label="Previous page"
              className="rounded-md p-1 text-text-2 transition-colors hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[52px] text-center font-mono text-[11px] text-text-2">
              {clampedPage} / {numPages}
            </span>
            <button
              type="button"
              onClick={() => setPageNum(clampedPage + 1)}
              disabled={clampedPage >= numPages}
              aria-label="Next page"
              className="rounded-md p-1 text-text-2 transition-colors hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className="flex min-h-0 flex-1 items-start justify-center overflow-auto rounded-lg border border-border bg-surface-2/40 p-2"
      >
        {loading && (
          <div className="flex h-full min-h-[200px] w-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand/20 border-t-brand" />
          </div>
        )}
        {error && (
          <div className="flex h-full min-h-[200px] w-full items-center justify-center px-4 text-center text-xs text-text-2">
            {error}
          </div>
        )}
        <canvas ref={canvasRef} className={`rounded shadow-sm ${loading || error ? 'hidden' : ''}`} />
      </div>
    </div>
  );
}
