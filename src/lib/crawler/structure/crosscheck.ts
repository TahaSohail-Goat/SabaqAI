// Cross-validates textbook-chapters.ts's heuristic detection against the book's own table
// of contents (structure/toc.ts) — the automatic sanity check that would have caught the
// Math 9 bug on its own: a missing chapter is a COUNT mismatch, not something that requires
// a human to notice by inspecting the output after the fact.

import type { DetectedChapter } from './textbook-chapters';
import type { TocEntry } from './toc';

export type CrossCheckVerdict = 'match' | 'count_mismatch' | 'low_title_similarity' | 'no_toc_available';

export interface DisputedChapter {
  index: number;
  detectedTitle: string;
  tocTitle: string;
  similarity: number;
}

export interface CrossCheckResult {
  verdict: CrossCheckVerdict;
  detectedCount: number;
  tocCount: number | null;
  disputed: DisputedChapter[];
}

/** Normalised token-set Jaccard similarity — lowercased, punctuation-stripped word sets.
 *  0 = no shared words, 1 = identical word sets. Deliberately not edit-distance: OCR errors
 *  on a few characters within otherwise-matching words shouldn't dominate the score the way
 *  they would for a strict string comparison. */
function titleSimilarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean));
  const setA = words(a);
  const setB = words(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

// Calibrated in Phase 1's own torture test against the 4 already-correct books' real title
// pairs (see scripts/crawler-verify/) — not asserted as a final number without checking it
// against real data first.
export const TITLE_SIMILARITY_THRESHOLD = 0.4;

/** A book's own ToC page lists more than just its numbered chapters — back matter like
 *  "Answers", "Glossary", or "Tables of Logarithms" is real ToC content but was never going
 *  to correspond to a DetectedChapter, and comparing counts against the raw ToC length
 *  would report a false count_mismatch for a perfectly correct detection (confirmed against
 *  real FBISE Math 9 output: ToC has 13 lines — 11 real units plus "Answers" and
 *  "Tables of..." — while chapter detection correctly finds 11).
 *
 *  Only filters when the ToC's own style makes that inference safe: if a MAJORITY of entries
 *  parsed with a leading "Unit N"/"Chapter N" number, entries WITHOUT one are almost
 *  certainly back matter, not a differently-styled chapter title, so they're dropped. If the
 *  book's ToC doesn't use numbered prefixes at all (no entry has a hint), every entry is kept
 *  as-is — there's no safe signal to filter by, and dropping everything would be wrong. */
function filterToChapterEntries(toc: TocEntry[]): TocEntry[] {
  const withHint = toc.filter((e) => e.chapterNoHint !== null);
  if (withHint.length === 0 || withHint.length < toc.length / 2) return toc;
  return withHint;
}

export function crossCheckChapters(detected: DetectedChapter[], rawToc: TocEntry[] | null): CrossCheckResult {
  const toc = rawToc === null ? null : filterToChapterEntries(rawToc);
  if (toc === null) {
    return { verdict: 'no_toc_available', detectedCount: detected.length, tocCount: null, disputed: [] };
  }

  if (detected.length !== toc.length) {
    return { verdict: 'count_mismatch', detectedCount: detected.length, tocCount: toc.length, disputed: [] };
  }

  const disputed: DisputedChapter[] = [];
  detected.forEach((chapter, i) => {
    const similarity = titleSimilarity(chapter.chapterTitle, toc[i].titleRaw);
    if (similarity < TITLE_SIMILARITY_THRESHOLD) {
      disputed.push({ index: i, detectedTitle: chapter.chapterTitle, tocTitle: toc[i].titleRaw, similarity });
    }
  });

  if (disputed.length > 0) {
    return { verdict: 'low_title_similarity', detectedCount: detected.length, tocCount: toc.length, disputed };
  }

  return { verdict: 'match', detectedCount: detected.length, tocCount: toc.length, disputed: [] };
}
