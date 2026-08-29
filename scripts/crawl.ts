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
import { execSync, spawnSync } from 'node:child_process';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CrawlSource {
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
  const res = await fetch(url, {
    headers: {
      // Polite user-agent so the board server can identify the bot.
      'User-Agent': 'SabaqAI-Crawler/1.0 (educational; contact via github.com/TahaSohail-Goat/SabaqAI)',
    },
    signal: AbortSignal.timeout(60_000),
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

/**
 * OCR a PDF buffer by:
 *   1. Converting each page to a PNG via pdftoppm (poppler-utils)
 *   2. Running tesseract on each PNG
 *
 * Requires: poppler-utils (pdftoppm) + tesseract-ocr installed as system tools.
 * On GitHub Actions Ubuntu these are installed by the workflow step.
 * On Windows without these tools the function throws, and the caller skips the file.
 */
function extractTextOcr(pdfBuf: Buffer, language: 'en' | 'ur'): string {
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
    const ppmResult = spawnSync(
      'pdftoppm',
      ['-png', '-r', '150', tmpPdf, pngPrefix],
      { encoding: 'utf8', timeout: 120_000 }
    );
    if (ppmResult.status !== 0) {
      throw new Error(`pdftoppm failed: ${ppmResult.stderr?.trim() || 'unknown error'}`);
    }

    // Collect all generated PNG files in page order.
    const pngFiles = fs.readdirSync(tmpDir)
      .filter((f) => f.endsWith('.png'))
      .sort()
      .map((f) => path.join(tmpDir, f));

    if (pngFiles.length === 0) {
      throw new Error('pdftoppm produced no PNG files — PDF may be corrupt or empty.');
    }

    // Map language code to Tesseract language pack name.
    const tessLang = language === 'ur' ? 'urd' : 'eng';
    const textParts: string[] = [];

    for (const png of pngFiles) {
      const result = spawnSync(
        'tesseract',
        [png, 'stdout', '-l', tessLang],
        { encoding: 'utf8', timeout: 60_000 }
      );
      if (result.status === 0 && result.stdout) {
        textParts.push(result.stdout);
      }
      // Non-zero exit on a single page is non-fatal — we continue with what we have.
    }

    return textParts.join('\n\n');
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
      execSync('cmd /c npm run ingest', {
        cwd: ROOT,
        stdio: 'inherit',
      });
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
