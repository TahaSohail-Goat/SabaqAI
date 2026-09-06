// Urgent, one-off fix — Math 10's automatic detection undercounted chapters (8 detected) far
// more seriously than Chemistry 9's title-only issues: 3 ENTIRE chapters ("Chord and Arcs of a
// Circle", "Tangents and Angles of a Circle", "Practical Geometry of Circles") were completely
// missing, silently folded into one 100-page blob mislabeled "Applitation Of Trigenbmcterink
// Ae" (pages 161-261) — this book's "Unit N: Title" running header is far more OCR-garbled
// throughout than Chemistry 9's, so most units' headers never matched at all; the true trigger
// each time was the SAME "objectives page doesn't repeat the usual running header" gap found
// in Chemistry 9, just compounding across many more chapters in this specific book.
//
// EVERY boundary below was independently confirmed by direct inspection of the cached OCR
// (not assumed from the original 8-chapter detection or from curriculum guesses) — each
// pageFrom is where that unit's own "After studying this unit..." objectives page (or, for a
// few, a clean topic-heading page) actually begins:
//   Ch1 Complex Numbers:      p8   (was p10)
//   Ch2 Quadratic Equations:  p27  (was "Qwadrati..." p38 — clean title confirmed at p27)
//   Ch3 Matrices And Determinants: p55 (was "...National Book Foundation" p56)
//   Ch4 Linear and Quadratic Inequalities: p78 (was "Lineai" p80 — clean title at p78)
//   Ch5 Functions And Graphs: p115 (was "...Natianal Book Foundation" p120)
//   Ch6 Vector in a Plane:    p143 (was "Vectors In Plane" p153)
//   Ch7 Application of Trigonometry: p160 (was "Applitation Of Trigenbmcterink Ae" p161,
//     wrongly extending to p261 — clean "Unit-08: Application of Trigonometry" at p163)
//   Ch8 Chord and Arcs of a Circle: p196 (NEW — never detected before this fix)
//   Ch9 Tangents and Angles of a Circle: p215 (NEW)
//   Ch10 Practical Geometry of Circles: p232 (NEW)
//   Ch11 Basic Statistics: p245 (was "Batic Statistic'" p262 — clean topic heading at p245,
//     "MISCELLANEOUS EXERCISE-11" confirms the preceding chapter ends at p244)
//
//   npx tsx scripts/crawler-verify/_fix-math10-titles.ts

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

const OCR_CHECKSUM = '5b782ef881c64a62f1d0f41b9ec4e62341de619193defad046acdb9bf543cacd';
const PDF_CACHE_PATH = 'data/.pdf-cache/2265f66f1cc690081a2dccd0c196b0b5833aae66be51844207b9aec0c567ab04.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 10, subject: 'mathematics' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Complex Numbers', pageFrom: 8 },
  { chapterNo: 2, chapterTitle: 'Quadratic Equations', pageFrom: 27 },
  { chapterNo: 3, chapterTitle: 'Matrices And Determinants', pageFrom: 55 },
  { chapterNo: 4, chapterTitle: 'Linear and Quadratic Inequalities', pageFrom: 78 },
  { chapterNo: 5, chapterTitle: 'Functions And Graphs', pageFrom: 115 },
  { chapterNo: 6, chapterTitle: 'Vector in a Plane', pageFrom: 143 },
  { chapterNo: 7, chapterTitle: 'Application of Trigonometry', pageFrom: 160 },
  { chapterNo: 8, chapterTitle: 'Chord and Arcs of a Circle', pageFrom: 196 },
  { chapterNo: 9, chapterTitle: 'Tangents and Angles of a Circle', pageFrom: 215 },
  { chapterNo: 10, chapterTitle: 'Practical Geometry of Circles', pageFrom: 232 },
  { chapterNo: 11, chapterTitle: 'Basic Statistics', pageFrom: 245 },
];
const BOOK_LAST_PAGE = 300;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Math 10.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  // Old buggy ingest only ever had chapters 1-8 (with chapter 7 wrongly spanning what are now
  // chapters 7-11) — reset all 11 NEW chapter numbers to replace that cleanly, not leave stale
  // rows from the old numbering alongside the new one.
  console.log('\nResetting chapter_sources rows (chapters 1-11) before re-ingesting...');
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
