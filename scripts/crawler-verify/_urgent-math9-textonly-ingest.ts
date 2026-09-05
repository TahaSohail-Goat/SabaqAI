// URGENT, one-off fix: ingests Math 9's 11 correctly-detected chapters (fixing the
// historical missing-Chapter-1 bug) using already-cached OCR — no PDF download needed.
// Skips rebuildChapterPdf/upload entirely (blocked by an external Google Drive quota on the
// source PDF today); leaves storage_path null, so /api/ask/options returns pdfUrl: null and
// AskDocumentReader.tsx's existing, already-correct fallback shows these chapters via its
// plain-text reader instead of a rendered PDF. The rendered-PDF version can be backfilled
// later (once the quota clears) via the real crawl.ts orchestrator with zero re-work here —
// resetChapterSource + ingestDocument is exactly what that path does too.
//
// Resets ALL 11 target chapter numbers first (the old, buggy ingestion only ever had 10
// chapters — 1 through 10 — since real chapter 1 was merged into a mislabeled "chapter 2"),
// so this replaces the old wrong set cleanly rather than leaving stale rows alongside it.
//
//   npx tsx scripts/crawler-verify/_urgent-math9-textonly-ingest.ts

import fs from 'node:fs';
import path from 'node:path';
process.loadEnvFile(path.join(process.cwd(), '.env.local'));

import { requireServiceRoleClient } from '../../src/lib/supabase/admin';
import { detectTableOfContents, identifyFrontMatterPages } from '../../src/lib/crawler/structure/toc';
import { detectChapters, buildChapterSections } from '../../src/lib/crawler/structure/textbook-chapters';
import { buildNoiseExclusionSet } from '../../src/lib/crawler/noise-filter';
import { resetChapterSource, ingestDocument } from '../../src/lib/crawler/ingest-adapter';
import type { SourceDocument } from '../../src/lib/ingest/chunker';
import type { OcrPage } from '../../src/lib/crawler/ocr';

const CHECKSUM = 'ee83974f81be8605537c4c07a899f4852e4206bf13c744bf4c36ab8d2c345a88';
const FIXTURE = { board: 'FBISE', classLevel: 9, subject: 'mathematics' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

// Manual cleanup for the 2 titles that still carry OCR-noise fragments the automated
// watermark stripper couldn't fully remove (confirmed by direct comparison against the
// book's own table of contents during Phase 1 testing) — everything else is used as
// detected. This is a one-off manual override for this urgent fix specifically, not a
// permanent part of the pipeline; the real fix (better watermark-fragment matching to
// survive more OCR variants) stays a Phase 1 follow-up.
const TITLE_OVERRIDES: Record<number, string> = {
  3: 'Sets And Relations',
  5: 'Linear Equations And Inequalities',
  4: 'Factorization And Algebraic Manipulation',
  6: 'Trigonometry And Bearing',
  8: 'Geometry Of Straight Lines',
  9: 'Geometry And Polygons',
  10: 'Practical Geometry',
  11: 'Basic Statistics',
};

async function main() {
  const admin = requireServiceRoleClient();

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${CHECKSUM}.json`), 'utf8'));
  console.log(`Loaded ${pages.length} cached OCR page(s) for Math 9.`);

  const toc = detectTableOfContents(pages);
  const frontMatterPages = identifyFrontMatterPages(toc);
  const { chapters, headerCandidateTexts } = detectChapters(pages, frontMatterPages);
  console.log(`Detected ${chapters.length} chapter(s).`);
  if (chapters.length !== 11) {
    throw new Error(`Expected 11 chapters, detected ${chapters.length} — aborting rather than ingesting an unexpected shape.`);
  }

  const noiseTexts = buildNoiseExclusionSet(headerCandidateTexts, pages);
  const chapterSections = buildChapterSections(pages, chapters, noiseTexts);

  console.log('\nResetting old chapter_sources rows (chapters 1-11) before re-ingesting…');
  for (let chapterNo = 1; chapterNo <= 11; chapterNo++) {
    await resetChapterSource(admin, { ...FIXTURE, chapterNo, sourceType: 'textbook', language: 'en' });
  }
  console.log('Reset complete.\n');

  for (const { chapterNo, sections } of chapterSections) {
    if (sections.length === 0) {
      console.log(`Ch.${chapterNo}: 0 sections produced, skipping.`);
      continue;
    }
    const chapter = chapters.find((c) => c.chapterNo === chapterNo)!;
    const title = TITLE_OVERRIDES[chapterNo] ?? chapter.chapterTitle;

    const doc: SourceDocument = {
      ...FIXTURE,
      chapterNo,
      chapterTitle: title,
      sourceType: 'textbook',
      language: 'en',
      sections,
    };

    const result = await ingestDocument(admin, doc, { embedRetry: EMBED_RETRY });
    console.log(`Ch.${chapterNo} "${title}" (pages ${chapter.pageFrom}-${chapter.pageTo}) → ${result.chunksWritten}/${result.chunksReceived} chunk(s) written.`);
  }

  console.log('\nDone. storage_path is null for all 11 — the app will show these via the text-fallback reader until the PDF can be backfilled once the Google Drive quota clears.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
