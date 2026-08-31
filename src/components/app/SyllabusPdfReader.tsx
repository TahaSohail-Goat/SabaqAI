'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Maximize2, ShieldCheck, X, ZoomIn, ZoomOut } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
}

interface SyllabusPdfReaderProps {
  /** Public URL of the real source PDF, or null when nothing is selected. */
  pdfUrl: string | null;
  title: string;
}

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.2;
const PAGE_PAD = 16; // matches the p-2 on the pages column

// A plain top-to-bottom document reader for /syllabus: every page of the source PDF is
// rendered stacked in one scroll column — read by scrolling, not paging (that's /ask's
// AskDocumentReader, which pages so a clicked citation can jump to an exact page). Zoom keeps
// you where you are (it resizes the existing page canvases in place and re-anchors the scroll
// to the page you were looking at — it never rebuilds from page 1). "Expand" opens the same
// reader as a modal lightbox over the page.
export default function SyllabusPdfReader({ pdfUrl, title }: SyllabusPdfReaderProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const pageObjsRef = useRef<PDFPageProxy[]>([]);
  const canvasesRef = useRef<HTMLCanvasElement[]>([]);
  const renderTasksRef = useRef<(RenderTask | null)[]>([]);
  const renderTokenRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [docReady, setDocReady] = useState(false);

  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);
  // The modal is portalled to <body>; that DOM node only exists on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Load the document once per PDF: fetch every page object and create one (still blank)
  // canvas per page. Painting happens in the render effect below.
  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNumPages(0);
    setDocReady(false);
    canvasesRef.current.forEach((c) => c.remove());
    canvasesRef.current = [];
    pageObjsRef.current = [];
    renderTasksRef.current = [];
    docRef.current = null;

    const task = pdfjsLib.getDocument({ url: pdfUrl });
    (async () => {
      try {
        const doc = await task.promise;
        if (cancelled) return;
        docRef.current = doc;
        const pages: PDFPageProxy[] = [];
        for (let p = 1; p <= doc.numPages; p += 1) {
          const page = await doc.getPage(p);
          if (cancelled) return;
          pages.push(page);
        }
        pageObjsRef.current = pages;
        canvasesRef.current = pages.map(() => {
          const canvas = document.createElement('canvas');
          canvas.className = 'rounded shadow-sm mb-3 block';
          return canvas;
        });
        renderTasksRef.current = pages.map(() => null);
        setNumPages(doc.numPages);
        setLoading(false);
        setDocReady(true);
      } catch {
        if (!cancelled) {
          setError('Could not load this PDF.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      task.destroy();
      docRef.current = null;
    };
  }, [pdfUrl]);

  // Size + paint every page for the current width × zoom, reusing the existing canvas nodes.
  // Runs on load, on zoom, and when the layout switches between inline and modal (the column
  // width differs). Canvas dimensions are set synchronously so the scroll geometry is final
  // before we re-anchor — no jump to the top and back.
  useEffect(() => {
    if (!docReady) return;
    const host = pagesRef.current;
    const scroller = scrollRef.current;
    const pages = pageObjsRef.current;
    const canvases = canvasesRef.current;
    if (!host || !scroller || pages.length === 0) return;

    // Move the canvases into whichever column is mounted right now (inline vs. modal — those
    // are different DOM nodes). appendChild moves an existing node, it doesn't clone it.
    canvases.forEach((canvas) => {
      if (canvas.parentElement !== host) host.appendChild(canvas);
    });

    // Which page (and how far into it) is at the top of the viewport right now?
    const anchor = (() => {
      const top = scroller.scrollTop;
      if (top <= 0 || canvases[0]?.offsetParent == null) return null;
      for (let i = 0; i < canvases.length; i += 1) {
        const c = canvases[i];
        if (c.offsetTop + c.offsetHeight > top) {
          return { index: i, frac: Math.min(1, Math.max(0, (top - c.offsetTop) / c.offsetHeight)) };
        }
      }
      return { index: canvases.length - 1, frac: 0 };
    })();

    const contentWidth = Math.max(200, scroller.clientWidth - PAGE_PAD);
    const viewports = pages.map((page) => {
      const base = page.getViewport({ scale: 1 });
      return page.getViewport({ scale: (contentWidth / base.width) * zoom });
    });

    // 1. resize synchronously — layout heights are final immediately after this loop
    canvases.forEach((canvas, i) => {
      canvas.width = viewports[i].width;
      canvas.height = viewports[i].height;
    });

    // 2. re-anchor the scroll to the same page/offset at the new size
    if (anchor && canvases[anchor.index]) {
      const c = canvases[anchor.index];
      scroller.scrollTop = c.offsetTop + anchor.frac * c.offsetHeight;
    }

    // 3. paint (async). Cancel any in-flight paints first so pdf.js doesn't complain about a
    // canvas being reused mid-render.
    renderTasksRef.current.forEach((t) => {
      try {
        t?.cancel();
      } catch {
        /* already settled */
      }
    });
    const token = (renderTokenRef.current += 1);
    (async () => {
      for (let i = 0; i < pages.length; i += 1) {
        if (renderTokenRef.current !== token) return;
        const ctx = canvases[i]?.getContext('2d');
        if (!ctx) continue;
        const rt = pages[i].render({ canvas: canvases[i], canvasContext: ctx, viewport: viewports[i] });
        renderTasksRef.current[i] = rt;
        try {
          await rt.promise;
        } catch {
          /* superseded by a newer render */
        }
      }
    })();

    return () => {
      // Stop the in-flight paint loop if this effect re-runs or the reader unmounts.
      renderTokenRef.current += 1;
      renderTasksRef.current.forEach((t) => {
        try {
          t?.cancel();
        } catch {
          /* already settled */
        }
      });
    };
  }, [docReady, zoom, expanded]);

  // While the modal is open: Esc closes it and the page behind it doesn't scroll.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded]);

  if (!pdfUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-center gap-2 opacity-60">
        <BookOpen className="w-8 h-8 text-text-3" />
        <p className="text-text-2 text-xs max-w-[220px]">Pick a chapter or paper to read it here.</p>
      </div>
    );
  }

  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 10) / 10));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 10) / 10));

  const zoomControls = (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      <button
        type="button"
        onClick={zoomOut}
        disabled={zoom <= ZOOM_MIN}
        aria-label="Zoom out"
        className="p-1.5 rounded-md text-text-2 hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
      >
        <ZoomOut className="w-4 h-4" />
      </button>
      <span className="text-[11px] font-mono text-text-2 w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
      <button
        type="button"
        onClick={zoomIn}
        disabled={zoom >= ZOOM_MAX}
        aria-label="Zoom in"
        className="p-1.5 rounded-md text-text-2 hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
      >
        <ZoomIn className="w-4 h-4" />
      </button>
    </div>
  );

  const pagesColumn = (
    <div
      ref={scrollRef}
      className="relative flex-1 min-h-0 overflow-auto rounded-lg border border-border bg-surface-2/40"
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
      {/* w-max lets a zoomed page grow past the column so the scroller can reach its left edge;
          min-w-full keeps an un-zoomed page centered. */}
      <div ref={pagesRef} className="flex flex-col items-center w-max min-w-full p-2" />
    </div>
  );

  const subline =
    numPages > 0 ? `${numPages} pages — scroll to read` : 'The real source PDF — not a reconstruction.';

  if (expanded) {
    return (
      <>
        {/* Placeholder so the right column doesn't collapse while the modal is open. */}
        <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-center gap-2 opacity-60">
          <Maximize2 className="w-7 h-7 text-text-3" />
          <button type="button" onClick={() => setExpanded(true)} className="text-xs text-text-2 underline">
            Open in full screen
          </button>
        </div>

        {/* Portalled to <body> so it sits above the app shell (sidebar/topbar), not inside it. */}
        {mounted &&
          createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-stretch justify-center bg-navy/95 p-0 sm:p-5"
              role="dialog"
              aria-modal="true"
              aria-label={title}
              onClick={() => setExpanded(false)}
            >
              <div
                className="bg-surface shadow-xl w-full max-w-6xl h-full flex flex-col overflow-hidden sm:rounded-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-shrink-0">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-navy leading-tight truncate">{title}</h4>
                    <p className="text-[10px] text-text-2 mt-0.5">{subline}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {zoomControls}
                    <button
                      type="button"
                      onClick={() => setExpanded(false)}
                      aria-label="Close"
                      className="p-1.5 rounded-md text-text-2 hover:bg-error-bg hover:text-error transition-colors ml-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 flex flex-col p-3">{pagesColumn}</div>
              </div>
            </div>,
            document.body,
          )}
      </>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="pb-3 mb-3 border-b border-border flex-shrink-0 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-navy leading-tight truncate">{title}</h4>
          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-text-2">
            <ShieldCheck className="w-3.5 h-3.5 text-brand flex-shrink-0" />
            <span>{subline}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {zoomControls}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Open full screen"
            className="p-1.5 rounded-md text-text-2 hover:bg-surface-2 transition-colors ml-1"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {pagesColumn}
    </div>
  );
}
