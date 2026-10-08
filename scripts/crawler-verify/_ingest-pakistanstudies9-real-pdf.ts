// Pakistan Studies 9 — first real ingest, correct boundaries from the start.
//
// New SSC-I arts-subject textbook (158 pages). The automatic dry-run detected 9 "chapters" but
// the first 4 were pure garbage — the book's own front-matter ToC (a real, readable 5-unit list
// on page 4) wasn't recognized as a ToC by the detector and got fed straight into header
// clustering, producing degenerate page ranges like "4-3" and titles with page-number digits
// baked into them (e.g. "Water Resources F 97"). The real 5 units start where the automatic
// pass's chapters 5-9 began, each confirmed directly against its own "In this unit the students
// will be able to..." SLO page — every one of which landed exactly on the front-matter ToC's own
// page hint, no lag:
//   Unit 1  Ideological Basis Of Pakistan:                  5
//   Unit 2  Establishment Of Pakistan:                      21
//   Unit 3  Land Of Pakistan:                               42
//   Unit 4  The Natural Topography And Vegetation Of Pakistan: 52
//   Unit 5  Climate Of Pakistan And Environmental Hazards:  70
// Pages 1-4 are cover/preface/ToC; page 158 is "About the Author" back matter — both excluded.
// All 5 units partition pages 5-157 with zero gaps or overlaps (verified: sum of per-unit page
// counts + front matter + back matter = 158, the exact total).
//
//   npx tsx scripts/crawler-verify/_ingest-pakistanstudies9-real-pdf.ts

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

const OCR_CHECKSUM = 'b0340938f19f70a3acbe624341e54eb0df1135caab65a7c25b375062bf5032d1';
const PDF_CACHE_PATH = 'data/.pdf-cache/77162821b7916ca95571a19f4307539a99ec11ab728b2b4dad20daf5adc6ae8c.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 9, subject: 'pakistan_studies' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Ideological Basis Of Pakistan', pageFrom: 5 },
  { chapterNo: 2, chapterTitle: 'Establishment Of Pakistan', pageFrom: 21 },
  { chapterNo: 3, chapterTitle: 'Land Of Pakistan', pageFrom: 42 },
  { chapterNo: 4, chapterTitle: 'The Natural Topography And Vegetation Of Pakistan', pageFrom: 52 },
  { chapterNo: 5, chapterTitle: 'Climate Of Pakistan And Environmental Hazards', pageFrom: 70 },
];
const BOOK_LAST_PAGE = 157;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Pakistan Studies 9.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-5) before ingesting...');
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

  console.log('\nDone. Pakistan Studies 9 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
