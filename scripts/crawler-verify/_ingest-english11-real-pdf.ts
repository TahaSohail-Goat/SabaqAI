// English 11 — first real ingest, correct boundaries from the start.
//
// New HSSC-I arts-subject textbook (220 pages). The automatic dry-run found no ToC and detected
// only 2 nonsensical "chapters" (pages 158-160, 161-220) — 17 of the book's real 18 units went
// completely unaccounted for. Root cause: same as English 10 — each unit's own running header
// ("unit N Title") only appears a few pages INTO the unit (once exercises begin), not on its
// first page, so header-clustering only found the two chapters whose header happened to fall
// close enough to a real boundary.
//
// Real boundaries confirmed directly: every unit opens with its own "After completing this
// lesson, students will be able to: ..." SLO page, exactly one page before its own title +
// Pre-Reading page (verified against all 18 — no exceptions, unlike English 10 where a few
// title graphics didn't OCR at all). This is a genuinely 18-unit book, not the ~12 the badly
// garbled front-matter ToC (page 4) seemed to show at a glance.
//   Unit 1  Family Values In Pakistan:              6
//   Unit 2  Shooting Stars (Hal Borland):            15
//   Unit 3  The Wind (Poem, R. L. Stevenson):         25
//   Unit 4  Butterflies (Roger Dean Kiser):           40
//   Unit 5  Clean Water And Sanitation:               55
//   Unit 6  The Darkling Thrush (Poem, Thomas Hardy): 70
//   Unit 7  Heritage Sites In Pakistan:               81
//   Unit 8  Social Media: A Blessing Or A Curse?:     91
//   Unit 9  Sunshine After Rain (Brenda Winders):    102
//   Unit 10 The Small Woman (Alan Burgess):          114
//   Unit 11 The Three Questions (Leo Tolstoy):        125
//   Unit 12 Break, Break, Break (Poem, Tennyson):     141
//   Unit 13 Blow, Blow, Thou Winter Wind (Shakespeare): 151
//   Unit 14 Choice Of A Profession:                  158
//   Unit 15 The Ninny (Anton Chekhov):               172
//   Unit 16 Fourteen (One-Act Play, Alice Gerstenberg): 180
//   Unit 17 The Last Leaf (O. Henry):                195
//   Unit 18 The Necklace (Guy de Maupassant):        206
// Pages 1-5 are cover/preface/ToC/foreword; there is no back matter — the book's real content
// runs straight through to its last page. All 18 units partition pages 6-220 with zero gaps or
// overlaps (verified: sum of per-unit page counts + front matter = 220, the exact total).
//
//   npx tsx scripts/crawler-verify/_ingest-english11-real-pdf.ts

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

const OCR_CHECKSUM = '65724b7768bd2dec62198dc4bee58a813bf1023df8fe3f2dc2f1b6b18e647aae';
const PDF_CACHE_PATH = 'data/.pdf-cache/f7d021ece594a78fc421629242e1284cbcd23e8fe6aa1efb6e79640bf88a6c93.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 11, subject: 'english' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Family Values In Pakistan', pageFrom: 6 },
  { chapterNo: 2, chapterTitle: 'Shooting Stars', pageFrom: 15 },
  { chapterNo: 3, chapterTitle: 'The Wind', pageFrom: 25 },
  { chapterNo: 4, chapterTitle: 'Butterflies', pageFrom: 40 },
  { chapterNo: 5, chapterTitle: 'Clean Water And Sanitation', pageFrom: 55 },
  { chapterNo: 6, chapterTitle: 'The Darkling Thrush', pageFrom: 70 },
  { chapterNo: 7, chapterTitle: 'Heritage Sites In Pakistan', pageFrom: 81 },
  { chapterNo: 8, chapterTitle: 'Social Media: A Blessing Or A Curse?', pageFrom: 91 },
  { chapterNo: 9, chapterTitle: 'Sunshine After Rain', pageFrom: 102 },
  { chapterNo: 10, chapterTitle: 'The Small Woman', pageFrom: 114 },
  { chapterNo: 11, chapterTitle: 'The Three Questions', pageFrom: 125 },
  { chapterNo: 12, chapterTitle: 'Break, Break, Break', pageFrom: 141 },
  { chapterNo: 13, chapterTitle: 'Blow, Blow, Thou Winter Wind', pageFrom: 151 },
  { chapterNo: 14, chapterTitle: 'Choice Of A Profession', pageFrom: 158 },
  { chapterNo: 15, chapterTitle: 'The Ninny', pageFrom: 172 },
  { chapterNo: 16, chapterTitle: 'Fourteen', pageFrom: 180 },
  { chapterNo: 17, chapterTitle: 'The Last Leaf', pageFrom: 195 },
  { chapterNo: 18, chapterTitle: 'The Necklace', pageFrom: 206 },
];
const BOOK_LAST_PAGE = 220;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for English 11.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-18) before ingesting...');
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

  console.log('\nDone. English 11 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
