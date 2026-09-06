// Phase 3, real ingest — extracts Pakistan Studies and Islamiyat (New curriculum) from the
// real 2024 SSC-I "Compulsory+Science+General" bundle and ingests them as past_paper
// documents, using the exact same textToSourceDocument()/ingestDocument() path Phase 2 already
// proved for the clean per-subject matrix. These two subjects have NO clean per-subject source
// anywhere on fbise.edu.pk (confirmed during Phase 2 research) — this bundle is the only real
// source, and it required rotation-corrected OCR + boundary detection to reach (see
// _phase3-sample-bundle-ocr.ts for how the OCR was produced, and the accompanying research
// notes for how these page ranges were confirmed against the real, rotation-corrected text).
//
// Deliberately does NOT touch physics/chemistry/biology/english/mathematics/computer_science
// from this same bundle — those subjects/year/class are already ingested from the clean matrix
// (Phase 2) via cleaner, born-digital source PDFs; re-ingesting a noisier OCR'd version of the
// same (subject, class, year) would silently overwrite that already-verified content via
// resetChapterSource, for strictly worse text. Not run here — not a bug, a deliberate scope cut.
//
//   npx tsx scripts/crawler-verify/_phase3-bundle-extract-islamiyat-pakstudies.ts

import fs from 'node:fs';
import path from 'node:path';
process.loadEnvFile(path.join(process.cwd(), '.env.local'));

import { requireServiceRoleClient } from '../../src/lib/supabase/admin';
import { textToSourceDocument } from '../../src/lib/crawler/structure/flat-document';
import { resetChapterSource, ingestDocument } from '../../src/lib/crawler/ingest-adapter';
import type { OcrPage } from '../../src/lib/crawler/ocr';

const CHECKSUM = '09e564141f72d188d81bc16a9d1d93911c0d13b92cb150ca93c2af9334891867-rotfix';
const YEAR = 2024;
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

// Page ranges confirmed against the real rotation-corrected OCR (see conversation notes) —
// each subject's boilerplate header ("Time allowed: ... SUBJECT SSC-I ... Total Marks ...")
// was located, consecutive same-subject/same-qualifier detections merged as one B/D
// randomized-order variant pair, and Islamiyat's "(New)" vs "(Old Syllabus)" curricula kept
// separate since they are genuinely different content, not a repeat.
const SECTIONS: { subject: 'pakistan_studies' | 'islamiyat'; pageFrom: number; pageTo: number }[] = [
  // p29 turned out to be Physics's separate, short "Section A" objective leaflet — these are
  // physically scanned as their own component, not always adjacent to their subject's main
  // Section B/C booklet, so a subject's OWN Section-A leaflet doesn't necessarily sit right
  // after its B/C pages either (same class of issue as Islamiyat's New/Old boundary below).
  // Verified 23-28 is clean (no other subject's text) before narrowing from the original 23-30.
  // Widened to 21-28 after a later, more thorough pass found Pakistan Studies has its OWN
  // separately-scanned Section-A leaflet at p21 (missed on the first manual check, which only
  // verified 23-28's own cleanliness and never looked earlier) — confirmed by reading p21
  // directly ("PAKISTAN STUDIES SSC.-1 ... SECTION ~ A"), not assumed from the pattern alone.
  { subject: 'pakistan_studies', pageFrom: 21, pageTo: 28 },
  // "(New)" curriculum only, not "(Old Syllabus)". The clean header-detection regex found the
  // Old Syllabus's own cover page at p79, but manual inspection (its header text is garbled by
  // an overlapping MCQ bubble-sheet on that specific page) showed the real transition is p77,
  // not p79 — p77 already reads "ISLAMIYAT COMPULSORY ... OLD" once you look past the garbling,
  // and p78 is blank. Narrowed to 71-76 after finding and verifying this by hand; do not widen
  // back to 78 without re-checking p77's content first.
  { subject: 'islamiyat', pageFrom: 71, pageTo: 76 },
];

async function main() {
  const admin = requireServiceRoleClient();

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${CHECKSUM}.json`), 'utf8'));
  console.log(`Loaded ${pages.length} cached OCR page(s) for the sample bundle.`);

  for (const { subject, pageFrom, pageTo } of SECTIONS) {
    const text = pages
      .filter((p) => p.pageNumber >= pageFrom && p.pageNumber <= pageTo)
      .map((p) => p.text)
      .join('\n\n');
    console.log(`\n${subject}: pages ${pageFrom}-${pageTo}, ${text.length} chars`);

    const doc = textToSourceDocument(
      text,
      { board: 'FBISE', classLevel: 9, subject, sourceType: 'past_paper', language: 'en', year: YEAR },
      YEAR
    );
    console.log(`  Parsed -> ${doc.sections.length} section(s), "${doc.chapterTitle}"`);

    await resetChapterSource(admin, {
      board: 'FBISE', classLevel: 9, subject, chapterNo: YEAR, sourceType: 'past_paper', language: 'en',
    });
    const result = await ingestDocument(admin, doc, { embedRetry: EMBED_RETRY });
    console.log(`  Ingested -> ${result.chunksWritten}/${result.chunksReceived} chunk(s) written.`);
  }

  console.log(
    '\nDone. No PDF uploaded for either — extracting a correctly-oriented per-subject PDF ' +
    'from this bundle needs the same rotation correction applied to the rebuilt page images, ' +
    'which is new, unverified surface not worth adding under today\'s deadline. Same ' +
    'text-fallback pattern as the Math 9 fix: storage_path stays null, and the app shows ' +
    'these via its existing, already-correct text reader.'
  );
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
