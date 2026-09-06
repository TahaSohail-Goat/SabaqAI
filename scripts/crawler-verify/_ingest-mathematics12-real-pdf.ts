// Mathematics 12 — first real ingest, correct boundaries from the start, 8 of 10 real chapters.
//
// New HSSC-II textbook. The automatic dry-run found a real, clean 10-unit ToC (page 6) but
// detected only 6 chapters - a genuine count_mismatch. Investigating directly turned up
// something different from every other book this session: this is not a detection-algorithm
// failure at all. Chapters 1-8 are present, correct, and were verified directly against the
// ToC's own page hints with zero lag on any of them. But Units 9 ("Solution of Trigonometric
// Equations") and 10 ("Numerical Methods") are genuinely ABSENT from this specific PDF - not
// merged into a neighbor, not mislabeled, just not present as teaching content anywhere in the
// file. Confirmed two ways: (1) an exhaustive keyword search for either unit's known subject
// matter (trigonometric equations, numerical methods, Newton-Raphson, bisection method) found
// zero hits anywhere in the 274 pages; (2) the ToC's own final line ("Answers, Glossary and
// Index: 290") references a page number past this PDF's actual length (274) - the printed book
// has at least 290 pages, this scan has 274, and the ~16-page gap lines up with a consolidated
// answer-key section (covering exercises 4.3 through 8.3, i.e. chapters 1-8's own exercises)
// appearing at pages 251-263 in place of where units 9-10's real content should be, followed
// directly by "About Authors" back matter at page 273. No alternate copy of this book exists on
// taleem360 (checked - only one FBISE Mathematics 12 entry is listed at all) to source pages 9
// and 10 from instead.
//
// Ingesting only the 8 chapters that are genuinely present, rather than guessing content for
// the 2 that aren't. If a more complete scan of this book ever turns up, chapters 9-10
// (Solution of Trigonometric Equations, Numerical Methods) should be added as a follow-up, not
// backfilled from a different edition.
//   Ch.1 Functions And Graphs:                              7
//   Ch.2 Limit, Continuity And Derivative:                  43
//   Ch.3 Integration:                                        89
//   Ch.4 Differential Equations:                            120
//   Ch.5 Kinematics Of Motion In A Straight Line:            140
//   Ch.6 Analytical Geometry:                                160
//   Ch.7 Conic Section:                                      182
//   Ch.8 Inverse Trigonometric Functions And Their Graphs:   230 (ends at 250, right before the
//                                                                  answer-key section - the
//                                                                  trailing 251-274 pages are
//                                                                  deliberately excluded, not
//                                                                  bundled in as back matter,
//                                                                  since they're exercise
//                                                                  answers for chapters 1-8, not
//                                                                  chapter 8's own content)
//
//   npx tsx scripts/crawler-verify/_ingest-mathematics12-real-pdf.ts

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

const OCR_CHECKSUM = 'bd6cc920c3a7e498f4d78622f9cf65ae9b0ff90e27d8189b58dc43dd47ab7632';
const PDF_CACHE_PATH = 'data/.pdf-cache/6365d924dfe1156da8f2ab956f0ff530992be8c2c509a0e6b1a2a2a0b077c1e7.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 12, subject: 'mathematics' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number; pageTo: number }[] = [
  { chapterNo: 1, chapterTitle: 'Functions And Graphs', pageFrom: 7, pageTo: 42 },
  { chapterNo: 2, chapterTitle: 'Limit, Continuity And Derivative', pageFrom: 43, pageTo: 88 },
  { chapterNo: 3, chapterTitle: 'Integration', pageFrom: 89, pageTo: 119 },
  { chapterNo: 4, chapterTitle: 'Differential Equations', pageFrom: 120, pageTo: 139 },
  { chapterNo: 5, chapterTitle: 'Kinematics Of Motion In A Straight Line', pageFrom: 140, pageTo: 159 },
  { chapterNo: 6, chapterTitle: 'Analytical Geometry', pageFrom: 160, pageTo: 181 },
  { chapterNo: 7, chapterTitle: 'Conic Section', pageFrom: 182, pageTo: 229 },
  { chapterNo: 8, chapterTitle: 'Inverse Trigonometric Functions And Their Graphs', pageFrom: 230, pageTo: 250 },
];

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Mathematics 12.`);
  console.log('NOTE: this source PDF is missing Units 9-10 (Solution of Trigonometric Equations, Numerical Methods) - ingesting only the 8 chapters actually present.\n');

  const detected: DetectedChapter[] = CHAPTERS.map((c) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: c.pageTo,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('Resetting chapter_sources rows (chapters 1-8) before ingesting...');
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

  console.log('\nDone. Mathematics 12 ingested with 8 of 10 real chapters (Units 9-10 missing from this source PDF).');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
