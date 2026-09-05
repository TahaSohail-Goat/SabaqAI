// Chemistry 12 — first real ingest, correct boundaries from the start.
//
// New HSSC-II textbook. This is the largest book (21 real chapters, 360 pages) tackled this
// session. The automatic dry-run found 21 chapters (matching the real count exactly - good
// sign, confirmed against a real table of contents on page 6) but "no table of contents
// detected" was still wrong there too (the ToC exists, just lacks visible page numbers in its
// own OCR, which is why the automated ToC parser missed it). Despite the correct chapter COUNT,
// 19 of the 21 boundaries still lagged behind the true start — only Electrochemistry and
// Hydrocarbons happened to already be correct. Every boundary below was found by direct content
// reading: most chapters open with "Student Learning Outcomes (SLOs)" bullets (sometimes with
// the ALL-CAPS title, sometimes not), a few (Ethics and Values, first chapter) open directly
// with bulleted objectives and no separate SLO label at all.
//   Ch.1  Ethics And Values In Chemistry:       7   (detected 9;   2-page lag)
//   Ch.2  Electrochemistry:                     17  (detected 17;  no lag)
//   Ch.3  Chemical Equilibria:                  49  (detected 55;  6-page lag)
//   Ch.4  Acid-Base Chemistry:                  68  (detected 73;  5-page lag)
//   Ch.5  Group 2 Elements:                     79  (detected 92;  13-page lag)
//   Ch.6  The Transition Metals:                94  (detected 97;  3-page lag)
//   Ch.7  Organic Chemistry:                    128 (detected 129; 1-page lag)
//   Ch.8  Hydrocarbons:                         143 (detected 143; no lag)
//   Ch.9  Halogenoalkanes:                      171 (detected 173; 2-page lag)
//   Ch.10 Hydroxy Compounds:                    182 (detected 187; 5-page lag)
//   Ch.11 Nitrogen Compounds:                   202 (detected 207; 5-page lag)
//   Ch.12 Polymers:                             216 (detected 219; 3-page lag)
//   Ch.13 Organic Synthesis:                    225 (detected 227; 2-page lag)
//   Ch.14 Biochemistry:                         229 (detected 238; 9-page lag)
//   Ch.15 Empirical Data Collection And Analysis: 254 (detected 255; 1-page lag)
//   Ch.16 Qualitative Analysis:                 265 (detected 267; 2-page lag)
//   Ch.17 Spectroscopy:                         273 (detected 285; 12-page lag)
//   Ch.18 Chromatography:                       293 (detected 295; 2-page lag)
//   Ch.19 Materials:                            306 (detected 307; 1-page lag)
//   Ch.20 Medicine:                             321 (detected 323; 2-page lag)
//   Ch.21 Agriculture:                          330 (detected 337; 7-page lag)
//
//   npx tsx scripts/crawler-verify/_ingest-chemistry12-real-pdf.ts

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

const OCR_CHECKSUM = '3155fafe424edc4d1e48213ea68d57c23575d95244a2e9278f8c80a1a5a331be';
const PDF_CACHE_PATH = 'data/.pdf-cache/db1ff77f1956e1bd443d5da64c92cc560dfe530c99d61a61a52fccbb66e60290.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 12, subject: 'chemistry' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Ethics And Values In Chemistry', pageFrom: 7 },
  { chapterNo: 2, chapterTitle: 'Electrochemistry', pageFrom: 17 },
  { chapterNo: 3, chapterTitle: 'Chemical Equilibria', pageFrom: 49 },
  { chapterNo: 4, chapterTitle: 'Acid-Base Chemistry', pageFrom: 68 },
  { chapterNo: 5, chapterTitle: 'Group 2 Elements', pageFrom: 79 },
  { chapterNo: 6, chapterTitle: 'The Transition Metals', pageFrom: 94 },
  { chapterNo: 7, chapterTitle: 'Organic Chemistry', pageFrom: 128 },
  { chapterNo: 8, chapterTitle: 'Hydrocarbons', pageFrom: 143 },
  { chapterNo: 9, chapterTitle: 'Halogenoalkanes', pageFrom: 171 },
  { chapterNo: 10, chapterTitle: 'Hydroxy Compounds', pageFrom: 182 },
  { chapterNo: 11, chapterTitle: 'Nitrogen Compounds', pageFrom: 202 },
  { chapterNo: 12, chapterTitle: 'Polymers', pageFrom: 216 },
  { chapterNo: 13, chapterTitle: 'Organic Synthesis', pageFrom: 225 },
  { chapterNo: 14, chapterTitle: 'Biochemistry', pageFrom: 229 },
  { chapterNo: 15, chapterTitle: 'Empirical Data Collection And Analysis', pageFrom: 254 },
  { chapterNo: 16, chapterTitle: 'Qualitative Analysis', pageFrom: 265 },
  { chapterNo: 17, chapterTitle: 'Spectroscopy', pageFrom: 273 },
  { chapterNo: 18, chapterTitle: 'Chromatography', pageFrom: 293 },
  { chapterNo: 19, chapterTitle: 'Materials', pageFrom: 306 },
  { chapterNo: 20, chapterTitle: 'Medicine', pageFrom: 321 },
  { chapterNo: 21, chapterTitle: 'Agriculture', pageFrom: 330 },
];
const BOOK_LAST_PAGE = 360;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Chemistry 12.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-21) before ingesting...');
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

  console.log('\nDone. Chemistry 12 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
