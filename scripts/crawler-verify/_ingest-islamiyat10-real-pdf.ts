// Islamiyat 10 — first real ingest, correct boundaries from the start.
//
// New SSC-II arts-subject textbook (170 pages), organized into broad "Baab" (Part) groupings
// (Part 1: Quran and Hadith, Part 2: Beliefs and Practices, Part 3: Seerah, Part 6: Guidance for
// the Modern Age, etc.) each containing several individual lessons. The automatic dry-run found
// no chapter headings at all — same root cause as every other Urdu-script book this batch: the
// header-clustering algorithm looks for an ALL-CAPS running header, a concept that doesn't
// exist in Urdu script, and this book's own front-matter ToC (page 4) was too OCR-garbled to
// parse even at 300 DPI (the fix in src/lib/crawler/ocr.ts's OCR_DPI_URDU, applied to this book
// too).
//
// Boundaries confirmed via each individual lesson's own recurring SLO-style intro phrase ("اس
// سبق کو پڑھنے کے بعد طلبہ اس قابل ہو جائیں گے کہ...", OCR'd with heavy variation every time).
// Chapters here are the individual lessons, not the broader "Baab" section groupings (consistent
// with how this project treats "Section 1/2/3" groupings in other subjects' textbooks — e.g.
// Pakistan Studies — as organizational labels, not chapters in their own right).
//   Ch.1: 6     Ch.4: 61    Ch.7: 106
//   Ch.2: 43    Ch.5: 74    Ch.8: 150
//   Ch.3: 56    Ch.6: 78
// Pages 1-5 are cover/preface/ToC; pages 169-170 are "About the Authors" back matter — both
// excluded. All 8 chapters partition pages 6-168 with zero gaps or overlaps (verified: sum of
// per-chapter page counts + front matter + back matter = 170, the exact total). As with the
// Urdu-language textbooks this batch, printed lesson titles could not be reliably OCR'd at this
// scan quality, so chapters are labelled generically ("Lesson N") rather than guessing
// unverifiable title text.
//
//   npx tsx scripts/crawler-verify/_ingest-islamiyat10-real-pdf.ts

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

const OCR_CHECKSUM = '694bdfecb24de480d165e426a664a8a167021380111f8f8d5cb0750d59a1c12f';
const PDF_CACHE_PATH = 'data/.pdf-cache/f5ffcc5b689178526356976fbafbab34c31f88553af460f61c1050a8c1f8c15f.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 10, subject: 'islamiyat' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Lesson 1', pageFrom: 6 },
  { chapterNo: 2, chapterTitle: 'Lesson 2', pageFrom: 43 },
  { chapterNo: 3, chapterTitle: 'Lesson 3', pageFrom: 56 },
  { chapterNo: 4, chapterTitle: 'Lesson 4', pageFrom: 61 },
  { chapterNo: 5, chapterTitle: 'Lesson 5', pageFrom: 74 },
  { chapterNo: 6, chapterTitle: 'Lesson 6', pageFrom: 78 },
  { chapterNo: 7, chapterTitle: 'Lesson 7', pageFrom: 106 },
  { chapterNo: 8, chapterTitle: 'Lesson 8', pageFrom: 150 },
];
const BOOK_LAST_PAGE = 168;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Islamiyat 10.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-8) before ingesting...');
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

  console.log('\nDone. Islamiyat 10 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
