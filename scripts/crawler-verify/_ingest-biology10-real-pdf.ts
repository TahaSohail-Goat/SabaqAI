// Biology 10 — first real ingest, correct boundaries from the start.
//
// New textbook (see textbooks.json's comment — Class 10 science was entirely missing from the
// manifest until 2026-09-04). The automatic pipeline HALTED this one on its own dry run:
// crossCheckChapters reported count_mismatch (10 detected vs. 12 ToC entries) and refused to
// guess — exactly the fail-loud behavior it's designed for. Investigated directly:
//
// 1. The book's ToC (page 6) has 12 lines, but the 12th is "Glossary" (page 155) — back matter,
//    not a real numbered chapter. The ToC parser has no way to know that, so it reported 12
//    where the real chapter count is 11. This is a real, if narrow, gap in the ToC-vs-detector
//    count check worth knowing about for future books (an appendix/glossary/index entry in a
//    ToC will always trigger a false count_mismatch) — not fixed here since a single-book
//    workaround isn't worth the risk of a rushed regex change to shared crosscheck.ts today.
// 2. Of the 11 real chapters, the automatic header-clustering detector had massively larger
//    lags than any other book this session (up to 12 pages, vs. 1-5 elsewhere) — big enough
//    that it fully swallowed one entire chapter ("Diseases", ToC entry 8) into the tail of the
//    chapter before it ("Inheritance"), the same failure mode Math 10 had for 3 chapters.
//    Likely cause: this book's SLOs carry bracketed codes like [B-10-R-01] grouped under
//    broader lettered "units" (R, G, H, I, J, K) that the header clustering wasn't tuned for.
// 3. Every one of the 11 corrected boundaries below was found directly: each real chapter opens
//    with its own ALL-CAPS title followed by "SLOs: After completing this lesson..." — and
//    every single one of those 11 SLO-page numbers matches this book's own ToC page hint
//    exactly (unlike Chemistry 10's ToC, which was too garbled to fully trust) — used here as
//    authoritative, the same way Math 9's clean ToC was:
//   Ch.1  Digestive System:                 7   (detected 17;  10-page lag — largest this session)
//   Ch.2  Circulatory System:                19  (detected 23;  4-page lag)
//   Ch.3  Respiratory System:                35  (detected 44;  9-page lag)
//   Ch.4  Urinary System:                    49  (detected 56;  7-page lag)
//   Ch.5  Nervous System:                    60  (detected 68;  8-page lag)
//   Ch.6  Animal Reproduction:               78  (detected 79;  1-page lag)
//   Ch.7  Inheritance:                       90  (detected 102; 12-page lag)
//   Ch.8  Diseases:                          103 (detected: not found at all — merged into
//                                                  the detector's over-wide "Inheritance" span)
//   Ch.9  Immunity And The Immune System:    115 (detected 116; 1-page lag — SLO page precedes
//                                                  the "Chapter 9 ..." intro page, same layout
//                                                  as Ch.6 Animal Reproduction above)
//   Ch.10 Biotechnology:                     125 (detected 130; 5-page lag)
//   Ch.11 Biostatistics And Data Handling:   143 (detected 147; 4-page lag; ToC itself says
//                                                  "Biostatistics and data analysis" but the
//                                                  chapter's own clean printed title is used)
// Chapter 11 runs to the end of the book (166), which includes the trailing Glossary (155-166)
// bundled in rather than cut out — consistent with how every other book's trailing back matter
// (answer keys, appendices) was implicitly included in its last chapter, not specially excluded.
//
//   npx tsx scripts/crawler-verify/_ingest-biology10-real-pdf.ts

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

const OCR_CHECKSUM = 'a6a56d5bfaf71a1907466032ce24dd72d8f42e7886102755a11600e1c694d595';
const PDF_CACHE_PATH = 'data/.pdf-cache/0510774532325bf3d65758eb26b6977cd319850523069db010f05f5635b04cfb.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 10, subject: 'biology' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Digestive System', pageFrom: 7 },
  { chapterNo: 2, chapterTitle: 'Circulatory System', pageFrom: 19 },
  { chapterNo: 3, chapterTitle: 'Respiratory System', pageFrom: 35 },
  { chapterNo: 4, chapterTitle: 'Urinary System', pageFrom: 49 },
  { chapterNo: 5, chapterTitle: 'Nervous System', pageFrom: 60 },
  { chapterNo: 6, chapterTitle: 'Animal Reproduction', pageFrom: 78 },
  { chapterNo: 7, chapterTitle: 'Inheritance', pageFrom: 90 },
  { chapterNo: 8, chapterTitle: 'Diseases', pageFrom: 103 },
  { chapterNo: 9, chapterTitle: 'Immunity And The Immune System', pageFrom: 115 },
  { chapterNo: 10, chapterTitle: 'Biotechnology', pageFrom: 125 },
  { chapterNo: 11, chapterTitle: 'Biostatistics And Data Handling', pageFrom: 143 },
];
const BOOK_LAST_PAGE = 166;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Biology 10.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-11) before ingesting...');
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

  console.log('\nDone. Biology 10 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
