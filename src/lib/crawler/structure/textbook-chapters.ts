// Chapter-boundary detection for a scanned textbook's OCR'd pages. Ported from the old
// crawler's calibration against a real book (FBISE Class 9 Physics): a real chapter's
// running header clusters tightly on a contiguous page range (14-24 pages in the
// calibration book) and then stops, while a recurring non-chapter label ("SOLUTION",
// "MULTIPLE CHOICE QUESTIONS") occurs just as often but scattered across the whole book. Two
// heading styles: ALL-CAPS running headers, and a numbered "Unit N: Title" fallback (checked
// as both a page header and footer — different books print it in different places).
//
// FIX (this redesign): extractHeaderCandidates now takes an `excludePages` set — the book's
// own front matter (title/copyright/table-of-contents), identified by structure/toc.ts — so
// those pages' own printed chapter list can never contaminate the clustering below it. This
// is the actual root cause of the old crawler silently losing Math 9's real Chapter 1: the
// ToC page's shouty chapter-title text was fed into the SAME clustering pass that finds real
// chapter headers, corrupting the Math.min()-based "first real occurrence" calculation.
//
// CALIBRATED AGAINST REAL BOOKS — verify the printed chapter report against each new book's
// actual table of contents (via structure/crosscheck.ts) before trusting it; the span/
// occurrence thresholds below are what worked for the calibration books' chapter lengths,
// not universal constants.

import type { OcrPage } from '../ocr';
import { MAX_SECTION_CHARS } from '../types';
import { detectWatermarkNoise, stripNoisePhrasesFromTitle } from '../noise-filter';

export interface HeaderCandidate {
  page: number;
  /** Normalised: letters and spaces only, uppercased, collapsed whitespace. */
  text: string;
}

export function extractHeaderCandidates(pages: OcrPage[], excludePages: Set<number> = new Set()): HeaderCandidate[] {
  const candidates: HeaderCandidate[] = [];
  for (const { pageNumber, text } of pages) {
    if (excludePages.has(pageNumber)) continue;
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3);
    for (const line of lines) {
      const letters = line.replace(/[^a-zA-Z]/g, '');
      if (letters.length < 5 || letters.length > 45) continue;
      const upperRatio = (line.match(/[A-Z]/g) ?? []).length / letters.length;
      if (upperRatio < 0.8) continue; // not a shouty heading-style line — ordinary prose
      const norm = line.replace(/[^A-Za-z ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
      if (norm.length < 5) continue;
      candidates.push({ page: pageNumber, text: norm });
    }
  }
  return candidates;
}

// Real chapters in the calibration books spanned 14-24 pages; noise labels spanned 100+.
const MAX_CHAPTER_SPAN_PAGES = 45;
const MIN_HEADER_OCCURRENCES = 3;

export interface DetectedHeader {
  text: string;
  firstPage: number;
}

export function detectChapterHeaders(candidates: HeaderCandidate[]): DetectedHeader[] {
  const pagesByText = new Map<string, number[]>();
  for (const c of candidates) {
    if (!pagesByText.has(c.text)) pagesByText.set(c.text, []);
    pagesByText.get(c.text)!.push(c.page);
  }

  const headers: DetectedHeader[] = [];
  for (const [text, pageList] of pagesByText) {
    if (pageList.length < MIN_HEADER_OCCURRENCES) continue;
    const firstPage = Math.min(...pageList);
    const lastPage = Math.max(...pageList);
    if (lastPage - firstPage > MAX_CHAPTER_SPAN_PAGES) continue; // scattered → noise, not a chapter
    headers.push({ text, firstPage });
  }

  return headers.sort((a, b) => a.firstPage - b.firstPage);
}

export interface NumberedHeaderCandidate {
  page: number;
  unitNo: number;
  /** Raw captured remainder after the "Unit N"/"Chapter N" prefix — not yet cleaned/cased. */
  title: string;
}

// The separator after the number can have a space before it too — OCR sometimes renders
// "Unit4 : Cell Cycle" (digit glued to "Unit", then a *spaced* colon) instead of the tidier
// "Unit 4: Cell Cycle". Without \s* before the optional punctuation, that leading space stops
// the punctuation from matching at all, and the colon leaks into the captured title instead.
const NUMBERED_HEADER_RE = /^(?:unit|chapter)\s*[:\-–—.]?\s*(\d{1,2})\b\s*[:;.\-–—]?\s*(.*)$/i;

/** Fallback for books whose running headers are printed in ordinary title case rather than
 *  the shouty ALL-CAPS style extractHeaderCandidates looks for. Matches an explicit
 *  "Unit N"/"Chapter N" prefix near the top OR bottom of a page — some books print this
 *  running marker as a header, others as a footer. */
export function extractNumberedHeaderCandidates(pages: OcrPage[], excludePages: Set<number> = new Set()): NumberedHeaderCandidate[] {
  const candidates: NumberedHeaderCandidate[] = [];
  for (const { pageNumber, text } of pages) {
    if (excludePages.has(pageNumber)) continue;
    const allLines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const lines = [...allLines.slice(0, 5), ...allLines.slice(-5)];
    for (const line of lines) {
      const m = line.match(NUMBERED_HEADER_RE);
      if (!m) continue;
      const unitNo = parseInt(m[1], 10);
      if (unitNo < 1 || unitNo > 30) continue; // implausible for a single grade's textbook
      // Page-header designs often print a decorative vertical rule or bracket next to the
      // title — OCR sometimes reads it as a literal "|" or "{"/"}" stuck to the title's edge.
      // Never legitimate inside a real chapter title, unlike hyphens/commas.
      const title = m[2].replace(/[|{}]/g, '').replace(/\s+/g, ' ').trim();
      candidates.push({ page: pageNumber, unitNo, title });
    }
  }
  return candidates;
}

/** Groups numbered-header sightings by their unit number rather than exact text — OCR
 *  truncates/garbles the title differently almost every time, so exact-text clustering (as
 *  detectChapterHeaders does for ALL-CAPS headers) would never accumulate enough occurrences
 *  of any single string. The explicit unit number is a much stronger, lower-noise signal, so
 *  a single genuine sighting is trusted (no occurrence minimum) — the one guard needed is
 *  against an isolated, OCR-misread digit run nowhere near the running sequence.
 *
 *  `watermarkPhrases` is stripped from each occurrence's title BEFORE the "longest fragment"
 *  comparison below — confirmed necessary against real FBISE Math 9 OCR output, where a
 *  book-wide watermark ("National Book Foundation") glued onto a real running header made
 *  the WATERMARKED variant win purely by being longer, e.g. "Coordinate Geometry National
 *  Book Foundation" beating the clean "Coordinate Geometry" every time. */
export function detectNumberedChapters(candidates: NumberedHeaderCandidate[], watermarkPhrases: Iterable<string> = []): DetectedHeader[] {
  const watermarkList = [...watermarkPhrases];
  const byUnit = new Map<number, NumberedHeaderCandidate[]>();
  for (const c of candidates) {
    if (!byUnit.has(c.unitNo)) byUnit.set(c.unitNo, []);
    byUnit.get(c.unitNo)!.push({ ...c, title: stripNoisePhrasesFromTitle(c.title, watermarkList) });
  }

  const perUnit = [...byUnit.entries()]
    .map(([unitNo, occurrences]) => ({
      unitNo,
      firstPage: Math.min(...occurrences.map((o) => o.page)),
      // Longest captured fragment is usually the least-truncated OCR read of the real title,
      // now that watermark text can no longer masquerade as "more title."
      title: occurrences.reduce((best, o) => (o.title.length > best.length ? o.title : best), ''),
    }))
    .sort((a, b) => a.firstPage - b.firstPage);

  const headers: DetectedHeader[] = [];
  let runningMax = 0;
  for (const u of perUnit) {
    if (headers.length > 0 && u.unitNo > runningMax + 10) continue;
    if (!u.title) continue; // every sighting was too truncated to yield a usable title
    headers.push({ text: u.title, firstPage: u.firstPage });
    runningMax = Math.max(runningMax, u.unitNo);
  }
  return headers;
}

/** Title-cases a heading, keeping standalone Roman numerals fully uppercase — e.g.
 *  "DYNAMICS II" should read "Dynamics II", not "Dynamics Ii". */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Iii|Ii|Iv|Vi|Vii|Viii|Ix|Xi|Xii|I|V|X)\b/g, (m) => m.toUpperCase());
}

export interface DetectedChapter {
  chapterNo: number;
  chapterTitle: string;
  pageFrom: number;
  pageTo: number;
}

/** Detects chapter boundaries only — no content assembly. Returns the raw header-candidate
 *  texts too (needed by noise-filter.ts to build the chunk-content exclusion set) alongside
 *  the detected chapters (needed by structure/crosscheck.ts). */
export function detectChapters(pages: OcrPage[], excludePages: Set<number> = new Set()): {
  chapters: DetectedChapter[];
  headerCandidateTexts: string[];
} {
  const candidates = extractHeaderCandidates(pages, excludePages);
  let headers = detectChapterHeaders(candidates);
  let headerCandidateTexts = candidates.map((c) => c.text);

  // ALL-CAPS running headers are one style, not the only one — some books print
  // "Unit N: Title" in ordinary title case instead, which extractHeaderCandidates rejects
  // outright. Try the numbered-header pattern before giving up.
  if (headers.length < 2) {
    // Computed over ALL pages (not excludePages-filtered) — a book-wide watermark, by
    // definition, prints across the whole book including its front matter, so front-matter
    // exclusion (meant for the ToC's own chapter-list contamination, a different problem)
    // must not accidentally hide it from this pass.
    const watermarks = detectWatermarkNoise(pages).map((w) => w.text);
    const numberedCandidates = extractNumberedHeaderCandidates(pages, excludePages);
    const numberedHeaders = detectNumberedChapters(numberedCandidates, watermarks);
    if (numberedHeaders.length >= 2) {
      headers = numberedHeaders;
      headerCandidateTexts = numberedCandidates.map((c) =>
        c.title.replace(/[^A-Za-z ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
      );
    }
  }

  if (headers.length === 0) {
    throw new Error(
      'No chapter headings detected in OCR output — the clustering thresholds likely need ' +
      "calibrating against this book's actual scan. Run with --dry-run first and inspect the OCR text."
    );
  }

  const lastPageNo = pages[pages.length - 1]?.pageNumber ?? 0;
  const chapters: DetectedChapter[] = headers.map((header, i) => ({
    chapterNo: i + 1,
    chapterTitle: titleCase(header.text),
    pageFrom: header.firstPage,
    pageTo: i + 1 < headers.length ? headers[i + 1].firstPage - 1 : lastPageNo,
  }));

  return { chapters, headerCandidateTexts };
}

export interface BuiltChapterSection {
  section: string;
  pageFrom: number;
  pageTo: number;
  content: string;
}

/** Builds the actual per-chapter sections from OCR'd pages + already-detected chapter
 *  boundaries — kept separate from detectChapters() so structure/crosscheck.ts can validate
 *  the boundaries BEFORE any content assembly happens; no point building documents for a
 *  chapter split that's about to be rejected. */
export function buildChapterSections(
  pages: OcrPage[],
  chapters: DetectedChapter[],
  noiseTexts: Set<string>
): { chapterNo: number; sections: BuiltChapterSection[] }[] {
  return chapters.map((chapter) => {
    const chapterPages = pages.filter((p) => p.pageNumber >= chapter.pageFrom && p.pageNumber <= chapter.pageTo);
    const sections: BuiltChapterSection[] = [];
    let current = '';
    let currentPageFrom = chapter.pageFrom;
    let currentPageTo = chapter.pageFrom;
    let sectionIndex = 1;

    for (const page of chapterPages) {
      const normalised = page.text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      const paragraphs = normalised.split(/\n\n+/)
        .map((p) => p.trim())
        .filter((p) => {
          if (p.length <= 20) return false;
          if (NUMBERED_HEADER_RE.test(p)) return false; // "Unit N: ..." running header, not content
          const norm = p.replace(/[^A-Za-z ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
          return !noiseTexts.has(norm); // drop running-header/exercise-label/watermark lines
        });

      for (const para of paragraphs) {
        if (current.length + para.length > MAX_SECTION_CHARS && current.length > 0) {
          sections.push({ section: `Section ${sectionIndex}`, pageFrom: currentPageFrom, pageTo: currentPageTo, content: current.trim() });
          sectionIndex++;
          current = para;
          currentPageFrom = page.pageNumber;
        } else {
          current = current ? `${current}\n\n${para}` : para;
        }
        currentPageTo = page.pageNumber;
      }
    }
    if (current.trim()) {
      sections.push({ section: `Section ${sectionIndex}`, pageFrom: currentPageFrom, pageTo: currentPageTo, content: current.trim() });
    }

    return { chapterNo: chapter.chapterNo, sections };
  });
}
