// Mathematics 11 — first real ingest, correct boundaries from the start.
//
// New HSSC-I textbook. The automatic dry-run detection got the chapter COUNT right (9, matching
// the real ToC once its 10th entry — "Answers, Glossary and Index", back matter — is excluded),
// but every single boundary lagged behind the true start by anywhere from 1 to 24 pages (the
// worst, "Sequences and Series", lagged by 24 pages — the largest single-chapter lag found in
// any textbook this session). This book has an unusually clean, fully legible table of contents
// (page 4) whose own page hints were directly verified against the OCR: every single one landed
// exactly on that unit's own "UNIT N TITLE / After studying this unit, students will be able
// to:" opening page, with zero exceptions — used here as fully authoritative, the same way Math
// 9's own clean ToC was earlier this session:
//   Ch.1 Complex Numbers:                          5   (detected 16; 11-page lag)
//   Ch.2 Matrices And Determinants:                32  (detected 48; 16-page lag)
//   Ch.3 Vectors:                                  80  (detected 92; 12-page lag)
//   Ch.4 Sequences And Series:                     121 (detected 145; 24-page lag - largest this
//                                                        session)
//   Ch.5 Polynomials:                              161 (detected 163; 2-page lag)
//   Ch.6 Permutation And Combination:              173 (detected 174; 1-page lag)
//   Ch.7 Mathematical Induction And Binomial Theorem: 186 (detected 203; 17-page lag)
//   Ch.8 Fundamentals Of Trigonometry:             207 (detected 224; 17-page lag)
//   Ch.9 Trigonometric Functions:                  228 (detected 229; 1-page lag)
//
//   npx tsx scripts/crawler-verify/_ingest-mathematics11-real-pdf.ts

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

const OCR_CHECKSUM = 'fcec10b33ffedb8337f7c8c11ccfff32f107ec42bcaad4ab69eaade76a118740';
const PDF_CACHE_PATH = 'data/.pdf-cache/f6962fdc42ad4e766fd566c3fe08e0d9ab4feaa40881294593e8d10fa626a619.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 11, subject: 'mathematics' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Complex Numbers', pageFrom: 5 },
  { chapterNo: 2, chapterTitle: 'Matrices And Determinants', pageFrom: 32 },
  { chapterNo: 3, chapterTitle: 'Vectors', pageFrom: 80 },
  { chapterNo: 4, chapterTitle: 'Sequences And Series', pageFrom: 121 },
  { chapterNo: 5, chapterTitle: 'Polynomials', pageFrom: 161 },
  { chapterNo: 6, chapterTitle: 'Permutation And Combination', pageFrom: 173 },
  { chapterNo: 7, chapterTitle: 'Mathematical Induction And Binomial Theorem', pageFrom: 186 },
  { chapterNo: 8, chapterTitle: 'Fundamentals Of Trigonometry', pageFrom: 207 },
  { chapterNo: 9, chapterTitle: 'Trigonometric Functions', pageFrom: 228 },
];
const BOOK_LAST_PAGE = 282;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Mathematics 11.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-9) before ingesting...');
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

  console.log('\nDone. Mathematics 11 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
