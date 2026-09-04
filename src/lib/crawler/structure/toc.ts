// Detects a book's own table-of-contents page(s) from its OCR'd front matter, and identifies
// which pages count as "front matter" so textbook-chapters.ts's running-header clustering
// can exclude them before it ever runs — this is the actual fix for the Math 9 bug: the old
// crawler fed the ToC page straight into the same clustering pass that finds real chapter
// headers, and the ToC page's OWN printed chapter list corrupted the Math.min()-based
// "first real occurrence" calculation for chapter 1.

import type { OcrPage } from '../ocr';

export interface TocEntry {
  titleRaw: string;
  chapterNoHint: number | null;
  pageHint: number | null;
}

export interface TocDetectionResult {
  entries: TocEntry[];
  tocPageNumbers: number[];
}

// A line that ends in a bare page number, with as little as a single space before it —
// "Kinematics .......... 35" (leader dots) and "Unit 1 Real Numbers 05" (single space, no
// leader at all — confirmed against real FBISE Math 9 OCR output, which prints its ToC this
// way) both need to match. The page's own line-density gate below (TOC_MIN_MATCHING_LINES /
// TOC_MIN_MATCH_FRACTION) is what keeps this from false-matching ordinary prose that
// happens to end in a number — a real ToC page has many such lines, a prose page has few.
const TOC_LINE_RE = /^(.{4,80}?)[\s.]{1,}(\d{1,3})\s*$/;
const LEADING_UNIT_RE = /^(?:unit|chapter)\s*[:\-–—.]?\s*(\d{1,2})\b\s*[:;.\-–—]?\s*(.*)$/i;

// A page is "ToC-shaped" if a good fraction of its lines match the pattern above — real
// prose might coincidentally have one or two lines ending in a number, but not many.
const TOC_MIN_MATCHING_LINES = 4;
const TOC_MIN_MATCH_FRACTION = 0.3;
const FRONT_MATTER_SCAN_PAGES = 15;

function parseTocLine(line: string): TocEntry | null {
  const m = line.trim().match(TOC_LINE_RE);
  if (!m) return null;
  const pageHint = parseInt(m[2], 10);
  let titleRaw = m[1].trim();
  let chapterNoHint: number | null = null;
  const unitMatch = titleRaw.match(LEADING_UNIT_RE);
  if (unitMatch) {
    chapterNoHint = parseInt(unitMatch[1], 10);
    titleRaw = unitMatch[2].trim();
  }
  if (titleRaw.length < 3) return null;
  return { titleRaw, chapterNoHint, pageHint };
}

/** Scans the first FRONT_MATTER_SCAN_PAGES pages for a ToC-shaped page. Returns null — not
 *  an error — if none is found; callers must treat that as its own explicit case (see
 *  structure/crosscheck.ts's 'no_toc_available' verdict), never silently proceed as if a
 *  clean ToC had confirmed the chapter list. */
export function detectTableOfContents(pages: OcrPage[]): TocDetectionResult | null {
  const candidatePages = pages.slice(0, FRONT_MATTER_SCAN_PAGES);
  const tocPageNumbers: number[] = [];
  const entries: TocEntry[] = [];

  for (const { pageNumber, text } of candidatePages) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const parsed = lines.map(parseTocLine).filter((e): e is TocEntry => e !== null);
    if (parsed.length >= TOC_MIN_MATCHING_LINES && parsed.length / lines.length >= TOC_MIN_MATCH_FRACTION) {
      tocPageNumbers.push(pageNumber);
      entries.push(...parsed);
    }
  }

  if (entries.length === 0) return null;
  return { entries, tocPageNumbers };
}

/** Pages to exclude from chapter-header clustering: the detected ToC page(s) themselves,
 *  plus everything before them (title page, copyright, preface — none of which prints a real
 *  chapter's own running header, but might contain shouty ALL-CAPS lines that look like one,
 *  e.g. a copyright notice or the book's own title repeated). If no ToC is found at all,
 *  returns an empty set — nothing is excluded, matching the old crawler's behavior exactly
 *  (this fix only activates when it has real evidence to act on). */
export function identifyFrontMatterPages(toc: TocDetectionResult | null): Set<number> {
  if (!toc || toc.tocPageNumbers.length === 0) return new Set();
  const lastTocPage = Math.max(...toc.tocPageNumbers);
  const excluded = new Set<number>();
  for (let p = 1; p <= lastTocPage; p++) excluded.add(p);
  return excluded;
}
