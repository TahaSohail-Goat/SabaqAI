// Sabaq AI — FBISE crawler (redesigned, Phase 1)
//
// Thin orchestrator over src/lib/crawler/*: manifest -> fetch -> extract (direct text or
// OCR) -> structural detection -> chunk -> upload -> ingest. All the real logic lives in
// those modules, each independently exercised by scripts/crawler-verify/*.ts — this file's
// only job is to wire them together in the right order per source type.
//
//   npm run crawl               process everything in data/crawl-manifest/ not yet processed
//   npm run crawl -- --dry-run  download + extract + detect only; no upload, no ingest, no state write
//   npm run crawl -- --force    re-process + re-ingest all, ignoring checksums
//   npm run crawl -- --limit 3  process at most N entries
//   npm run crawl -- --only=id1,id2   process only these manifest entry ids (any state)
//
// See the crawler redesign plan (docs/project-status.md references it) for the full phase
// history and why this replaced the old single-file crawler.

import fs from 'node:fs';
import path from 'node:path';
import { loadManifest, flattenManifest } from '../src/lib/crawler/manifest/loader';
import type { ManifestEntry, TextbookManifestEntry } from '../src/lib/crawler/types';
import { fetchManifestPdf } from '../src/lib/crawler/fetch';
import { extractTextDirect } from '../src/lib/crawler/pdf-tools';
import { ocrPdfByPage, ocrPdfFlat, type OcrPage } from '../src/lib/crawler/ocr';
import { detectTableOfContents, identifyFrontMatterPages } from '../src/lib/crawler/structure/toc';
import { detectChapters, buildChapterSections, type DetectedChapter } from '../src/lib/crawler/structure/textbook-chapters';
import { crossCheckChapters } from '../src/lib/crawler/structure/crosscheck';
import { verifyDisputedPage } from '../src/lib/crawler/structure/vision-verify';
import { buildNoiseExclusionSet } from '../src/lib/crawler/noise-filter';
import { textToSourceDocument } from '../src/lib/crawler/structure/flat-document';
import { rebuildChapterPdf } from '../src/lib/crawler/pdf-rebuild';
import { requireServiceRoleClient } from '../src/lib/supabase/admin';
import { ensureSourcePdfBucket, sourcePdfPath, uploadSourcePdf } from '../src/lib/storage/source-pdfs';
import { resetChapterSource, ingestDocument } from '../src/lib/crawler/ingest-adapter';
import type { SourceDocument } from '../src/lib/ingest/chunker';

for (const envFile of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(process.cwd(), envFile));
    break;
  } catch {
    // try the next candidate
  }
}

// ─── CLI flags ───────────────────────────────────────────────────────────────

const cliArgs = process.argv.slice(2);
const DRY_RUN = cliArgs.includes('--dry-run');
const FORCE = cliArgs.includes('--force');
const limitArg = cliArgs.find((a) => a.startsWith('--limit'));
const LIMIT = limitArg
  ? parseInt(limitArg.includes('=') ? limitArg.split('=')[1] : cliArgs[cliArgs.indexOf(limitArg) + 1], 10)
  : Infinity;
const onlyArg = cliArgs.find((a) => a.startsWith('--only='));
const ONLY_IDS = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').filter(Boolean)) : null;

// Minimum chars from direct pdftotext extraction before we declare a flat PDF "image-only"
// and OCR it instead.
const TEXT_EXTRACTION_MIN_CHARS = 100;
// Bulk re-crawl makes far more embedding calls in a shorter window than any prior run —
// retry 429s instead of failing a whole chapter over a transient rate limit.
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'data', 'source');
const STATE_FILE = path.join(ROOT, 'data', '.crawl-state.json');

// ─── State (keyed by manifest entry id, not URL — an id is stable even if a candidate URL
// changes; the old crawler's URL-keyed state couldn't say that) ─────────────────────────

interface CrawlStateEntry {
  checksum: string;
  lastProcessed: string;
  status: 'ok' | 'halted_disputed' | 'failed';
}
type CrawlState = Record<string, CrawlStateEntry>;

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

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ─── Textbook path ───────────────────────────────────────────────────────────

interface TextbookOutcome {
  status: 'ok' | 'halted';
  chaptersProduced: number;
  reason?: string;
}

async function processTextbook(
  entry: TextbookManifestEntry,
  pdfBuf: Buffer,
  checksum: string,
  admin: ReturnType<typeof requireServiceRoleClient> | null
): Promise<TextbookOutcome> {
  console.log('  Running OCR page-by-page (cached if this exact file was seen before)…');
  const pages: OcrPage[] = ocrPdfByPage(pdfBuf, checksum, entry.language);
  console.log(`  OCR complete: ${pages.length} page(s).`);

  const toc = detectTableOfContents(pages);
  const frontMatterPages = identifyFrontMatterPages(toc);
  if (toc) {
    console.log(`  Table of contents detected on page(s) ${toc.tocPageNumbers.join(', ')} — ${toc.entries.length} entr(y/ies), excluded from chapter-header clustering.`);
  } else {
    console.log('  No table of contents detected in the first 15 pages.');
  }

  let detection: { chapters: DetectedChapter[]; headerCandidateTexts: string[] };
  try {
    detection = detectChapters(pages, frontMatterPages);
  } catch (err) {
    return { status: 'halted', chaptersProduced: 0, reason: (err as Error).message };
  }

  const crossCheck = crossCheckChapters(detection.chapters, toc?.entries ?? null);
  console.log(`  Cross-check verdict: ${crossCheck.verdict} (detected ${crossCheck.detectedCount}, ToC ${crossCheck.tocCount ?? 'n/a'})`);

  if (crossCheck.verdict === 'count_mismatch' || crossCheck.verdict === 'low_title_similarity') {
    console.log('  Disputed — escalating to vision verification for the affected page(s)…');
    let allResolved = true;
    for (const d of crossCheck.disputed) {
      const chapter = detection.chapters[d.index];
      const verdict = await verifyDisputedPage({ pdfBuf, pageNumber: chapter.pageFrom, disputedTitle: d.detectedTitle });
      if (!verdict || verdict.confidence === 'low' || !verdict.isChapterStart) {
        allResolved = false;
        console.log(`    Page ${chapter.pageFrom}: vision could not confirm ("${d.detectedTitle}" vs ToC "${d.tocTitle}") — verdict: ${JSON.stringify(verdict)}`);
      } else {
        console.log(`    Page ${chapter.pageFrom}: vision confirmed as chapter start ("${verdict.title}").`);
      }
    }
    if (crossCheck.verdict === 'count_mismatch' || !allResolved) {
      return {
        status: 'halted',
        chaptersProduced: 0,
        reason: `Cross-check verdict ${crossCheck.verdict} could not be resolved automatically. ` +
          `Detected ${crossCheck.detectedCount} chapter(s), ToC has ${crossCheck.tocCount}. ` +
          `Disputed: ${JSON.stringify(crossCheck.disputed)}`,
      };
    }
  }

  console.log(`  Detected ${detection.chapters.length} chapter(s):`);
  for (const c of detection.chapters) {
    console.log(`    Ch.${c.chapterNo} "${c.chapterTitle}" — pages ${c.pageFrom}-${c.pageTo}`);
  }

  const noiseTexts = buildNoiseExclusionSet(detection.headerCandidateTexts, pages);
  const chapterSections = buildChapterSections(pages, detection.chapters, noiseTexts);

  if (DRY_RUN) {
    console.log('  DRY RUN — would write data/source/*.json, rebuild + upload per-chapter PDFs, and ingest.');
    return { status: 'ok', chaptersProduced: detection.chapters.length };
  }

  for (const { chapterNo, sections } of chapterSections) {
    if (sections.length === 0) continue;
    const chapter = detection.chapters.find((c) => c.chapterNo === chapterNo)!;

    const doc: SourceDocument = {
      board: entry.board,
      classLevel: entry.classLevel,
      subject: entry.subject,
      chapterNo,
      chapterTitle: chapter.chapterTitle,
      sourceType: 'textbook',
      language: entry.language,
      sections,
    };

    const filename = `fbise-${entry.classLevel}-${slugify(entry.subject)}-textbook-ch${chapterNo}.json`;
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, filename), JSON.stringify(doc, null, 2), 'utf8');

    if (admin) {
      const chapterPdf = await rebuildChapterPdf(pdfBuf, chapter.pageFrom, chapter.pageTo);
      const storagePath = sourcePdfPath({
        board: entry.board,
        classLevel: entry.classLevel,
        subject: entry.subject,
        sourceType: 'textbook',
        chapterNo,
        language: entry.language,
      });
      await uploadSourcePdf(admin, storagePath, chapterPdf);
      console.log(`  Ch.${chapterNo} PDF stored → ${storagePath} (${(chapterPdf.length / 1024 / 1024).toFixed(1)}MB)`);

      await resetChapterSource(admin, {
        board: entry.board, classLevel: entry.classLevel, subject: entry.subject,
        chapterNo, sourceType: 'textbook', language: entry.language,
      });
      const result = await ingestDocument(admin, doc, { force: FORCE, embedRetry: EMBED_RETRY });
      console.log(`  Ch.${chapterNo} ingested → ${result.chunksWritten}/${result.chunksReceived} chunk(s) written.`);

      const { data: chapterRow } = await admin
        .from('chapters')
        .select('id')
        .eq('board_code', entry.board).eq('class_level', entry.classLevel)
        .eq('subject_code', entry.subject).eq('chapter_no', chapterNo)
        .maybeSingle();
      if (chapterRow) {
        await admin.from('chapter_sources').update({ storage_path: storagePath })
          .eq('chapter_id', chapterRow.id).eq('source_type', 'textbook').eq('language_code', entry.language);
      }
    }
  }

  return { status: 'ok', chaptersProduced: detection.chapters.length };
}

// ─── Flat document path (model paper / past paper / marking scheme) ─────────

async function processFlatDocument(
  entry: Exclude<ManifestEntry, TextbookManifestEntry>,
  pdfBuf: Buffer,
  checksum: string,
  admin: ReturnType<typeof requireServiceRoleClient> | null
): Promise<void> {
  console.log('  Extracting text…');
  let text = extractTextDirect(pdfBuf);

  if (text.trim().length < TEXT_EXTRACTION_MIN_CHARS) {
    console.log(`  Direct extraction yielded ${text.trim().length} chars — falling back to OCR.`);
    text = ocrPdfFlat(pdfBuf, checksum, entry.language);
    console.log(`  OCR complete (${text.trim().length} chars).`);
  } else {
    console.log(`  ${text.trim().length} chars (direct extraction).`);
  }

  if (text.trim().length < TEXT_EXTRACTION_MIN_CHARS) {
    throw new Error(`Insufficient text after both extraction methods (${text.trim().length} chars).`);
  }

  const year = 'year' in entry ? entry.year : null;
  const chapterNo = year ?? new Date().getFullYear();
  const doc = textToSourceDocument(text, {
    board: entry.board, classLevel: entry.classLevel, subject: entry.subject,
    sourceType: entry.sourceType, language: entry.language, year,
  }, chapterNo);
  console.log(`  Parsed → ${doc.sections.length} section(s), "${doc.chapterTitle}"`);

  if (DRY_RUN) {
    console.log('  DRY RUN — would write data/source/*.json, upload PDF, and ingest.');
    return;
  }

  const filename = `fbise-${entry.classLevel}-${slugify(entry.subject)}-${slugify(entry.sourceType)}${year ? `-${year}` : ''}.json`;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), JSON.stringify(doc, null, 2), 'utf8');

  if (admin) {
    const storagePath = sourcePdfPath({
      board: entry.board, classLevel: entry.classLevel, subject: entry.subject,
      sourceType: entry.sourceType, chapterNo, language: entry.language,
    });
    await uploadSourcePdf(admin, storagePath, pdfBuf);
    console.log(`  PDF stored → ${storagePath}`);

    await resetChapterSource(admin, {
      board: entry.board, classLevel: entry.classLevel, subject: entry.subject,
      chapterNo, sourceType: entry.sourceType, language: entry.language,
    });
    const result = await ingestDocument(admin, doc, { force: FORCE, embedRetry: EMBED_RETRY });
    console.log(`  Ingested → ${result.chunksWritten}/${result.chunksReceived} chunk(s) written.`);

    const { data: chapterRow } = await admin
      .from('chapters')
      .select('id')
      .eq('board_code', entry.board).eq('class_level', entry.classLevel)
      .eq('subject_code', entry.subject).eq('chapter_no', chapterNo)
      .maybeSingle();
    if (chapterRow) {
      await admin.from('chapter_sources').update({ storage_path: storagePath })
        .eq('chapter_id', chapterRow.id).eq('source_type', entry.sourceType).eq('language_code', entry.language);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Sabaq AI — FBISE Crawler (redesigned)');
  console.log('='.repeat(60));
  if (DRY_RUN) console.log('DRY RUN — will download and process but not upload or ingest.\n');
  if (FORCE) console.log('FORCE — re-processing and re-ingesting regardless of checksum.\n');

  const manifest = loadManifest();
  let entries = flattenManifest(manifest);

  if (ONLY_IDS) {
    entries = entries.filter((e) => ONLY_IDS.has(e.id));
    console.log(`--only filter: ${entries.length} matching entr(y/ies).\n`);
  }

  const state = loadState();
  const toProcess = (FORCE ? entries : entries.filter((e) => {
    const saved = state[e.id];
    return !saved || saved.status !== 'ok'; // checksum comparison happens after download
  })).slice(0, LIMIT === Infinity ? entries.length : LIMIT);

  console.log(`Loaded ${entries.length} manifest entr(y/ies); ${toProcess.length} to process.\n`);
  if (toProcess.length === 0) {
    console.log('Nothing to process. Use --force to reprocess all, or --only to target specific entries.');
    return;
  }

  const admin = DRY_RUN ? null : requireServiceRoleClient();
  if (admin) await ensureSourcePdfBucket(admin);

  let produced = 0, skippedChecksum = 0, halted = 0, failed = 0;

  for (const entry of toProcess) {
    const label = `[${entry.board} G${entry.classLevel} ${entry.subject} (${entry.sourceType})] ${entry.id}`;
    console.log(`\n${label}`);

    let pdfBuf: Buffer, checksum: string;
    try {
      process.stdout.write('  Downloading… ');
      const fetched = await fetchManifestPdf(entry.candidateUrls);
      pdfBuf = fetched.buffer;
      checksum = fetched.checksum;
      console.log(`${(pdfBuf.length / 1024).toFixed(0)} KB from ${fetched.sourceUrl}`);
    } catch (err) {
      console.error(`  ✗ Download failed: ${(err as Error).message}`);
      failed++;
      state[entry.id] = { checksum: '', lastProcessed: new Date().toISOString(), status: 'failed' };
      saveState(state);
      continue;
    }

    const saved = state[entry.id];
    if (!FORCE && saved?.status === 'ok' && saved.checksum === checksum) {
      console.log('  ↩ Unchanged (checksum match) — skipping.');
      skippedChecksum++;
      continue;
    }

    try {
      if (entry.sourceType === 'textbook') {
        const outcome = await processTextbook(entry, pdfBuf, checksum, admin);
        if (outcome.status === 'halted') {
          console.error(`  ⚠ HALTED — ${outcome.reason}`);
          halted++;
          state[entry.id] = { checksum, lastProcessed: new Date().toISOString(), status: 'halted_disputed' };
          saveState(state);
          continue;
        }
        produced += outcome.chaptersProduced;
      } else {
        await processFlatDocument(entry, pdfBuf, checksum, admin);
        produced++;
      }
    } catch (err) {
      console.error(`  ✗ Processing failed: ${(err as Error).message}`);
      failed++;
      state[entry.id] = { checksum, lastProcessed: new Date().toISOString(), status: 'failed' };
      saveState(state);
      continue;
    }

    if (!DRY_RUN) {
      state[entry.id] = { checksum, lastProcessed: new Date().toISOString(), status: 'ok' };
      saveState(state);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Crawl complete:');
  console.log(`  Documents/chapters produced : ${produced}`);
  console.log(`  Skipped (unchanged checksum): ${skippedChecksum}`);
  console.log(`  Halted (needs human review) : ${halted}`);
  console.log(`  Failed                      : ${failed}`);
  if (halted > 0) {
    console.log('\n⚠ Some textbooks were halted pending human review — see the HALTED lines above.');
    console.log('  Nothing was written or ingested for those books; other entries were unaffected.');
  }
}

main().catch((err: unknown) => {
  console.error('\nCrawler failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
