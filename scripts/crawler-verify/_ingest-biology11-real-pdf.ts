// Biology 11 — first real ingest, correct boundaries from the start.
//
// New HSSC-I textbook (432 pages — the largest book this session). The automatic dry-run found
// a real 15-chapter ToC (its 16th line is "Glossary", back matter) but detected only 3
// nonsensical "chapters" starting at page 207 with a 150-page merged block — pages 1-206 went
// completely unaccounted for. A direct check against the ToC's own page hints confirmed 13 of
// 15 immediately (each lands exactly on that chapter's own "TITLE / SLOs: After completing this
// lesson, the student will be able to:" opening page); the remaining 2 had OCR-garbled ToC page
// numbers ("27" and a garbled title respectively) that needed direct verification:
//   Ch.1  Cells And Sub-Cellular Organelles: 5
//   Ch.2  Biological Molecules:              43  (ToC itself says "Molecular Biology" - the
//                                                  chapter's own printed title, "BIOLOGICAL
//                                                  MOLECULES", is used instead)
//   Ch.3  Enzymes:                            83
//   Ch.4  Bioenergetics:                      101
//   Ch.5  Acellular Life:                     132
//   Ch.6  Prokaryotes:                        148
//   Ch.7  Protists And Fungi:                 177
//   Ch.8  Kingdom Plantae:                    204  (ToC says "Plantae"; the fuller printed
//                                                    title "KINGDOM PLANTAE" is used instead)
//   Ch.9  Diversity In Plant Functions:       234
//   Ch.10 Animalia:                            271
//   Ch.11 Reproduction:                       297  (ToC's own page hint OCR'd as "27" - a
//                                                    dropped digit; direct inspection found the
//                                                    real SLO page at 297, confirmed against
//                                                    "Chapter 11: Reproduction" running headers
//                                                    on the surrounding pages)
//   Ch.12 Inheritance:                        310  (ToC's own title OCR'd as just "iter" -
//                                                    confirmed as "Inheritance" directly via the
//                                                    "Chapter 12: Inheritance" running header;
//                                                    the page number itself, 310, was correct)
//   Ch.13 Chromosome And DNA:                 346
//   Ch.14 Evolution:                          376
//   Ch.15 Ecology:                            389
// Chapter 15 runs to the end of the book (432), bundling in the trailing Glossary/Authors'
// Profile back matter, consistent with every other book this session.
//
//   npx tsx scripts/crawler-verify/_ingest-biology11-real-pdf.ts

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

const OCR_CHECKSUM = 'e4f1ed7284c23d6c540a521d946320306ab9507848b63a98a4649e1507e0fe5e';
const PDF_CACHE_PATH = 'data/.pdf-cache/277d53673e6c324a9f7f7455ecd62a160d305003621bfaafb5b48678b0da5a14.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 11, subject: 'biology' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Cells And Sub-Cellular Organelles', pageFrom: 5 },
  { chapterNo: 2, chapterTitle: 'Biological Molecules', pageFrom: 43 },
  { chapterNo: 3, chapterTitle: 'Enzymes', pageFrom: 83 },
  { chapterNo: 4, chapterTitle: 'Bioenergetics', pageFrom: 101 },
  { chapterNo: 5, chapterTitle: 'Acellular Life', pageFrom: 132 },
  { chapterNo: 6, chapterTitle: 'Prokaryotes', pageFrom: 148 },
  { chapterNo: 7, chapterTitle: 'Protists And Fungi', pageFrom: 177 },
  { chapterNo: 8, chapterTitle: 'Kingdom Plantae', pageFrom: 204 },
  { chapterNo: 9, chapterTitle: 'Diversity In Plant Functions', pageFrom: 234 },
  { chapterNo: 10, chapterTitle: 'Animalia', pageFrom: 271 },
  { chapterNo: 11, chapterTitle: 'Reproduction', pageFrom: 297 },
  { chapterNo: 12, chapterTitle: 'Inheritance', pageFrom: 310 },
  { chapterNo: 13, chapterTitle: 'Chromosome And DNA', pageFrom: 346 },
  { chapterNo: 14, chapterTitle: 'Evolution', pageFrom: 376 },
  { chapterNo: 15, chapterTitle: 'Ecology', pageFrom: 389 },
];
const BOOK_LAST_PAGE = 432;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Biology 11.`);

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

  console.log('\nDone. Biology 11 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
