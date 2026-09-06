// Identifies recurring lines that should never end up inside chunk content: running
// chapter/section headers (position-sensitive — checked near the top/bottom few lines by
// structure/textbook-chapters.ts) and book-wide noise like a watermark stamp or a repeated
// exercise-section label (position-AGNOSTIC — checked across every line on every page, with
// a much higher occurrence-fraction bar). Both feed one shared exclusion set.

import type { OcrPage } from './ocr';

function normaliseLine(line: string): string {
  return line.replace(/[^A-Za-z ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

// A real chapter header (found by structure/textbook-chapters.ts) recurs across ~14-30
// pages out of a 200-300 page book — roughly 5-10% of the whole book. This pass is tuned for
// the opposite signal: something printed on a clear majority of pages, like a watermark
// stamp or a running "National Book Foundation" footer. Confirmed against real FBISE Math 9
// OCR output: that exact phrase appears on 53.1% of its 292 pages — nowhere near "every
// single page," but a wide, safe margin above any real chapter's span, and comfortably
// caught by this threshold.
const WATERMARK_MIN_PAGE_FRACTION = 0.35;
const WATERMARK_MIN_LETTERS = 4;
// A watermark phrase is a handful of words (e.g. "National Book Foundation" = 3) — this caps
// the n-gram sliding window's work, not a hard limit on real watermark length.
const WATERMARK_MIN_NGRAM_WORDS = 2;
const WATERMARK_MAX_NGRAM_WORDS = 5;

export interface WatermarkFinding {
  text: string;
  occurrences: number;
  pageFraction: number;
}

/** Finds word n-grams (2-5 words) that recur across a high fraction of DISTINCT pages,
 *  regardless of where in a line — or which other, page-varying text — they sit. A whole-line
 *  match would miss a watermark that's concatenated onto a running header (e.g. "Unit 4
 *  Coordinate Geometry ... National Book Foundation" printed as one OCR'd line): the FULL
 *  line differs on every page since the chapter name changes, even though the trailing
 *  "National Book Foundation" sub-phrase doesn't — confirmed empirically against real FBISE
 *  Math 9 OCR output, where whole-line matching found nothing despite the phrase genuinely
 *  appearing on over half the book's pages. */
export function detectWatermarkNoise(pages: OcrPage[]): WatermarkFinding[] {
  if (pages.length === 0) return [];

  const pagesContainingPhrase = new Map<string, Set<number>>();
  for (const { pageNumber, text } of pages) {
    const words = normaliseLine(text).split(' ').filter(Boolean);
    const phrasesOnThisPage = new Set<string>();
    for (let n = WATERMARK_MIN_NGRAM_WORDS; n <= WATERMARK_MAX_NGRAM_WORDS; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const phrase = words.slice(i, i + n).join(' ');
        if (phrase.replace(/ /g, '').length < WATERMARK_MIN_LETTERS) continue;
        phrasesOnThisPage.add(phrase);
      }
    }
    for (const phrase of phrasesOnThisPage) {
      if (!pagesContainingPhrase.has(phrase)) pagesContainingPhrase.set(phrase, new Set());
      pagesContainingPhrase.get(phrase)!.add(pageNumber);
    }
  }

  const threshold = pages.length * WATERMARK_MIN_PAGE_FRACTION;
  const candidates = [...pagesContainingPhrase.entries()]
    .filter(([, pageSet]) => pageSet.size >= threshold)
    .map(([text, pageSet]) => ({ text, occurrences: pageSet.size, pageFraction: pageSet.size / pages.length }));

  // A passing 3-word phrase's own 2-word sub-phrases pass too (e.g. "NATIONAL BOOK" and "BOOK
  // FOUNDATION" out of "NATIONAL BOOK FOUNDATION") — keep only the longest phrase per
  // overlapping family so the exclusion set isn't cluttered with redundant fragments.
  candidates.sort((a, b) => b.text.length - a.text.length);
  const kept: WatermarkFinding[] = [];
  for (const c of candidates) {
    if (kept.some((k) => k.text.includes(c.text))) continue;
    kept.push(c);
  }
  return kept.sort((a, b) => b.occurrences - a.occurrences);
}

/** Builds the final noise-exclusion set chunking should drop, from whatever chapter-header
 *  candidate texts structure/textbook-chapters.ts already extracted plus this module's own
 *  watermark pass — the two are complementary (different occurrence-fraction bars, for
 *  different reasons), so both are always included. */
export function buildNoiseExclusionSet(headerCandidateTexts: string[], pages: OcrPage[]): Set<string> {
  const watermarks = detectWatermarkNoise(pages);
  return new Set([...headerCandidateTexts, ...watermarks.map((w) => w.text)]);
}

export function isNoise(paragraph: string, noiseTexts: Set<string>): boolean {
  return noiseTexts.has(normaliseLine(paragraph));
}

/** Strips a known multi-word noise phrase (e.g. a watermark like "NATIONAL BOOK FOUNDATION")
 *  out of a raw, mixed-case, punctuated string — used to clean a chapter title candidate
 *  before it's chosen, not just chunk content. Confirmed necessary against real FBISE Math 9
 *  OCR output: the numbered-header title selector picks the LONGEST captured fragment per
 *  unit, and on some page "Unit 4 Coordinate Geometry" is glued to a running watermark
 *  footer, so the unfiltered "longest" fragment is "Coordinate Geometry National Book
 *  Foundation" — never the clean title. Deliberately skips single-word noise entries: a
 *  common single word out of context is too likely to legitimately appear inside a real
 *  title (unlike a 2+ word phrase, which is specific enough to strip safely). */
export function stripNoisePhrasesFromTitle(rawTitle: string, noiseTexts: Iterable<string>): string {
  let cleaned = rawTitle;
  for (const noise of noiseTexts) {
    const words = noise.split(' ').filter(Boolean);
    if (words.length < 2) continue;
    const flexiblePattern = words.map((w) => w.toLowerCase()).join('\\s*');
    cleaned = cleaned.replace(new RegExp(flexiblePattern, 'gi'), ' ');
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}
