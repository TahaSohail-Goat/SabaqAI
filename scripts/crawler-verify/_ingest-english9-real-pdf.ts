// English 9 — first real ingest, correct boundaries from the start.
//
// New SSC-I arts-subject textbook (168 pages). The automatic dry-run found no ToC and detected
// 0 chapters at all — same root cause as the other English books this batch: each unit's own
// running header only appears partway into the unit, not on its first page, so header-clustering
// found nothing usable.
//
// Real boundaries confirmed via each unit's own "After completing this lesson, students will be
// able to..." SLO page (one instance, page 57, had a legible title on the same page too:
// "LESSONS FOR SUCCESS"). Two units' exact printed titles never fully OCR'd — confirmed via
// their own opening-paragraph content instead: unit 6 opens "The menace of drug abuse is not
// just limited to Pakistan..." and unit 3's theme/content is explicitly "Digital Globalization".
//   Unit 1  Hazrat Muhammad Rasulullah (SAW): A Mercy For All Creation: 6
//   Unit 2  The Art Of Muslim Women's Entrepreneurship:     17
//   Unit 3  Modern World And Digital Globalization:         29
//   Unit 4  Nothing Is Impossible (Brooklyn Bridge story):  41
//   Unit 5  Lessons For Success:                            57
//   Unit 6  The Menace Of Drug Abuse:                       79
//   Unit 7  Mowing (Robert Frost):                          88
//   Unit 8  The Eagle (Alfred, Lord Tennyson):               96
//   Unit 9  Travel (Robert Louis Stevenson):                116
//   Unit 10 Two Mothers Remembered (Joann Snow Duncanson):  128
//   Unit 11 Good Health And Well Being:                     154
// Pages 1-5 are cover/preface/ToC; there is no back matter — the book's real content runs
// straight through to its last page. All 11 units partition pages 6-168 with zero gaps or
// overlaps (verified: sum of per-unit page counts + front matter = 168, the exact total).
//
//   npx tsx scripts/crawler-verify/_ingest-english9-real-pdf.ts

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

const OCR_CHECKSUM = '43c0eadcfec6be97b74cecb062fcb83f092edeb92c6d7587cf9c7094a7cbf89f';
const PDF_CACHE_PATH = 'data/.pdf-cache/b31d7cdac8d5983d61fa38e26f4afc51cd63009745ab3b148c0e6a9de6e9987a.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 9, subject: 'english' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Hazrat Muhammad Rasulullah (SAW): A Mercy For All Creation', pageFrom: 6 },
  { chapterNo: 2, chapterTitle: "The Art Of Muslim Women's Entrepreneurship", pageFrom: 17 },
  { chapterNo: 3, chapterTitle: 'Modern World And Digital Globalization', pageFrom: 29 },
  { chapterNo: 4, chapterTitle: 'Nothing Is Impossible', pageFrom: 41 },
  { chapterNo: 5, chapterTitle: 'Lessons For Success', pageFrom: 57 },
  { chapterNo: 6, chapterTitle: 'The Menace Of Drug Abuse', pageFrom: 79 },
  { chapterNo: 7, chapterTitle: 'Mowing', pageFrom: 88 },
  { chapterNo: 8, chapterTitle: 'The Eagle', pageFrom: 96 },
  { chapterNo: 9, chapterTitle: 'Travel', pageFrom: 116 },
  { chapterNo: 10, chapterTitle: 'Two Mothers Remembered', pageFrom: 128 },
  { chapterNo: 11, chapterTitle: 'Good Health And Well Being', pageFrom: 154 },
];
const BOOK_LAST_PAGE = 168;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for English 9.`);

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

  console.log('\nDone. English 9 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
