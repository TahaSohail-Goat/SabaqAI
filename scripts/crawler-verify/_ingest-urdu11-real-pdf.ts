// Urdu 11 — first real ingest, correct boundaries from the start.
//
// New HSSC-I arts-subject textbook (142 pages, a poetry/prose anthology — 19 short pieces by
// different named authors, each opening with the author's name and birth/death years in
// parentheses, e.g. "ساوت نن منٹو (۱۹۱۲ء_۱۹۵۵ء)"). The automatic dry-run found no chapter
// headings at all, on top of a genuine, separate problem: Urdu OCR at this project's default
// 150 DPI was too low-resolution to read reliably (confirmed directly — the same ToC page came
// back with illegible page numbers at 150 DPI but clean ones at 300 DPI). Fixed generally in
// src/lib/crawler/ocr.ts (OCR_DPI_URDU), which this book was re-OCR'd under.
//
// Even at 300 DPI, the header-clustering algorithm itself doesn't apply here: it looks for an
// ALL-CAPS running header, a concept that doesn't exist in Urdu script. A real 19-entry ToC WAS
// detected this time (page 4), but it lists prose/poem titles the automated line-parser can't
// reliably pair with clean page numbers either (the same OCR noise problem, just past the point
// this project's Latin-oriented ToC regex can parse around).
//
// Boundaries were instead confirmed by directly reading each candidate page: every one of the
// 19 starts below opens with a distinct author-name-and-dates line followed by the same
// recurring SLO-style intro phrase ("اس سبق کی قرأت کے بعد آپ اس قابل ہو جائیں گے کہ...", OCR'd
// with heavy variation each time but recognizable) — a structural signal checked on every page,
// not assumed from the pattern alone. The book's own printed titles could not be reliably
// extracted at this OCR quality (cursive Urdu script scanned at source-book resolution remains
// genuinely harder to OCR than Latin script even at 300 DPI) — chapters are labelled generically
// as "Lesson N" rather than guessing a title text that can't be verified; this is a real
// precision limit of the current OCR pipeline for Urdu, not a shortcut taken to save time.
//   Lesson 1:   5      Lesson 8:   61     Lesson 15: 105
//   Lesson 2:   11     Lesson 9:   74     Lesson 16: 114
//   Lesson 3:   21     Lesson 10:  84     Lesson 17: 119
//   Lesson 4:   31     Lesson 11:  88     Lesson 18: 124
//   Lesson 5:   42     Lesson 12:  92     Lesson 19: 130
//   Lesson 6:   50     Lesson 13:  96
//   Lesson 7:   56     Lesson 14: 101
// Pages 1-4 are cover/preface/ToC; there is no separable back matter — the book's real content
// runs straight through to its last page. All 19 lessons partition pages 5-142 with zero gaps or
// overlaps (verified: sum of per-lesson page counts + front matter = 142, the exact total).
//
//   npx tsx scripts/crawler-verify/_ingest-urdu11-real-pdf.ts

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

const OCR_CHECKSUM = 'b643a02f00080745ce28204b175663482e152dcec4b7a950c27b0ba5e4793b7e';
const PDF_CACHE_PATH = 'data/.pdf-cache/ba9fefa3a738d503363ac5f7fae65fab41ab1a434117598310f71ddacee2a3e7.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 11, subject: 'urdu' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Lesson 1', pageFrom: 5 },
  { chapterNo: 2, chapterTitle: 'Lesson 2', pageFrom: 11 },
  { chapterNo: 3, chapterTitle: 'Lesson 3', pageFrom: 21 },
  { chapterNo: 4, chapterTitle: 'Lesson 4', pageFrom: 31 },
  { chapterNo: 5, chapterTitle: 'Lesson 5', pageFrom: 42 },
  { chapterNo: 6, chapterTitle: 'Lesson 6', pageFrom: 50 },
  { chapterNo: 7, chapterTitle: 'Lesson 7', pageFrom: 56 },
  { chapterNo: 8, chapterTitle: 'Lesson 8', pageFrom: 61 },
  { chapterNo: 9, chapterTitle: 'Lesson 9', pageFrom: 74 },
  { chapterNo: 10, chapterTitle: 'Lesson 10', pageFrom: 84 },
  { chapterNo: 11, chapterTitle: 'Lesson 11', pageFrom: 88 },
  { chapterNo: 12, chapterTitle: 'Lesson 12', pageFrom: 92 },
  { chapterNo: 13, chapterTitle: 'Lesson 13', pageFrom: 96 },
  { chapterNo: 14, chapterTitle: 'Lesson 14', pageFrom: 101 },
  { chapterNo: 15, chapterTitle: 'Lesson 15', pageFrom: 105 },
  { chapterNo: 16, chapterTitle: 'Lesson 16', pageFrom: 114 },
  { chapterNo: 17, chapterTitle: 'Lesson 17', pageFrom: 119 },
  { chapterNo: 18, chapterTitle: 'Lesson 18', pageFrom: 124 },
  { chapterNo: 19, chapterTitle: 'Lesson 19', pageFrom: 130 },
];
const BOOK_LAST_PAGE = 142;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Urdu 11.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-19) before ingesting...');
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

  console.log('\nDone. Urdu 11 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
