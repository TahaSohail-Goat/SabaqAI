// Math 9 real-PDF backfill — replaces the earlier text-fallback interim fix
// (_urgent-math9-textonly-ingest.ts, storage_path left null) with the full, proper treatment:
// real rebuilt per-chapter PDFs, now that the Google Drive quota that originally blocked this
// has cleared (confirmed: today's fresh download hashes byte-identical to the cached OCR,
// ee83974f81be8605537c4c07a899f4852e4206bf13c744bf4c36ab8d2c345a88).
//
// While preparing this, re-checked Math 9's boundaries the same careful way as Chemistry 9/
// Math 10/Biology 9 (all three needed real corrections despite looking fine at a glance) —
// Math 9 turned out to have the SAME class of bug, just smaller: 10 of its 11 chapters were
// each off by 1-2 pages (their own "In this unit the students will be able to:" objectives
// page was consistently attributed to the end of the PRECEDING chapter). This time there's a
// clean, fully legible table of contents on page 4 with real page numbers for every unit, and
// it agrees with direct inspection for all 11 chapters exactly — used here as the authoritative
// source, not just a soft cross-check:
//   Unit 1 Real Numbers: 5     Unit 2 Logarithms: 26           Unit 3 Sets and Relations: 45
//   Unit 4 Factorization and Algebraic Manipulation: 69         Unit 5 Linear Equations and
//   Inequalities: 99          Unit 6 Trigonometry and Bearing: 113
//   Unit 7 Coordinate Geometry: 144                             Unit 8 Geometry of Straight
//   Lines: 158                Unit 9 Geometry and Polygons: 186
//   Unit 10 Practical Geometry: 228                             Unit 11 Basic Statistics: 238
// (the previously-ingested text-fallback version used 6,27,46,70,100,114,145,159,187,229,240 —
// each 1-2 pages late, same as this session's other three textbook fixes.)
//
// Title overrides (residual OCR-noise fragments the automated watermark stripper couldn't
// fully catch, cross-referenced against the book's own ToC) are unchanged from the original
// urgent fix — that part was already correct, only the page boundaries needed correcting.
//
//   npx tsx scripts/crawler-verify/_backfill-math9-real-pdf.ts

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

const OCR_CHECKSUM = 'ee83974f81be8605537c4c07a899f4852e4206bf13c744bf4c36ab8d2c345a88';
const PDF_PATH = 'C:\\Users\\hp\\AppData\\Local\\Temp\\math9.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 9, subject: 'mathematics' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const TITLE_OVERRIDES: Record<number, string> = {
  3: 'Sets And Relations',
  4: 'Factorization And Algebraic Manipulation',
  5: 'Linear Equations And Inequalities',
  6: 'Trigonometry And Bearing',
  8: 'Geometry Of Straight Lines',
  9: 'Geometry And Polygons',
  10: 'Practical Geometry',
  11: 'Basic Statistics',
};

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Real Numbers', pageFrom: 5 },
  { chapterNo: 2, chapterTitle: 'Logarithms', pageFrom: 26 },
  { chapterNo: 3, chapterTitle: TITLE_OVERRIDES[3], pageFrom: 45 },
  { chapterNo: 4, chapterTitle: TITLE_OVERRIDES[4], pageFrom: 69 },
  { chapterNo: 5, chapterTitle: TITLE_OVERRIDES[5], pageFrom: 99 },
  { chapterNo: 6, chapterTitle: TITLE_OVERRIDES[6], pageFrom: 113 },
  { chapterNo: 7, chapterTitle: 'Coordinate Geometry', pageFrom: 144 },
  { chapterNo: 8, chapterTitle: TITLE_OVERRIDES[8], pageFrom: 158 },
  { chapterNo: 9, chapterTitle: TITLE_OVERRIDES[9], pageFrom: 186 },
  { chapterNo: 10, chapterTitle: TITLE_OVERRIDES[10], pageFrom: 228 },
  { chapterNo: 11, chapterTitle: TITLE_OVERRIDES[11], pageFrom: 238 },
];
const BOOK_LAST_PAGE = 292;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Math 9.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

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

  console.log('\nDone. Math 9 now has real per-chapter PDFs, replacing the text-fallback interim fix.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
