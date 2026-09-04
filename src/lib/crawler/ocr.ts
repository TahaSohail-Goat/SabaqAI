// Page-by-page Tesseract OCR with checksum-keyed caching — ported from the old crawler,
// relocated. OCR is the slowest step by far (20-30+ min for a full textbook) and
// deterministic for an unchanged file, so a re-run after a code-only change (e.g. tuning
// chapter detection, which needs zero new OCR) doesn't repeat it.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { rasterizePdfToPng, cleanupRasterizedDir } from './pdf-tools';
import type { CrawlerLanguage } from './types';

export interface OcrPage {
  pageNumber: number;
  text: string;
}

const OCR_CACHE_DIR = path.join(process.cwd(), 'data', '.ocr-cache');
const OCR_DPI = 150;
// The system tessdata directory (wherever the tesseract binary is installed) only ships
// English by default on a typical Windows install — writing a new language file there would
// need admin rights on `Program Files`. Keep Urdu project-local instead; English keeps using
// tesseract's own bundled default (no --tessdata-dir needed, and none of the CI/Linux install
// paths are affected by this at all).
const PROJECT_TESSDATA_DIR = path.join(process.cwd(), 'data', '.tessdata');

function cachePath(checksum: string): string {
  return path.join(OCR_CACHE_DIR, `${checksum}.json`);
}

export function loadCachedOcr(checksum: string): OcrPage[] | null {
  const p = cachePath(checksum);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as OcrPage[];
  } catch {
    return null; // corrupt cache entry — fall through to re-running OCR
  }
}

function saveCachedOcr(checksum: string, pages: OcrPage[]): void {
  fs.mkdirSync(OCR_CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath(checksum), JSON.stringify(pages), 'utf8');
}

function tessLangFor(language: CrawlerLanguage): string {
  return language === 'ur' ? 'urd' : 'eng';
}

// Resolved once per process, not once per page — spawnSync has real overhead across a
// multi-hundred-page book. `tesseract` on bare PATH is what CI (Linux, apt-get install) and
// most Unix dev setups have; the fallback paths cover a common gap on Windows, where the
// UB-Mannheim installer doesn't always add itself to PATH even though it installs cleanly.
let cachedTesseractBinary: string | null = null;

function resolveTesseractBinary(): string {
  if (cachedTesseractBinary) return cachedTesseractBinary;

  const candidates = [
    'tesseract',
    'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
    'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe',
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Tesseract-OCR', 'tesseract.exe'),
  ];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (!probe.error) {
      cachedTesseractBinary = candidate;
      return candidate;
    }
  }
  throw new Error(
    'tesseract binary not found (tried bare `tesseract` on PATH and the common Windows install ' +
    'locations). Install it (e.g. `winget install UB-Mannheim.TesseractOCR` on Windows, or ' +
    '`apt-get install tesseract-ocr` in CI) or add it to PATH — without it, every scanned page ' +
    'would silently OCR to an empty string instead of failing loudly.'
  );
}

/** OCRs every page of a PDF, using the checksum cache when available. Never throws on a
 *  single bad page — a non-zero tesseract exit for one page is recorded as blank text
 *  rather than losing the whole book's page numbering over it. Does throw if the tesseract
 *  binary itself can't be found at all, rather than silently OCR'ing every page to "". */
export function ocrPdfByPage(pdfBuf: Buffer, checksum: string, language: CrawlerLanguage): OcrPage[] {
  const cached = loadCachedOcr(checksum);
  if (cached) return cached;

  const tesseractBin = resolveTesseractBinary();
  const { dir, pages: rasterized } = rasterizePdfToPng(pdfBuf, OCR_DPI);
  try {
    const tessLang = tessLangFor(language);
    const tessArgs = tessLang === 'urd' && fs.existsSync(path.join(PROJECT_TESSDATA_DIR, 'urd.traineddata'))
      ? ['-l', tessLang, '--tessdata-dir', PROJECT_TESSDATA_DIR]
      : ['-l', tessLang];
    const pages: OcrPage[] = rasterized.map(({ pageNumber, pngPath }) => {
      const result = spawnSync(tesseractBin, [pngPath, 'stdout', ...tessArgs], { encoding: 'utf8', timeout: 60_000 });
      return { pageNumber, text: result.status === 0 ? (result.stdout ?? '') : '' };
    });
    // A handful of individually-blank pages is plausible (a genuinely blank page in the
    // source); every page coming back blank on a multi-page document overwhelmingly means
    // tesseract itself failed on every invocation (crashed, bad args, corrupt rasterization)
    // rather than the book truly having zero recognizable text — don't memoize that as if it
    // were the real content, or a later run (once whatever broke tesseract is fixed) would
    // keep silently replaying the same poisoned empty result from cache.
    const allBlank = pages.length > 0 && pages.every((p) => p.text.trim().length === 0);
    if (!allBlank) saveCachedOcr(checksum, pages);
    return pages;
  } finally {
    cleanupRasterizedDir(dir);
  }
}

/** Flattens page-by-page OCR into one string — for flat (non-chapter-tracked) documents
 *  like model papers, where page boundaries within the paper don't matter. */
export function ocrPdfFlat(pdfBuf: Buffer, checksum: string, language: CrawlerLanguage): string {
  return ocrPdfByPage(pdfBuf, checksum, language).map((p) => p.text).join('\n\n');
}
