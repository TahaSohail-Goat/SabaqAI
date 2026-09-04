// Phase 3, real ingest — Class 10 (SSC-II) counterpart to
// _phase3-bundle-extract-islamiyat-pakstudies.ts (Class 9/SSC-I). Same rationale: Pakistan
// Studies and Islamiyat have no clean per-subject source anywhere on fbise.edu.pk, so this
// bundle (rotation-corrected OCR, checksum below) is the only real source.
//
// Both page ranges required the SAME two classes of correction found on the SSC-I bundle,
// confirmed by hand before trusting them, not assumed from the pattern alone:
//  - Pakistan Studies' naive range absorbed 2 pages of Physics' separately-scanned, physically
//    out-of-sequence "Section A" objective leaflet (p29-30) — narrowed to 23-28 after checking
//    p28-31 directly (p28 blank, p29 clearly "PHYSICS SSC-II ... SECTION A", p31 the real
//    Physics Section B/C cover).
//  - Islamiyat's "(New)" vs "(Old)" curricula are two genuinely different documents. Unlike the
//    SSC-I bundle (where the qualifier sat on its own line, so the throwaway detector's merge
//    logic caught it), this bundle prints the qualifier INLINE on the same line as the subject
//    name ("ISLAMIYAT COMPULSORY (Old) SSC-II") in a way the detector regex can't match at all
//    (parentheses aren't in its subject-name character class) — so it was never even flagged as
//    a second boundary and had to be found by reading pages 71-76 directly. Real New content is
//    only 2 pages here (71-72); Old's own Section-A leaflet already starts at p73.
//
//   npx tsx scripts/crawler-verify/_phase3-bundle-extract-islamiyat-pakstudies-class10.ts

import fs from 'node:fs';
import path from 'node:path';
process.loadEnvFile(path.join(process.cwd(), '.env.local'));

import { requireServiceRoleClient } from '../../src/lib/supabase/admin';
import { textToSourceDocument } from '../../src/lib/crawler/structure/flat-document';
import { resetChapterSource, ingestDocument } from '../../src/lib/crawler/ingest-adapter';
import type { OcrPage } from '../../src/lib/crawler/ocr';

const CHECKSUM = '56f920b2376f79f2c75d1989743f8494665709e69c070562c96b24834ce5a955-rotfix';
const YEAR = 2024;
const CLASS_LEVEL = 10;
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const SECTIONS: { subject: 'pakistan_studies' | 'islamiyat'; pageFrom: number; pageTo: number }[] = [
  // Widened from 23-28 to 21-28 after finding Pakistan Studies has its own separately-scanned
  // Section-A leaflet at p21 (missed on the first manual check) — confirmed directly, p22 blank.
  { subject: 'pakistan_studies', pageFrom: 21, pageTo: 28 },
  { subject: 'islamiyat', pageFrom: 71, pageTo: 72 }, // "(New)" only, not "(Old)" (73 onward)
];

async function main() {
  const admin = requireServiceRoleClient();

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${CHECKSUM}.json`), 'utf8'));
  console.log(`Loaded ${pages.length} cached OCR page(s) for the SSC-II sample bundle.`);

  for (const { subject, pageFrom, pageTo } of SECTIONS) {
    const text = pages
      .filter((p) => p.pageNumber >= pageFrom && p.pageNumber <= pageTo)
      .map((p) => p.text)
      .join('\n\n');
    console.log(`\n${subject}: pages ${pageFrom}-${pageTo}, ${text.length} chars`);

    const doc = textToSourceDocument(
      text,
      { board: 'FBISE', classLevel: CLASS_LEVEL, subject, sourceType: 'past_paper', language: 'en', year: YEAR },
      YEAR
    );
    console.log(`  Parsed -> ${doc.sections.length} section(s), "${doc.chapterTitle}"`);

    await resetChapterSource(admin, {
      board: 'FBISE', classLevel: CLASS_LEVEL, subject, chapterNo: YEAR, sourceType: 'past_paper', language: 'en',
    });
    const result = await ingestDocument(admin, doc, { embedRetry: EMBED_RETRY });
    console.log(`  Ingested -> ${result.chunksWritten}/${result.chunksReceived} chunk(s) written.`);
  }

  console.log('\nDone. No PDF uploaded (same text-fallback reasoning as the Class 9 script).');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
