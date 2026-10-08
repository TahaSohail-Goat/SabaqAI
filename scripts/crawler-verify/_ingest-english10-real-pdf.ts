// English 10 — first real ingest, correct boundaries from the start.
//
// New SSC-II arts-subject textbook (172 pages). The automatic dry-run found a real 13-unit ToC
// (page 4) but detected only 4 nonsensical "chapters" (pages 20-27, 28-79, 80-147, 148-172) —
// units 3-11 all got merged into 2 giant blocks. Root cause: each unit's own "Unit-0N" running
// header only appears partway INTO the unit (in its later grammar/writing-skills exercise
// section), not on its first page — so header-clustering, which looks for a marker at each
// unit's start, only reliably found units 1, 2, 6, and 12 (whose Unit-0N markers happened to
// land close enough to a real title page) and merged everything between them.
//
// Real boundaries confirmed directly against each unit's own title/SLO page (the pattern
// "TITLE Text type: ... Theme: ... In this unit the students will be able to..." — analogous to
// every other book's SLOs page this session), one page before its own "Pre-Reading" page:
//   Unit 1  Animal Rights In Islam: Showing Compassion:  7
//   Unit 2  Cultural Festivals Of Pakistan: Unity In Diversity: 22
//   Unit 3  Media Literacy In The Modern Age:            37
//   Unit 4  Thank You, Ma'am (Langston Hughes):          49
//   Unit 5  Mother Nature (Poem):                        65  (title graphic didn't OCR at all —
//                                                              confirmed via its own distinct
//                                                              poem-specific SLOs, e.g. "locate
//                                                              phrases and idioms", one page
//                                                              before its Pre-Reading at p66)
//   Unit 6  How To Make Better Decisions About Your Career: 77
//   Unit 7  The Alchemist:                               91  (title graphic didn't OCR; SLO page
//                                                              confirmed one page before its own
//                                                              Pre-Reading at p92)
//   Unit 8  Blue (Poem):                                 100 (same — SLO page before Pre-Reading
//                                                              at p101)
//   Unit 9  The Menace Of Drugs:                         112
//   Unit 10 Earth And Environment:                       125
//   Unit 11 Adventure Sports:                            134 (same — SLO page before Pre-Reading
//                                                              at p135)
//   Unit 12 Importance Of Life Skills:                   146
//   Unit 13 The Oyster And The Pearl (Play):             154
// Pages 1-6 are cover/preface/ToC/foreword; pages 171-172 are "About the Author" + a decorative
// back cover — both excluded. All 13 units partition pages 7-170 with zero gaps or overlaps
// (verified: sum of per-unit page counts + front matter + back matter = 172, the exact total).
//
//   npx tsx scripts/crawler-verify/_ingest-english10-real-pdf.ts

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

const OCR_CHECKSUM = 'd0913068fbb74567509709f7c4a9964bcc25b6f1e0120251c5a35b77aac76e6b';
const PDF_CACHE_PATH = 'data/.pdf-cache/6ded92d1fd953b947502fecd3f8be55ad459a5b52dcd5f6adbb38b0abd4b23d0.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 10, subject: 'english' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: "Animal Rights In Islam: Showing Compassion", pageFrom: 7 },
  { chapterNo: 2, chapterTitle: 'Cultural Festivals Of Pakistan: Unity In Diversity', pageFrom: 22 },
  { chapterNo: 3, chapterTitle: 'Media Literacy In The Modern Age', pageFrom: 37 },
  { chapterNo: 4, chapterTitle: "Thank You, Ma'am", pageFrom: 49 },
  { chapterNo: 5, chapterTitle: 'Mother Nature', pageFrom: 65 },
  { chapterNo: 6, chapterTitle: 'How To Make Better Decisions About Your Career', pageFrom: 77 },
  { chapterNo: 7, chapterTitle: 'The Alchemist', pageFrom: 91 },
  { chapterNo: 8, chapterTitle: 'Blue', pageFrom: 100 },
  { chapterNo: 9, chapterTitle: 'The Menace Of Drugs', pageFrom: 112 },
  { chapterNo: 10, chapterTitle: 'Earth And Environment', pageFrom: 125 },
  { chapterNo: 11, chapterTitle: 'Adventure Sports', pageFrom: 134 },
  { chapterNo: 12, chapterTitle: 'Importance Of Life Skills', pageFrom: 146 },
  { chapterNo: 13, chapterTitle: 'The Oyster And The Pearl', pageFrom: 154 },
];
const BOOK_LAST_PAGE = 170;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for English 10.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-13) before ingesting...');
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

  console.log('\nDone. English 10 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
