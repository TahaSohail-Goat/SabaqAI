// FBISE Syllabus Crawler
//
// Downloads PDFs from data/crawl-sources.json, extracts text (pdf-parse for
// text-based PDFs, Tesseract OCR for scanned image PDFs), converts them into
// the SourceDocument format, writes JSON to data/source/, and then runs the
// existing ingest pipeline to embed and store in Supabase.
//
// Checksum-based deduplication: only re-processes PDFs whose SHA-256 has
// changed since the last run. State is saved in data/.crawl-state.json
// (gitignored).
//
//   npm run crawl               process all sources in data/crawl-sources.json
//   npm run crawl -- --dry-run  download + parse only; no ingest, no state write
//   npm run crawl -- --force    re-process all even if checksums match
//   npm run crawl -- --limit 3  process at most N sources (for testing)
//
// See docs/rag-architecture.md and data/source/README.md for the SourceDocument
// format that ingest expects.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';
import { requireServiceRoleClient } from '../src/lib/supabase/admin';
import { ensureSourcePdfBucket, sourcePdfPath, uploadSourcePdf } from '../src/lib/storage/source-pdfs';

// This repo's actual env file is .env.local, not .env (see scripts/backfill-pdf-storage.ts
// for the same fix and why it matters — only .env.local exists here).
for (const envFile of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(process.cwd(), envFile));
    break;
  } catch {
    // try the next candidate
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CrawlSource {
  url: string;
  board: string;
  classLevel: number;
  subject: string;
  sourceType: 'textbook' | 'past_paper' | 'model_paper';
  language: 'en' | 'ur';
  year: number | null;
  checksum: string | null;
  // comment/note fields are allowed but ignored
  comment?: string;
  note?: string;
}

interface CrawlState {
  [url: string]: {
    checksum: string;
    lastProcessed: string; // ISO timestamp
    outputFile: string;
    chunksIngested: number | null;
  };
}

interface SourceDocument {
  board: string;
  classLevel: number;
  subject: string;
  chapterNo: number;
  chapterTitle: string;
  sourceType: 'textbook' | 'past_paper' | 'model_paper';
  language: 'en' | 'ur';
  sections: Array<{
    section: string;
    pageFrom?: number;
    pageTo?: number;
    content: string;
  }>;
}

// ─── Paths ───────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const SOURCES_FILE = path.join(ROOT, 'data', 'crawl-sources.json');
const STATE_FILE = path.join(ROOT, 'data', '.crawl-state.json');
const OUTPUT_DIR = path.join(ROOT, 'data', 'source');
const OCR_CACHE_DIR = path.join(ROOT, 'data', '.ocr-cache');

// ─── CLI flags ───────────────────────────────────────────────────────────────

const cliArgs = new Set(process.argv.slice(2));
const DRY_RUN = cliArgs.has('--dry-run');
const FORCE = cliArgs.has('--force');
const limitArg = process.argv.find((a) => a.startsWith('--limit'));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1] ?? process.argv[process.argv.indexOf(limitArg) + 1] ?? '99999', 10) : Infinity;

// Minimum chars from pdf-parse before we declare a PDF "image-only" and OCR it.
const TEXT_EXTRACTION_MIN_CHARS = 100;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadState(): CrawlState {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as CrawlState;
  } catch {
    return {};
  }
}

function saveState(state: CrawlState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Sanitise a string for use as a filename segment */
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function downloadPdf(url: string): Promise<Buffer> {
  // Node's fetch doesn't implement the file: scheme at all ("not implemented... yet..." from
  // undici) — so a source already downloaded and verified once (e.g. re-processing after the
  // remote host starts rate-limiting a repeat crawl in the same session) needs its own path,
  // not something fetch() can be coaxed into handling.
  if (url.startsWith('file://')) {
    return fs.readFileSync(fileURLToPath(url));
  }

  // 60s was sized for a model paper (a few hundred KB-few MB). A full textbook scan is
  // 50-100MB+ and this crawler has been hit against the same host repeatedly in one session,
  // which real hosts often throttle — 5 minutes gives real headroom for a slow/throttled large
  // download instead of aborting a transfer that was still genuinely in progress.
  const res = await fetch(url, {
    headers: {
      // Polite user-agent so the board server can identify the bot.
      'User-Agent': 'SabaqAI-Crawler/1.0 (educational; contact via github.com/TahaSohail-Goat/SabaqAI)',
    },
    signal: AbortSignal.timeout(5 * 60_000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
    throw new Error(
      `Unexpected content-type "${contentType}" for ${url}. ` +
      `The URL may have moved or redirected to an HTML page.`
    );
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/**
 * Try to extract text directly from a PDF using pdftotext (poppler-utils).
 * Returns '' for image-only PDFs (where pdftotext finds no selectable text).
 *
 * pdftotext is already required on the system for OCR (same poppler-utils package),
 * so this adds no new dependency. It also outperforms pdf-parse on complex PDFs.
 */
function extractTextDirect(pdfBuf: Buffer): string {
  // Check pdftotext is available.
  const check = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' });
  if (check.error) {
    // Not available on this system — return empty so OCR path is tried.
    // Clear message will appear when OCR is also attempted.
    return '';
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sabaq-text-'));
  const tmpPdf = path.join(tmpDir, 'input.pdf');
  const tmpTxt = path.join(tmpDir, 'output.txt');

  try {
    fs.writeFileSync(tmpPdf, pdfBuf);
    // -nopgbrk: no page break markers in output (cleaner chunking)
    // -enc UTF-8: consistent encoding
    const result = spawnSync(
      'pdftotext',
      ['-nopgbrk', '-enc', 'UTF-8', tmpPdf, tmpTxt],
      { encoding: 'utf8', timeout: 30_000 }
    );
    if (result.status !== 0) return '';
    if (!fs.existsSync(tmpTxt)) return '';
    return fs.readFileSync(tmpTxt, 'utf8');
  } catch {
    return '';
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

export interface OcrPage {
  pageNumber: number;
  text: string;
}

/** OCR is the slowest step by far (20-30+ min for a full textbook) and deterministic for an
 *  unchanged file — cached by content checksum so re-running ingestion after a code-only change
 *  (e.g. tuning chapter detection, which needs zero new OCR) doesn't repeat it. */
function loadCachedOcr(checksum: string): OcrPage[] | null {
  const cachePath = path.join(OCR_CACHE_DIR, `${checksum}.json`);
  if (!fs.existsSync(cachePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8')) as OcrPage[];
  } catch {
    return null; // corrupt cache entry — fall through to re-running OCR
  }
}

function saveCachedOcr(checksum: string, pages: OcrPage[]): void {
  fs.mkdirSync(OCR_CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(OCR_CACHE_DIR, `${checksum}.json`), JSON.stringify(pages), 'utf8');
}

/**
 * OCR a PDF buffer, page by page, by:
 *   1. Converting each page to a PNG via pdftoppm (poppler-utils)
 *   2. Running tesseract on each PNG
 * Returns one entry per page, in page order — the page boundary is real information a
 * multi-chapter textbook needs (to know which page a chapter/section actually starts on),
 * unlike a model paper's single flat block of text.
 *
 * Requires: poppler-utils (pdftoppm) + tesseract-ocr installed as system tools.
 * On GitHub Actions Ubuntu these are installed by the workflow step.
 * On Windows without these tools the function throws, and the caller skips the file.
 */
export function extractTextOcrByPage(pdfBuf: Buffer, language: 'en' | 'ur'): OcrPage[] {
  // Check that pdftoppm is available before doing any work.
  const pdftoppmCheck = spawnSync('pdftoppm', ['-v'], { encoding: 'utf8' });
  if (pdftoppmCheck.error) {
    throw new Error(
      'pdftoppm not found. Install poppler-utils to enable OCR for scanned PDFs.\n' +
      '  Ubuntu/GitHub Actions: sudo apt-get install -y poppler-utils tesseract-ocr\n' +
      '  Windows: install poppler from https://github.com/oschwartz10612/poppler-windows/releases'
    );
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sabaq-crawl-'));
  const tmpPdf = path.join(tmpDir, 'input.pdf');
  const pngPrefix = path.join(tmpDir, 'page');

  try {
    fs.writeFileSync(tmpPdf, pdfBuf);

    // Convert PDF pages → PNG images at 150 DPI (good OCR quality, manageable size).
    // pdftoppm numbers output files sequentially starting at 1 (page-1.png, page-2.png, ...),
    // matching real PDF page numbers 1:1 — that numbering is what pageNumber below reports.
    //
    // Timeout is generous (30 min) on purpose — measured directly against a real 222-page,
    // 75MB scanned textbook: still only ~half done at 10 minutes. The original 120s timeout
    // was sized for short model papers, not a full book, and was silently killing the process
    // (spawnSync reports that as status !== 0 with empty stderr — "unknown error" — which is
    // genuinely misleading: it looks like pdftoppm failed when it was actually just still
    // working and got killed mid-run).
    const ppmResult = spawnSync(
      'pdftoppm',
      ['-png', '-r', '150', tmpPdf, pngPrefix],
      { encoding: 'utf8', timeout: 30 * 60_000 }
    );
    if (ppmResult.status !== 0) {
      const killedByTimeout = ppmResult.signal != null;
      throw new Error(
        killedByTimeout
          ? `pdftoppm was killed after exceeding its timeout (30 min) — this book may be larger/slower than expected.`
          : `pdftoppm failed: ${ppmResult.stderr?.trim() || 'unknown error'}`
      );
    }

    // Collect all generated PNG files in page order. pdftoppm's default zero-padding keeps a
    // plain string sort in page order for any book under 1000 pages (page-1.png, page-2.png,
    // ..., page-10.png sorts correctly since the numeric part is padded) — real textbooks are
    // well under that.
    const pngFiles = fs.readdirSync(tmpDir)
      .filter((f) => f.endsWith('.png'))
      .sort()
      .map((f) => path.join(tmpDir, f));

    if (pngFiles.length === 0) {
      throw new Error('pdftoppm produced no PNG files — PDF may be corrupt or empty.');
    }

    // Map language code to Tesseract language pack name.
    const tessLang = language === 'ur' ? 'urd' : 'eng';
    const pages: OcrPage[] = [];

    pngFiles.forEach((png, i) => {
      const result = spawnSync(
        'tesseract',
        [png, 'stdout', '-l', tessLang],
        { encoding: 'utf8', timeout: 60_000 }
      );
      // Non-zero exit on a single page is non-fatal — record it as blank and continue rather
      // than losing the whole book's page numbering over one bad page.
      pages.push({ pageNumber: i + 1, text: result.status === 0 ? (result.stdout ?? '') : '' });
    });

    return pages;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/** Model papers don't need page tracking — one flat string is exactly what
 *  textToSourceDocument already expects. */
function extractTextOcr(pdfBuf: Buffer, language: 'en' | 'ur'): string {
  return extractTextOcrByPage(pdfBuf, language).map((p) => p.text).join('\n\n');
}

/**
 * Rebuilds a page range as a brand-new, standalone PDF — by rendering each page to a JPEG and
 * re-assembling those images into a fresh PDFDocument, not by manipulating the source PDF's own
 * structure at all.
 *
 * Why this exists, not a direct page-range extraction (pdfseparate/pdfunite, or pdf-lib loading
 * the source directly): tested both against the real pilot textbook and both failed on this
 * specific file — poppler's pdfunite refuses to merge pages carrying the source's encryption/
 * permission flags ("Unimplemented Feature: Could not merge encrypted files"), and pdf-lib's own
 * parser throws on malformed object references inside the source ("Expected instance of
 * PDFDict, but got instance of undefined") even with `ignoreEncryption: true`. Going through
 * rendered images sidesteps both failure modes entirely — pdftoppm already rasterizes this exact
 * file successfully for OCR, so reusing that same rendering path to build the output PDF next to
 * it is what verifiably closes the loop, not a variant that also breaks on the same file.
 *
 * Sized to stay well under Supabase Storage's platform-wide 100MB-and-lower free-tier file cap
 * (verified: even raising a bucket's OWN configured limit above the account's real ceiling gets
 * rejected) — 120 DPI JPEG at quality 75 measured ~180KB/page against the pilot book, so even
 * its largest chapter (34 pages) lands around 6MB, nowhere near the cap.
 */
async function rebuildChapterPdf(pdfBuf: Buffer, pageFrom: number, pageTo: number): Promise<Buffer> {
  const pdftoppmCheck = spawnSync('pdftoppm', ['-v'], { encoding: 'utf8' });
  if (pdftoppmCheck.error) {
    throw new Error('pdftoppm not found — needed to rebuild a per-chapter PDF from page images.');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sabaq-pdfrebuild-'));
  const tmpPdf = path.join(tmpDir, 'input.pdf');
  const jpgPrefix = path.join(tmpDir, 'page');

  try {
    fs.writeFileSync(tmpPdf, pdfBuf);

    const result = spawnSync(
      'pdftoppm',
      ['-jpeg', '-jpegopt', 'quality=75', '-r', '120', '-f', String(pageFrom), '-l', String(pageTo), tmpPdf, jpgPrefix],
      { encoding: 'utf8', timeout: 5 * 60_000 }
    );
    if (result.status !== 0) {
      throw new Error(`pdftoppm failed while rebuilding pages ${pageFrom}-${pageTo}: ${result.stderr?.trim() || 'unknown error'}`);
    }

    const jpgFiles = fs.readdirSync(tmpDir)
      .filter((f) => f.endsWith('.jpg'))
      .sort()
      .map((f) => path.join(tmpDir, f));
    if (jpgFiles.length === 0) {
      throw new Error(`No pages rendered for range ${pageFrom}-${pageTo}.`);
    }

    const doc = await PDFDocument.create();
    for (const jpgFile of jpgFiles) {
      const jpgBytes = fs.readFileSync(jpgFile);
      const jpg = await doc.embedJpg(jpgBytes);
      const page = doc.addPage([jpg.width, jpg.height]);
      page.drawImage(jpg, { x: 0, y: 0, width: jpg.width, height: jpg.height });
    }

    return Buffer.from(await doc.save());
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// ─── Text → SourceDocument conversion ────────────────────────────────────────
//
// Past papers / model papers are typically a single "document" — not structured
// into chapters. We treat the whole paper as one chapter (chapterNo = year or 1)
// and split it into sections at blank-line boundaries, capping each section at
// ~2000 chars so chunks are a reasonable size.

const MAX_SECTION_CHARS = 2000;

function textToSourceDocument(
  text: string,
  source: CrawlSource,
  chapterNo: number,
): SourceDocument {
  // Normalise whitespace — remove form-feeds, excess blank lines.
  const normalised = text
    .replace(/\f/g, '\n\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Split on double-newlines into paragraphs.
  const paragraphs = normalised.split(/\n\n+/).filter((p) => p.trim().length > 20);

  if (paragraphs.length === 0) {
    throw new Error('No extractable text found in PDF (all paragraphs empty after cleaning).');
  }

  // Group consecutive paragraphs into sections of ≤ MAX_SECTION_CHARS.
  const sections: SourceDocument['sections'] = [];
  let current = '';
  let sectionIndex = 1;

  for (const para of paragraphs) {
    if (current.length + para.length > MAX_SECTION_CHARS && current.length > 0) {
      sections.push({
        section: `Section ${sectionIndex}`,
        content: current.trim(),
      });
      sectionIndex++;
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim()) {
    sections.push({
      section: `Section ${sectionIndex}`,
      content: current.trim(),
    });
  }

  const yearLabel = source.year ? ` ${source.year}` : '';
  const sourceLabel = source.sourceType === 'past_paper' ? 'Past Paper' : 'Model Paper';

  return {
    board: source.board,
    classLevel: source.classLevel,
    subject: source.subject,
    chapterNo,
    chapterTitle: `${sourceLabel}${yearLabel} — ${source.subject.replace(/_/g, ' ')}`,
    sourceType: source.sourceType,
    language: source.language,
    sections,
  };
}

// ─── Textbook: page-tracked, multi-chapter conversion ────────────────────────
//
// A textbook is one PDF containing many chapters — everything above assumes one PDF is one
// chapter, which doesn't hold here. This walks OCR'd pages, detects chapter boundaries, and
// emits one SourceDocument per chapter with REAL pageFrom/pageTo per section (the model-paper
// path above never has real page numbers to give, since a whole paper's text is extracted as a
// single flat block).
//
// CALIBRATED AGAINST A REAL BOOK, not designed in the abstract — an earlier version of this
// looked for a "Chapter N" / "Unit N" numbered heading line, which turned out to be the wrong
// signal: verified directly against OCR output from the actual pilot textbook (FBISE Class 9
// Physics) that its chapter-title pages don't reliably expose a machine-readable number at all,
// while every chapter DOES print its ALL-CAPS title as a running header on nearly every one of
// its own pages (confirmed: "KINEMATICS" on pages 35,42,45,52,55,56 — a tight cluster spanning
// 21 pages). The actual usable signal is that clustering: a real chapter's running header
// occurs repeatedly within one contiguous page range and then stops, whereas a recurring
// non-chapter label — "SOLUTION" (worked-example marker), "MULTIPLE CHOICE QUESTIONS"
// (exercise-section marker) — occurs just as often but SCATTERED across the entire book
// (confirmed: "MULTIPLE CHOICE QUESTIONS" on pages 32,57,112,163,185,204 — spans 172 of 221
// pages). Distinguishing "clustered" from "scattered" by page-span is what separates real
// chapter headers from this noise; a plain frequency count can't tell them apart; a numbered-
// heading regex missed most of the real ones outright and mistook a "SOLUTION" label and a
// mid-sentence content line for chapter titles when tested against real OCR output.
//
// Given this was calibrated against ONE book, verify the printed chapter report against the
// actual table of contents on any new book before trusting it — the span/occurrence thresholds
// below are what worked for this book's chapter lengths (14-24 pages), not universal constants.

interface HeaderCandidate {
  page: number;
  /** Normalised: letters and spaces only, uppercased, collapsed whitespace. */
  text: string;
}

/** Short, mostly-uppercase lines near the top of a page — running headers (real chapter
 *  titles) and recurring feature/exercise labels (noise) look identical at this stage; the
 *  clustering step below is what tells them apart. */
function extractHeaderCandidates(pages: OcrPage[]): HeaderCandidate[] {
  const candidates: HeaderCandidate[] = [];
  for (const { pageNumber, text } of pages) {
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

// Real chapters in the calibration book spanned 14-24 pages; noise labels spanned 100+.
const MAX_CHAPTER_SPAN_PAGES = 45;
const MIN_HEADER_OCCURRENCES = 3;

interface DetectedHeader {
  text: string;
  firstPage: number;
}

function detectChapterHeaders(candidates: HeaderCandidate[]): DetectedHeader[] {
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

interface NumberedHeaderCandidate {
  page: number;
  unitNo: number;
  /** Raw captured remainder after the "Unit N"/"Chapter N" prefix — not yet cleaned/cased. */
  title: string;
}

/** Fallback for books whose running headers are printed in ordinary title case ("Unit 4:
 *  Periodic Table and Periodicity of Properties") rather than the shouty ALL-CAPS style
 *  extractHeaderCandidates looks for — its upperRatio filter rejects lines like that outright.
 *  Confirmed empirically: FBISE Chemistry 9's real scan uses exactly this style, and
 *  extractHeaderCandidates finds zero usable candidates in it. Matches an explicit "Unit N" /
 *  "Chapter N" prefix near the top of a page instead. */
// The separator after the number can have a space before it too — OCR sometimes renders
// "Unit4 : Cell Cycle" (digit glued to "Unit", then a *spaced* colon) instead of the tidier
// "Unit 4: Cell Cycle". Without \s* before the optional punctuation, that leading space stops
// the punctuation from matching at all, and the colon leaks into the captured title instead
// (confirmed against real FBISE Biology 9 OCR output — see conversation notes).
const NUMBERED_HEADER_RE = /^(?:unit|chapter)\s*[:\-–—.]?\s*(\d{1,2})\b\s*[:;.\-–—]?\s*(.*)$/i;

function extractNumberedHeaderCandidates(pages: OcrPage[]): NumberedHeaderCandidate[] {
  const candidates: NumberedHeaderCandidate[] = [];
  for (const { pageNumber, text } of pages) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 5);
    for (const line of lines) {
      const m = line.match(NUMBERED_HEADER_RE);
      if (!m) continue;
      const unitNo = parseInt(m[1], 10);
      if (unitNo < 1 || unitNo > 30) continue; // implausible for a single grade's textbook
      // Page-header designs often print a decorative vertical rule or bracket next to the
      // title (a divider before a page number, a box border) — OCR sometimes reads it as a
      // literal "|" or "{"/"}" stuck to the title's edge (confirmed on real Biology 9 output:
      // "The Science of Biology |", "Molecular Biology }"). Never legitimate inside a real
      // chapter title, so always safe to strip — unlike hyphens/commas, which do appear in
      // real titles ("Environmental Chemistry - Air") and must be left alone.
      const title = m[2].replace(/[|{}]/g, '').replace(/\s+/g, ' ').trim();
      candidates.push({ page: pageNumber, unitNo, title });
    }
  }
  return candidates;
}

/** Groups numbered-header sightings by their unit number rather than exact text — OCR
 *  truncates/garbles the title differently almost every time ("Periodic e and Periodicity of
 *  Pro", "Peri Table and Periodici f Properties", ...), so exact-text clustering (as
 *  detectChapterHeaders does for ALL-CAPS headers) would never accumulate enough occurrences of
 *  any single string. The explicit unit number is itself a much stronger, lower-noise signal
 *  than freeform shouty text, so a single genuine sighting is trusted (no occurrence minimum) —
 *  the one thing it still has to guard against is an isolated, OCR-misread digit run nowhere
 *  near the running sequence (e.g. "Unit 48" sighted once, mid-way through an already
 *  well-established "Unit 18" — almost certainly "18" misread, not a real 30-chapters-later
 *  jump), which the runningMax check below drops. */
function detectNumberedChapters(candidates: NumberedHeaderCandidate[]): DetectedHeader[] {
  const byUnit = new Map<number, NumberedHeaderCandidate[]>();
  for (const c of candidates) {
    if (!byUnit.has(c.unitNo)) byUnit.set(c.unitNo, []);
    byUnit.get(c.unitNo)!.push(c);
  }

  const perUnit = [...byUnit.entries()]
    .map(([unitNo, occurrences]) => ({
      unitNo,
      firstPage: Math.min(...occurrences.map((o) => o.page)),
      // Longest captured fragment is usually the least-truncated OCR read of the real title.
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

/** Title-cases a heading, keeping standalone Roman numerals (I, II, III, IV...) fully
 *  uppercase — e.g. "DYNAMICS II" should read "Dynamics II", not "Dynamics Ii". */
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

export function textbookPagesToSourceDocuments(
  pages: OcrPage[],
  source: CrawlSource,
): { documents: SourceDocument[]; detected: DetectedChapter[] } {
  const candidates = extractHeaderCandidates(pages);
  let headers = detectChapterHeaders(candidates);

  // ALL-CAPS running headers are one style, not the only one — FBISE Chemistry 9's real scan
  // prints "Unit N: Title" in ordinary title case instead, which extractHeaderCandidates
  // rejects outright, and detectChapterHeaders can't recover from zero/one real candidates.
  // Try the numbered-header pattern before giving up.
  if (headers.length < 2) {
    const numberedHeaders = detectNumberedChapters(extractNumberedHeaderCandidates(pages));
    if (numberedHeaders.length >= 2) headers = numberedHeaders;
  }

  if (headers.length === 0) {
    throw new Error(
      'No chapter headings detected in OCR output — the clustering thresholds likely need ' +
      "calibrating against this book's actual scan. Run with --dry-run first and inspect the OCR text."
    );
  }

  // Every detected header/label (real chapter titles AND the noise scattered throughout, like
  // "SOLUTION"/"MULTIPLE CHOICE QUESTIONS") gets filtered out of actual chunk content below —
  // otherwise a running header repeated on every page would pollute every chunk it lands in.
  const noiseTexts = new Set(candidates.map((c) => c.text));

  const lastPageNo = pages[pages.length - 1]?.pageNumber ?? 0;
  const documents: SourceDocument[] = [];
  const detected: DetectedChapter[] = [];

  headers.forEach((header, i) => {
    const pageFrom = header.firstPage;
    const pageTo = i + 1 < headers.length ? headers[i + 1].firstPage - 1 : lastPageNo;
    const chapterPages = pages.filter((p) => p.pageNumber >= pageFrom && p.pageNumber <= pageTo);

    const sections: SourceDocument['sections'] = [];
    let current = '';
    let currentPageFrom = pageFrom;
    let currentPageTo = pageFrom;
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
          return !noiseTexts.has(norm); // drop running-header/exercise-label lines from content
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
    if (sections.length === 0) return;

    const chapterNo = i + 1;
    const chapterTitle = titleCase(header.text);

    documents.push({
      board: source.board,
      classLevel: source.classLevel,
      subject: source.subject,
      chapterNo,
      chapterTitle,
      sourceType: 'textbook',
      language: source.language,
      sections,
    });
    detected.push({ chapterNo, chapterTitle, pageFrom, pageTo });
  });

  return { documents, detected };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Sabaq AI — FBISE Syllabus Crawler');
  console.log('='.repeat(60));
  if (DRY_RUN) console.log('DRY RUN — will download and parse but not ingest.\n');
  if (FORCE)   console.log('FORCE — re-processing all sources regardless of checksum.\n');

  if (!fs.existsSync(SOURCES_FILE)) {
    throw new Error(
      `Crawl manifest not found at ${SOURCES_FILE}.\n` +
      `Create it following the format in docs/rag-architecture.md.`
    );
  }

  const allSources: CrawlSource[] = JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf8')) as CrawlSource[];
  // Filter out comment-only entries (no url field).
  const sources = allSources.filter((s) => Boolean(s.url));

  if (sources.length === 0) {
    throw new Error(`No sources with a "url" field found in ${SOURCES_FILE}.`);
  }

  console.log(`Loaded ${sources.length} source(s) from crawl-sources.json`);

  const state = loadState();
  const toProcess = FORCE
    ? sources.slice(0, LIMIT === Infinity ? sources.length : LIMIT)
    : sources.filter((s) => {
        const saved = state[s.url];
        return !saved; // process if never seen
        // Note: checksum comparison happens after download when we have the actual bytes.
      }).slice(0, LIMIT === Infinity ? sources.length : LIMIT);

  if (FORCE) {
    console.log(`Processing all ${toProcess.length} source(s) (--force).\n`);
  } else {
    const skipped = sources.length - toProcess.length;
    console.log(`${skipped} previously processed, ${toProcess.length} new/unprocessed.\n`);
  }

  if (toProcess.length === 0) {
    console.log('Nothing new to process. Use --force to reprocess all.');
    return;
  }

  const admin = DRY_RUN ? null : requireServiceRoleClient();
  if (admin) await ensureSourcePdfBucket(admin);

  // chapter_sources rows don't exist until the ingest subprocess below runs, so the PDF
  // upload (which happens per-source, further down) and the DB write pointing at it (which
  // can only happen after ingest) are two separate steps — tracked here and reconciled once
  // ingest completes.
  const uploadedPdfs: {
    board: string; classLevel: number; subject: string; sourceType: string; language: string;
    chapterNo: number; storagePath: string;
  }[] = [];

  let produced = 0;
  let skippedChecksumMatch = 0;
  let failed = 0;

  // Use a simple counter per (subject, classLevel, sourceType) for chapterNo.
  const chapterCounters: Record<string, number> = {};

  for (const source of toProcess) {
    const label = `[${source.board} G${source.classLevel} ${source.subject} (${source.sourceType})]`;
    console.log(`\n${label}`);
    console.log(`  URL: ${source.url}`);

    let pdfBuf: Buffer;
    try {
      process.stdout.write('  Downloading… ');
      pdfBuf = await downloadPdf(source.url);
      console.log(`${(pdfBuf.length / 1024).toFixed(0)} KB`);
    } catch (err) {
      console.error(`  ✗ Download failed: ${(err as Error).message}`);
      failed++;
      continue;
    }

    // Checksum check — skip if PDF hasn't changed since last run.
    const checksum = sha256(pdfBuf);
    const saved = state[source.url];
    if (!FORCE && saved && saved.checksum === checksum) {
      console.log(`  ↩ Unchanged (checksum match) — skipping.`);
      skippedChecksumMatch++;
      continue;
    }

    // Textbooks: a whole scanned book, not a single-chapter paper — different extraction
    // (page-tracked OCR, skipping the direct-extraction attempt since real textbook scans have
    // no usable text layer — confirmed empirically, not assumed) and a different output shape
    // (N chapter documents instead of 1, one shared PDF upload instead of one-per-chapter).
    if (source.sourceType === 'textbook') {
      let pages: OcrPage[];
      const cached = loadCachedOcr(checksum);
      if (cached) {
        console.log(`  Reusing cached OCR output (${cached.length} page(s)) — same file, already OCR'd.`);
        pages = cached;
      } else {
        try {
          process.stdout.write('  Running OCR page-by-page (this can take several minutes for a full book)… ');
          pages = extractTextOcrByPage(pdfBuf, source.language);
          console.log(`done (${pages.length} page(s)).`);
          saveCachedOcr(checksum, pages);
        } catch (err) {
          console.error(`\n  ✗ OCR failed: ${(err as Error).message}`);
          failed++;
          continue;
        }
      }

      let documents: SourceDocument[];
      let detected: DetectedChapter[];
      try {
        ({ documents, detected } = textbookPagesToSourceDocuments(pages, source));
      } catch (err) {
        console.error(`  ✗ Chapter splitting failed: ${(err as Error).message}`);
        failed++;
        continue;
      }

      console.log(`  Detected ${detected.length} chapter(s):`);
      for (const d of detected) {
        console.log(`    Ch.${d.chapterNo} "${d.chapterTitle}" — pages ${d.pageFrom}-${d.pageTo}`);
      }

      if (DRY_RUN) {
        console.log('  DRY RUN — would write the above as data/source/*.json and upload the PDF once.');
        produced += documents.length;
        continue;
      }

      const writtenFiles: string[] = [];
      for (const doc of documents) {
        const filename = `fbise-${source.classLevel}-${slugify(source.subject)}-textbook-ch${doc.chapterNo}.json`;
        fs.writeFileSync(path.join(OUTPUT_DIR, filename), JSON.stringify(doc, null, 2), 'utf8');
        writtenFiles.push(filename);
      }
      console.log(`  Written → ${writtenFiles.length} file(s) in data/source/`);

      // One rebuilt PDF per chapter (see rebuildChapterPdf's own comment for why this goes
      // through re-rendered images rather than a direct page-range extraction of the source)
      // — uploaded at the same per-chapter path model papers already use, so no special
      // "one file, many chapters" reconciliation is needed here at all.
      for (const d of detected) {
        try {
          const chapterPdf = await rebuildChapterPdf(pdfBuf, d.pageFrom, d.pageTo);
          const storagePath = sourcePdfPath({
            board: source.board,
            classLevel: source.classLevel,
            subject: source.subject,
            sourceType: 'textbook',
            chapterNo: d.chapterNo,
          });
          await uploadSourcePdf(admin!, storagePath, chapterPdf);
          console.log(`  Ch.${d.chapterNo} PDF stored → ${storagePath} (${(chapterPdf.length / 1024 / 1024).toFixed(1)}MB)`);
          uploadedPdfs.push({
            board: source.board,
            classLevel: source.classLevel,
            subject: source.subject,
            sourceType: 'textbook',
            language: source.language,
            chapterNo: d.chapterNo,
            storagePath,
          });
        } catch (err) {
          console.error(`  ⚠ Could not store Ch.${d.chapterNo}'s PDF: ${(err as Error).message}`);
        }
      }

      state[source.url] = {
        checksum,
        lastProcessed: new Date().toISOString(),
        outputFile: writtenFiles.join(', '),
        chunksIngested: null,
      };
      saveState(state);

      produced += documents.length;
      continue;
    }

    // Extract text.
    process.stdout.write('  Extracting text… ');
    let text = extractTextDirect(pdfBuf);

    if (text.trim().length < TEXT_EXTRACTION_MIN_CHARS) {
      console.log(`direct extraction yielded ${text.trim().length} chars — falling back to OCR.`);
      process.stdout.write('  Running OCR (this may take 30–60 s)… ');
      try {
        text = extractTextOcr(pdfBuf, source.language);
        console.log(`done (${text.trim().length} chars).`);
      } catch (err) {
        console.error(`\n  ✗ OCR failed: ${(err as Error).message}`);
        failed++;
        continue;
      }
    } else {
      console.log(`${text.trim().length} chars (direct extraction).`);
    }

    if (text.trim().length < TEXT_EXTRACTION_MIN_CHARS) {
      console.error(`  ✗ Insufficient text after both extraction methods (${text.trim().length} chars). Skipping.`);
      failed++;
      continue;
    }

    // Convert to SourceDocument.
    const counterKey = `${source.classLevel}-${source.subject}-${source.sourceType}`;
    chapterCounters[counterKey] = (chapterCounters[counterKey] ?? 0) + 1;
    const chapterNo = source.year ?? chapterCounters[counterKey];

    let doc: SourceDocument;
    try {
      doc = textToSourceDocument(text, source, chapterNo);
      console.log(`  Parsed → ${doc.sections.length} section(s), chapter "${doc.chapterTitle}"`);
    } catch (err) {
      console.error(`  ✗ Conversion failed: ${(err as Error).message}`);
      failed++;
      continue;
    }

    // Write JSON output.
    const filename = `fbise-${source.classLevel}-${slugify(source.subject)}-${slugify(source.sourceType)}${source.year ? `-${source.year}` : ''}.json`;
    const outPath = path.join(OUTPUT_DIR, filename);

    if (!DRY_RUN) {
      fs.writeFileSync(outPath, JSON.stringify(doc, null, 2), 'utf8');
      console.log(`  Written → data/source/${filename}`);

      // Keep the real PDF too — /ask's document reader shows this instead of reconstructed
      // text when it's present. Non-fatal: the text pipeline above is this script's real
      // job, so an upload hiccup here shouldn't fail an otherwise-good source.
      try {
        const storagePath = sourcePdfPath({
          board: source.board,
          classLevel: source.classLevel,
          subject: source.subject,
          sourceType: source.sourceType,
          chapterNo,
        });
        await uploadSourcePdf(admin!, storagePath, pdfBuf);
        console.log(`  PDF stored → ${storagePath}`);
        uploadedPdfs.push({
          board: source.board,
          classLevel: source.classLevel,
          subject: source.subject,
          sourceType: source.sourceType,
          language: source.language,
          chapterNo,
          storagePath,
        });
      } catch (err) {
        console.error(`  ⚠ Could not store the source PDF: ${(err as Error).message}`);
      }

      // Update state.
      state[source.url] = {
        checksum,
        lastProcessed: new Date().toISOString(),
        outputFile: filename,
        chunksIngested: null, // updated after ingest
      };
      saveState(state);
    } else {
      console.log(`  DRY RUN — would write → data/source/${filename}`);
    }

    produced++;
  }

  // Summary.
  console.log('\n' + '='.repeat(60));
  console.log(`Crawl complete:`);
  console.log(`  New/updated documents produced : ${produced}`);
  console.log(`  Skipped (unchanged checksum)   : ${skippedChecksumMatch}`);
  console.log(`  Failed                         : ${failed}`);

  if (failed > 0) {
    console.log('\n⚠  Some sources failed. Check the output above for details.');
    console.log('   Common causes:');
    console.log('   - URL moved (update data/crawl-sources.json)');
    console.log('   - Board server returned HTML redirect instead of PDF');
    console.log('   - PDF is encrypted or corrupt');
  }

  // Run ingest unless dry-run or nothing was produced.
  if (!DRY_RUN && produced > 0) {
    console.log('\nRunning ingest pipeline…');
    try {
      // execSync already runs through a shell (cmd.exe on Windows, /bin/sh elsewhere), so a
      // bare "npm run ingest" resolves npm.cmd/npm correctly on both — the earlier "cmd /c"
      // prefix only worked on Windows and broke this on the GitHub Actions ubuntu-latest runner.
      execSync('npm run ingest', {
        cwd: ROOT,
        stdio: 'inherit',
      });

      // Now that ingest has created this run's chapter_sources rows, point each one at the
      // PDF already uploaded for it.
      for (const p of uploadedPdfs) {
        const { data: chapter } = await admin!
          .from('chapters')
          .select('id')
          .eq('board_code', p.board)
          .eq('class_level', p.classLevel)
          .eq('subject_code', p.subject)
          .eq('chapter_no', p.chapterNo)
          .maybeSingle();
        if (!chapter) continue;
        const chapterIds = [chapter.id];

        await admin!
          .from('chapter_sources')
          .update({ storage_path: p.storagePath })
          .in('chapter_id', chapterIds)
          .eq('source_type', p.sourceType)
          .eq('language_code', p.language);
      }
    } catch (err) {
      // execSync throws on non-zero exit. Report but don't re-throw —
      // the crawler succeeded; ingest failure is a separate problem.
      console.error('\n✗ Ingest failed. See above. Crawled files are in data/source/ — run `npm run ingest` manually.');
      process.exitCode = 1;
    }
  } else if (!DRY_RUN && produced === 0) {
    console.log('\nNo new documents — ingest skipped.');
  } else {
    console.log('\nDry run — ingest skipped.');
  }
}

main().catch((err: unknown) => {
  console.error('\nCrawler failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
