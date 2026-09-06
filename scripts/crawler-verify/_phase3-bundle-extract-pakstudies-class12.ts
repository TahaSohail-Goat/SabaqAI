// Phase 3, real ingest — Class 12 (HSSC-II) Pakistan Studies only. No Islamiyat here: a full-text
// search of this bundle's rotation-corrected OCR found zero mentions of "Islamiyat" anywhere
// (confirmed, not assumed) — matches real Pakistani curriculum structure, where Islamiyat is
// generally not examined at Intermediate/HSSC level at all. HSSC-I (Class 11) was checked the
// same way and had neither subject at all, so it's correctly skipped entirely.
//
// This bundle needed a NEW regex fix the SSC-level bundles never triggered: "HSSC-II" glues "H"
// directly onto "SSC" with no space, unlike "SSC-II" — the detector's subject-line regex assumed
// whitespace always preceded "SSC" literally and silently matched nothing at all here until an
// optional H? was added right before "SSC" (see the shared throwaway detector script's history).
//
// Same recurring out-of-sequence-Section-A-leaflet issue as every other bundle so far: the naive
// range (25-36) silently absorbed Physics' own separately-scanned Section-A leaflet starting at
// page 31 (its own "PHYSICS HSSC-II SECTION — A" header, verified directly) — narrowed to 25-30
// after checking pages 29-31 by hand.
//
//   npx tsx scripts/crawler-verify/_phase3-bundle-extract-pakstudies-class12.ts

import fs from 'node:fs';
import path from 'node:path';
process.loadEnvFile(path.join(process.cwd(), '.env.local'));

import { requireServiceRoleClient } from '../../src/lib/supabase/admin';
import { textToSourceDocument } from '../../src/lib/crawler/structure/flat-document';
import { resetChapterSource, ingestDocument } from '../../src/lib/crawler/ingest-adapter';
import type { OcrPage } from '../../src/lib/crawler/ocr';

const CHECKSUM = '43185b2a2c9fdda76924c9a77967580798c411008f515fa5052d37c4ec7ad76a-rotfix';
const YEAR = 2024;
const CLASS_LEVEL = 12;
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const PAGE_FROM = 25;
const PAGE_TO = 30;

async function main() {
  const admin = requireServiceRoleClient();

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${CHECKSUM}.json`), 'utf8'));
  console.log(`Loaded ${pages.length} cached OCR page(s) for the HSSC-II sample bundle.`);

  const text = pages
    .filter((p) => p.pageNumber >= PAGE_FROM && p.pageNumber <= PAGE_TO)
    .map((p) => p.text)
    .join('\n\n');
  console.log(`pakistan_studies: pages ${PAGE_FROM}-${PAGE_TO}, ${text.length} chars`);

  const doc = textToSourceDocument(
    text,
    { board: 'FBISE', classLevel: CLASS_LEVEL, subject: 'pakistan_studies', sourceType: 'past_paper', language: 'en', year: YEAR },
    YEAR
  );
  console.log(`  Parsed -> ${doc.sections.length} section(s), "${doc.chapterTitle}"`);

  await resetChapterSource(admin, {
    board: 'FBISE', classLevel: CLASS_LEVEL, subject: 'pakistan_studies', chapterNo: YEAR, sourceType: 'past_paper', language: 'en',
  });
  const result = await ingestDocument(admin, doc, { embedRetry: EMBED_RETRY });
  console.log(`  Ingested -> ${result.chunksWritten}/${result.chunksReceived} chunk(s) written.`);

  console.log('\nDone. No PDF uploaded (same text-fallback reasoning as the Class 9/10 scripts).');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
