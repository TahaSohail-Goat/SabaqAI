// Urgent, one-off fix — Chemistry 9's automatic detection found 16 real chapters (a correct
// count, per a manual read of the book), but 4 titles were OCR-garbled ("Chemical Bounding",
// "Chemical Equilibhum", "Acic", a stray trailing "4" on another) and — more seriously — 3 of
// those same chapters had a genuine BOUNDARY error, not just a title one: each unit's own
// "Learning Outcomes" page (a page format that doesn't repeat the usual "Unit N: Title"
// running header this book's detector keys on) was silently attributed to the END of the
// PRECEDING unit instead of the start of its own. Confirmed by direct inspection, not assumed:
//   - Ch5 "Chemical Bonding" (not "Bounding") really starts p73, not p74 (p73 has a clean
//     "CHEMICAL BONDING" heading + its own objectives list).
//   - Ch7 "Chemical Equilibrium" (not "Equilibhum") really ENDS p142, not p150 — pages 143-150
//     are genuinely Ch8's own introduction (p143 objectives page, p144 "INTRODUCTION: You
//     often use acids and bases...").
//   - Ch8 "Acids, Bases and Salts" (not "Acic" — confirmed via a clean p146 occurrence
//     "Umit 10: Acids, Bases and Salt") really starts p143, not p151.
//   - Ch13 "Empirical Data Collection and Analysis" (the trailing "4" in the detected title is
//     real running-header text, not part of the unit name — confirmed present even in a clean
//     OCR pass) really starts p213, not p215 — pages 213-214 are genuinely Ch13's own
//     objectives/intro, not Ch12 "Biochemistry"'s.
// Chapters 1-3, 6, 9-12, 14-16 were NOT independently re-verified — taken as the detector
// found them. A full page-by-page audit of every boundary was out of scope for this fix.
//
//   npx tsx scripts/crawler-verify/_fix-chemistry9-titles.ts

import fs from 'node:fs';
import path from 'node:path';
process.loadEnvFile(path.join(process.cwd(), '.env.local'));

import { requireServiceRoleClient } from '../../src/lib/supabase/admin';
import { buildChapterSections, type DetectedChapter } from '../../src/lib/crawler/structure/textbook-chapters';
import { rebuildChapterPdf } from '../../src/lib/crawler/pdf-rebuild';
import { sourcePdfPath, uploadSourcePdf, ensureSourcePdfBucket } from '../../src/lib/storage/source-pdfs';
import { resetChapterSource, ingestDocument } from '../../src/lib/crawler/ingest-adapter';
import type { SourceDocument } from '../../src/lib/ingest/chunker';
import type { OcrPage } from '../../src/lib/crawler/ocr';

const OCR_CHECKSUM = '66114632376ddde3a9fa33c60cf0eecadc14f92ee682e1a8bcaa1221a42eee17';
const PDF_CACHE_PATH = 'data/.pdf-cache/1ecfd64ce8e2a1057212de77262fa2dda37608baeb1229e92be278324c8928f8.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 9, subject: 'chemistry' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

// pageFrom values corrected per the header comment above; pageTo of each = next chapter's
// pageFrom - 1 (computed below), last chapter's pageTo = book's final page (258).
const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Nature Of Science In Chemistry', pageFrom: 13 },
  { chapterNo: 2, chapterTitle: 'Matter', pageFrom: 18 },
  { chapterNo: 3, chapterTitle: 'Atomic Structure', pageFrom: 28 },
  { chapterNo: 4, chapterTitle: 'Periodic Table And Periodicity Of Properties', pageFrom: 49 },
  { chapterNo: 5, chapterTitle: 'Chemical Bonding', pageFrom: 73 },
  { chapterNo: 6, chapterTitle: 'Electrochemistry', pageFrom: 116 },
  { chapterNo: 7, chapterTitle: 'Chemical Equilibrium', pageFrom: 138 },
  { chapterNo: 8, chapterTitle: 'Acids, Bases and Salts', pageFrom: 143 },
  { chapterNo: 9, chapterTitle: 'Environmental Chemistry - Air', pageFrom: 154 },
  { chapterNo: 10, chapterTitle: 'Environmental Chemistry - Water', pageFrom: 167 },
  { chapterNo: 11, chapterTitle: 'Hydrocarbons', pageFrom: 197 },
  { chapterNo: 12, chapterTitle: 'Biochemistry', pageFrom: 205 },
  { chapterNo: 13, chapterTitle: 'Empirical Data Collection and Analysis', pageFrom: 213 },
  { chapterNo: 14, chapterTitle: 'Separation Techniques', pageFrom: 234 },
  { chapterNo: 15, chapterTitle: 'Qualitative Analysis', pageFrom: 238 },
  { chapterNo: 16, chapterTitle: 'Chromatography', pageFrom: 245 },
];
const BOOK_LAST_PAGE = 258;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Chemistry 9.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting old chapter_sources rows (chapters 1-16) before re-ingesting...');
  for (const c of detected) {
    await resetChapterSource(admin, { ...FIXTURE, chapterNo: c.chapterNo, sourceType: 'textbook', language: 'en' });
  }
  console.log('Reset complete.\n');

  for (const { chapterNo, sections } of chapterSections) {
    if (sections.length === 0) {
      console.log(`Ch.${chapterNo}: 0 sections produced, skipping.`);
      continue;
    }
    const chapter = detected.find((c) => c.chapterNo === chapterNo)!;

    const doc: SourceDocument = { ...FIXTURE, chapterNo, chapterTitle: chapter.chapterTitle, sourceType: 'textbook', language: 'en', sections };

    const chapterPdf = await rebuildChapterPdf(pdfBuf, chapter.pageFrom, chapter.pageTo);
    const storagePath = sourcePdfPath({ ...FIXTURE, sourceType: 'textbook', chapterNo, language: 'en' });
    await uploadSourcePdf(admin, storagePath, chapterPdf);

    const result = await ingestDocument(admin, doc, { embedRetry: EMBED_RETRY });
    console.log(`Ch.${chapterNo} "${chapter.chapterTitle}" (pages ${chapter.pageFrom}-${chapter.pageTo}) -> ${result.chunksWritten}/${result.chunksReceived} chunk(s), PDF ${(chapterPdf.length / 1024 / 1024).toFixed(1)}MB`);

    const { data: chapterRow } = await admin.from('chapters').select('id')
      .eq('board_code', FIXTURE.board).eq('class_level', FIXTURE.classLevel).eq('subject_code', FIXTURE.subject).eq('chapter_no', chapterNo)
      .maybeSingle();
    if (chapterRow) {
      await admin.from('chapter_sources').update({ storage_path: storagePath })
        .eq('chapter_id', chapterRow.id).eq('source_type', 'textbook').eq('language_code', 'en');
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
