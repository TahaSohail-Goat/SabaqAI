// Urdu 10 — first real ingest, correct boundaries from the start.
//
// New SSC-II arts-subject textbook (174 pages, a poetry/prose anthology, same structure as
// Urdu 11). A real ToC exists (page 6) but was too OCR-garbled to parse cleanly even at 300 DPI
// (the fix in src/lib/crawler/ocr.ts's OCR_DPI_URDU, applied to this book too). The automatic
// dry-run found zero chapter headings, for the same reason as every Urdu book this batch: the
// header-clustering algorithm looks for an ALL-CAPS running header, a concept that doesn't
// exist in Urdu script.
//
// Boundaries confirmed via the same recurring SLO-style intro phrase used for Urdu 11/12
// ("...کے بعد طلبہ اس قابل ہو جائیں گے کہ...", OCR'd with heavy variation every time —
// several distinct spellings of "قابل"/"تقایل" and "جائیں"/"ائیں"/"ایں" all had to be searched
// for to find every real instance, confirmed by reading each candidate page directly rather
// than trusting one exact string match).
//   Lesson 1:  7    Lesson 5: 114   Lesson 9:  146
//   Lesson 2:  16   Lesson 6: 119   Lesson 10: 153
//   Lesson 3:  44   Lesson 7: 128   Lesson 11: 159
//   Lesson 4:  69   Lesson 8: 135
// Pages 1-6 are cover/preface/ToC; page 174 is a short "About the Author"-style back matter
// page — both excluded. All 11 lessons partition pages 7-173 with zero gaps or overlaps
// (verified: sum of per-lesson page counts + front matter + back matter = 174, the exact total).
// As with Urdu 11, printed lesson titles could not be reliably OCR'd at this scan quality, so
// lessons are labelled generically ("Lesson N") rather than guessing unverifiable title text.
//
//   npx tsx scripts/crawler-verify/_ingest-urdu10-real-pdf.ts

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

const OCR_CHECKSUM = 'f7501555017c34b71063443bf800022f5f4136382ea3a8ae95244c78fb1fc12b';
const PDF_CACHE_PATH = 'data/.pdf-cache/e2b3973c1cc2d4d9c1fcf37db2c40ad6a08c81f3fc6f5961238cbbdadd226dfa.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 10, subject: 'urdu' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Lesson 1', pageFrom: 7 },
  { chapterNo: 2, chapterTitle: 'Lesson 2', pageFrom: 16 },
  { chapterNo: 3, chapterTitle: 'Lesson 3', pageFrom: 44 },
  { chapterNo: 4, chapterTitle: 'Lesson 4', pageFrom: 69 },
  { chapterNo: 5, chapterTitle: 'Lesson 5', pageFrom: 114 },
  { chapterNo: 6, chapterTitle: 'Lesson 6', pageFrom: 119 },
  { chapterNo: 7, chapterTitle: 'Lesson 7', pageFrom: 128 },
  { chapterNo: 8, chapterTitle: 'Lesson 8', pageFrom: 135 },
  { chapterNo: 9, chapterTitle: 'Lesson 9', pageFrom: 146 },
  { chapterNo: 10, chapterTitle: 'Lesson 10', pageFrom: 153 },
  { chapterNo: 11, chapterTitle: 'Lesson 11', pageFrom: 159 },
];
const BOOK_LAST_PAGE = 173;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Urdu 10.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-11) before ingesting...');
  for (const c of detected) {
    await resetChapterSource(admin, { ...FIXTURE, chapterNo: c.chapterNo, sourceType: 'textbook', language: 'ur' });
  }
  console.log('Reset complete.\n');

  for (const { chapterNo, sections } of chapterSections) {
    if (sections.length === 0) {
      console.log(`Ch.${chapterNo}: 0 sections produced, skipping.`);
      continue;
    }
    const chapter = detected.find((c) => c.chapterNo === chapterNo)!;

    const doc: SourceDocument = { ...FIXTURE, chapterNo, chapterTitle: chapter.chapterTitle, sourceType: 'textbook', language: 'ur', sections };

    const chapterPdf = await rebuildChapterPdf(pdfBuf, chapter.pageFrom, chapter.pageTo);
    const storagePath = sourcePdfPath({ ...FIXTURE, sourceType: 'textbook', chapterNo, language: 'ur' });
    await uploadSourcePdf(admin, storagePath, chapterPdf);

    const result = await ingestDocument(admin, doc, { embedRetry: EMBED_RETRY });
    console.log(`Ch.${chapterNo} "${chapter.chapterTitle}" (pages ${chapter.pageFrom}-${chapter.pageTo}) -> ${result.chunksWritten}/${result.chunksReceived} chunk(s), PDF ${(chapterPdf.length / 1024 / 1024).toFixed(1)}MB`);

    const { data: chapterRow } = await admin.from('chapters').select('id')
      .eq('board_code', FIXTURE.board).eq('class_level', FIXTURE.classLevel).eq('subject_code', FIXTURE.subject).eq('chapter_no', chapterNo)
      .maybeSingle();
    if (chapterRow) {
      await admin.from('chapter_sources').update({ storage_path: storagePath })
        .eq('chapter_id', chapterRow.id).eq('source_type', 'textbook').eq('language_code', 'ur');
    }
  }

  console.log('\nDone. Urdu 10 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
