// Urdu 12 — first real ingest, correct boundaries from the start.
//
// New HSSC-II arts-subject textbook (176 pages). Unlike Urdu 11 (a short-poem anthology with a
// readable 19-entry ToC), this book has no numbered front-matter ToC at all — its front matter
// (pages 1-6) is a preface, and page 7 onward flows straight into real lesson content. The
// automatic dry-run found zero chapter headings, for the same reasons as every other Urdu book
// this batch: the header-clustering algorithm looks for an ALL-CAPS running header, a concept
// that doesn't exist in Urdu script.
//
// Boundaries confirmed via the same recurring SLO-style intro phrase found in Urdu 11 ("...کے
// بعد طلبہ اس قابل ہو جائیں گے کہ...", OCR'd with heavy variation each time) — found only 5
// times after page 7 (pages 18, 37, 45, 70, 112), each confirmed as a real topic transition by
// reading the surrounding content directly, plus one more late transition at page 145 (an
// idioms/vocabulary-focused final unit, a different but still real content style, confirmed by
// its own distinct repetitive glossary-style formatting starting there and continuing to the
// book's end). Lesson 1's own exact start page could not be pinned as precisely as the other
// five — no SLO-phrase marker was found for it at all, so it is set to page 7 (immediately
// after the preface) as the best-supported estimate, not a fully independently confirmed
// boundary the way lessons 2-6 are.
//   Lesson 1: 7    Lesson 3: 45   Lesson 5: 112
//   Lesson 2: 37   Lesson 4: 70   Lesson 6: 145
// Pages 1-6 are cover/preface; there is no separable back matter — the book's real content runs
// straight through to its last page. All 6 lessons partition pages 7-176 with zero gaps or
// overlaps (verified: sum of per-lesson page counts + front matter = 176, the exact total).
//
//   npx tsx scripts/crawler-verify/_ingest-urdu12-real-pdf.ts

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

const OCR_CHECKSUM = '39b721c5c778bccc90f7c97e253aec32bdb8f722049a6b9e3a6604de8c22a1ad';
const PDF_CACHE_PATH = 'data/.pdf-cache/134650c9c004ccb57a74559a786dea0f45c212e62608bf86c94c6b5fe90a7558.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 12, subject: 'urdu' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Lesson 1', pageFrom: 7 },
  { chapterNo: 2, chapterTitle: 'Lesson 2', pageFrom: 37 },
  { chapterNo: 3, chapterTitle: 'Lesson 3', pageFrom: 45 },
  { chapterNo: 4, chapterTitle: 'Lesson 4', pageFrom: 70 },
  { chapterNo: 5, chapterTitle: 'Lesson 5', pageFrom: 112 },
  { chapterNo: 6, chapterTitle: 'Lesson 6', pageFrom: 145 },
];
const BOOK_LAST_PAGE = 176;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Urdu 12.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-6) before ingesting...');
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

  console.log('\nDone. Urdu 12 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
