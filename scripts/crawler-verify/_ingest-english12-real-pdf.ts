// English 12 — first real ingest, correct boundaries from the start.
//
// New HSSC-II arts-subject textbook (194 pages). The automatic dry-run found no ToC and detected
// only 6 nonsensical "chapters" — pages 1-26 unaccounted for, and several detected chapters
// spanning 50-60 pages (multiple real units merged). Same root cause as English 10/11: each
// unit's own running header only appears partway INTO the unit, not on its first page.
//
// Real boundaries confirmed via each unit's own "After completing this lesson, you will be
// able to..." SLO page — this book's own front matter (page 4) claims "16 chapters," but only
// 15 distinct SLO/title pages were found and verified against real content on every single one
// (including two, units 7 and 10, where the printed title itself never OCR'd at all — confirmed
// by direct content instead: unit 7 is about the health risks of smoking, "Risks from Smoking"
// being the one clean heading string that did survive OCR on its own content page; unit 10 is
// about the ozone layer, titled descriptively here since no printed title recovered). No 16th
// boundary could be found anywhere in the book (confirmed: no further "Unit 16" or SLO-pattern
// hit exists after unit 15/The Pearl's own explicit "Unit 15" running header, which appears
// repeatedly through the rest of the book with no other unit number after it) — left at 15,
// not fabricated up to 16.
//   Unit 1  Lingkuan Gorge (Tu Peng Cheng):            8
//   Unit 2  Population Explosion In Pakistan:          21
//   Unit 3  The Income-Tax Man (Mark Twain):           33
//   Unit 4  Rubaiyat Of Omar Khayyam (Edward FitzGerald): 43
//   Unit 5  The Blanket (Floyd Dell):                  51
//   Unit 6  Stay Hungry, Stay Foolish (Steve Jobs):     62
//   Unit 7  Risks From Smoking:                        72
//   Unit 8  The Sea (James Reeves):                    81
//   Unit 9  First Year At Harrow (Winston Churchill):   88
//   Unit 10 The Ozone Layer:                           100
//   Unit 11 Harvest Hymn (John Betjeman):              109
//   Unit 12 The Kaghan (Tahir Jahangir):                115
//   Unit 13 After Twenty Years (O. Henry):              127
//   Unit 14 The Solitary Reaper (William Wordsworth):   141
//   Unit 15 The Pearl (John Steinbeck):                 149
// Pages 1-7 are cover/preface/objective-analysis/ToC; page 194 is "About Authors" back matter —
// both excluded. All 15 units partition pages 8-193 with zero gaps or overlaps (verified: sum
// of per-unit page counts + front matter + back matter = 194, the exact total).
//
//   npx tsx scripts/crawler-verify/_ingest-english12-real-pdf.ts

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

const OCR_CHECKSUM = 'e1af55d7590d4c3c60763e9513d1ce8e2dc5256a7ac11d8a1f6b46bb0fb6c778';
const PDF_CACHE_PATH = 'data/.pdf-cache/b1ae2096e66e34ecd0cf076ba810125b4f4efbc1db220da4c507ec0d9818f406.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 12, subject: 'english' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Lingkuan Gorge', pageFrom: 8 },
  { chapterNo: 2, chapterTitle: 'Population Explosion In Pakistan', pageFrom: 21 },
  { chapterNo: 3, chapterTitle: 'The Income-Tax Man', pageFrom: 33 },
  { chapterNo: 4, chapterTitle: 'Rubaiyat Of Omar Khayyam', pageFrom: 43 },
  { chapterNo: 5, chapterTitle: 'The Blanket', pageFrom: 51 },
  { chapterNo: 6, chapterTitle: 'Stay Hungry, Stay Foolish', pageFrom: 62 },
  { chapterNo: 7, chapterTitle: 'Risks From Smoking', pageFrom: 72 },
  { chapterNo: 8, chapterTitle: 'The Sea', pageFrom: 81 },
  { chapterNo: 9, chapterTitle: 'First Year At Harrow', pageFrom: 88 },
  { chapterNo: 10, chapterTitle: 'The Ozone Layer', pageFrom: 100 },
  { chapterNo: 11, chapterTitle: 'Harvest Hymn', pageFrom: 109 },
  { chapterNo: 12, chapterTitle: 'The Kaghan', pageFrom: 115 },
  { chapterNo: 13, chapterTitle: 'After Twenty Years', pageFrom: 127 },
  { chapterNo: 14, chapterTitle: 'The Solitary Reaper', pageFrom: 141 },
  { chapterNo: 15, chapterTitle: 'The Pearl', pageFrom: 149 },
];
const BOOK_LAST_PAGE = 193;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for English 12.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-15) before ingesting...');
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

  console.log('\nDone. English 12 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
