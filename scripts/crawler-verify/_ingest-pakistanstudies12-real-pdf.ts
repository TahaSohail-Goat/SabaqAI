// Pakistan Studies 12 — first real ingest, correct boundaries from the start.
//
// New HSSC-II arts-subject textbook (234 pages). The automatic dry-run found a real ToC on page
// 5 but its own line-parser only recovered 10 of the book's real 12 entries (units 9 and 10's
// printed page-number columns were too OCR-garbled for the ToC parser's regex to match), so it
// reported a count_mismatch (12 detected vs. "10" ToC) and halted for review — a false alarm:
// the detector's own 12-chapter count was correct all along, and the real ToC (once read
// directly rather than through the parser) does list exactly 12 units across 6 sections.
//
// Every boundary confirmed directly against its own "In this unit the students will be able
// to..." SLO page — 10 of the 12 landed exactly on the ToC's own page hint with zero lag; units
// 9 and 10 (the ones the ToC parser couldn't read a page number for) were found by direct
// content search between units 8 and 11.
//   Ch.1  Ideology Of Pakistan And Initial Problems:     6
//   Ch.2  Political Developments In Pakistan:            26
//   Ch.3  Land Of Pakistan And Environmental Hazards:    44
//   Ch.4  Natural Vegetation And Forests Of Pakistan:    66
//   Ch.5  Mineral, Power Resources And Telecommunication: 80
//   Ch.6  Industry, Livestock And Fisheries:             103
//   Ch.7  National Integration And Social Cohesion:      128
//   Ch.8  Recreation Tourism:                            147
//   Ch.9  Constitutional Development:                    162 (no ToC page hint survived OCR —
//                                                              found via its own SLO page)
//   Ch.10 Rights And Responsibilities:                   178 (same — no ToC page hint survived)
//   Ch.11 Foreign Policy Of Pakistan:                     198
//   Ch.12 Pakistan And International Organizations:      217
// Pages 1-5 are cover/preface/ToC; page 234 is a Glossary — both excluded. All 12 chapters
// partition pages 6-233 with zero gaps or overlaps (verified: sum of per-chapter page counts +
// front matter + back matter = 234, the exact total).
//
//   npx tsx scripts/crawler-verify/_ingest-pakistanstudies12-real-pdf.ts

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

const OCR_CHECKSUM = '3becbfbf9acff618f7f719945cfe1259c94fa2d62fca7536dc7b6f54d49484a6';
const PDF_CACHE_PATH = 'data/.pdf-cache/28d775f878309791e8db76aa4452e5d98708b1cce719cb69d40d1dfdd18d7a59.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 12, subject: 'pakistan_studies' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Ideology Of Pakistan And Initial Problems', pageFrom: 6 },
  { chapterNo: 2, chapterTitle: 'Political Developments In Pakistan', pageFrom: 26 },
  { chapterNo: 3, chapterTitle: 'Land Of Pakistan And Environmental Hazards', pageFrom: 44 },
  { chapterNo: 4, chapterTitle: 'Natural Vegetation And Forests Of Pakistan', pageFrom: 66 },
  { chapterNo: 5, chapterTitle: 'Mineral, Power Resources And Telecommunication', pageFrom: 80 },
  { chapterNo: 6, chapterTitle: 'Industry, Livestock And Fisheries', pageFrom: 103 },
  { chapterNo: 7, chapterTitle: 'National Integration And Social Cohesion', pageFrom: 128 },
  { chapterNo: 8, chapterTitle: 'Recreation Tourism', pageFrom: 147 },
  { chapterNo: 9, chapterTitle: 'Constitutional Development', pageFrom: 162 },
  { chapterNo: 10, chapterTitle: 'Rights And Responsibilities', pageFrom: 178 },
  { chapterNo: 11, chapterTitle: 'Foreign Policy Of Pakistan', pageFrom: 198 },
  { chapterNo: 12, chapterTitle: 'Pakistan And International Organizations', pageFrom: 217 },
];
const BOOK_LAST_PAGE = 233;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Pakistan Studies 12.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-12) before ingesting...');
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

  console.log('\nDone. Pakistan Studies 12 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
