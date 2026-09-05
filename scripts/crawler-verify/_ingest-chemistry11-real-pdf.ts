// Chemistry 11 — first real ingest, correct boundaries from the start.
//
// New HSSC-I textbook (418 pages — the largest HSSC book by page count). The automatic dry-run
// was badly broken: it detected only 3 nonsensical "chapters" starting at page 207 with pages
// 1-206 entirely unaccounted for, because the front-matter ToC on page 4 is heavily garbled by
// 2-column OCR (chapter titles and page-number hints both partially unreadable) and confused the
// heuristic clustering.
//
// The real ToC has 22 chapters, reconstructed by cross-referencing three independent sources:
// (1) the garbled front-matter ToC on page 4 (usable for chapters 1-14, 16-21's page hints),
// (2) a back-matter "Acknowledgment" references section (pages 408-411) that re-lists every
//     chapter's exact title next to a "CHAPTER N" heading — this resolved chapter 15's title
//     ("Organic Chemistry"), which the front ToC's own line for it was missing/squashed, and
//     confirmed every other chapter's title unambiguously,
// (3) direct OCR content verification for every boundary: for chapters 1-13, 22, each start page
//     is the page where that chapter's own "SLOs: After completing this lesson..." list begins
//     (confirmed by topic-matching the SLO content itself, not just trusting a page-number hint);
//     for chapters 16-21 the front ToC's page hints (318, 339, 349, 358, 373, 380) were confirmed
//     correct by finding each chapter's own "N.1 SECTION TITLE" heading exactly one page later.
// Chapters 1-22 partition the book's 403 real content pages (5-407) with zero gaps or overlaps;
// pages 1-4 are cover/copyright/preface/ToC and pages 408-418 are back-matter (Acknowledgment
// references, Glossary, About the Author) — both excluded, consistent with every other book this
// session.
//
//   Ch.1  History Of Chemistry:            5-13    (SLOs start p5)
//   Ch.2  Atomic Structure:                 14-38   (SLOs start p14, shell/orbital topic)
//   Ch.3  Chemical Bonding:                 39-79   ("CHAPTER 3" marker p39)
//   Ch.4  Stoichiometry:                    80-95   ("CHAPTER 4 STOICHIOMETRY" marker p80)
//   Ch.5  States And Phases Of Matter:      96-113  (title+SLOs p96)
//   Ch.6  Energetics:                       114-143 (enthalpy-specific SLOs begin p114)
//   Ch.7  Chemical Kinetics:                144-165 (SLO list restarts at "1." p144)
//   Ch.8  Chemical Equilibrium:             166-187 ("CHAPTER 8" marker p166)
//   Ch.9  Acids-Bases Chemistry:            188-211 (conjugate acid-base SLOs begin p188)
//   Ch.10 Periodic Table:                   212-228 (periodic-table-specific SLOs begin p212)
//   Ch.11 Nitrogen And Sulphur:             229-244 (nitrogen-specific SLOs begin p229)
//   Ch.12 Halogens:                         245-250 ("CHAPTER" + halogen SLOs begin p245)
//   Ch.13 Environmental Chemistry - Air:    251-270 (atmosphere-composition SLOs begin p251)
//   Ch.14 Environmental Chemistry - Water:  271-283 ("CHAPTER 14" marker p271)
//   Ch.15 Organic Chemistry:                284-317 (organic-compound-properties SLOs begin p284;
//                                                     title recovered from back-matter references,
//                                                     not the garbled front ToC)
//   Ch.16 Hydrocarbons:                     318-338 (ToC hint 318, confirmed by hydrocarbon
//                                                     classification SLOs on that exact page)
//   Ch.17 Halogenoalkanes:                  339-348 (ToC hint 339, confirmed exactly)
//   Ch.18 Alcohol:                          349-357 ("CHAPTER 18" marker p349, matches ToC hint)
//   Ch.19 Carbonyl Compounds:               358-372 ("CHAPTER 19" marker p358, matches ToC hint)
//   Ch.20 Nitrogen Compounds-Amines:        373-379 (ToC hint 373, confirmed exactly)
//   Ch.21 Organic Synthesis:                380-395 (ToC hint 380, confirmed exactly)
//   Ch.22 Energy:                           396-407 ("CHAPTER 22 ENERGY" marker p396; the
//                                                     back-matter reference list mislabels this
//                                                     chapter as "Organic Synthesis" a second time
//                                                     — clearly a copy-paste error in the source,
//                                                     since the chapter's own content is entirely
//                                                     about petroleum/energy, not organic
//                                                     synthesis — so the real printed chapter
//                                                     title "Energy" is used instead)
//
//   npx tsx scripts/crawler-verify/_ingest-chemistry11-real-pdf.ts

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

const OCR_CHECKSUM = '32b26aabdb1f7fdbdda8882e8ff9c97f946293367c09f5bcce2cd9629c118b97';
const PDF_CACHE_PATH = 'data/.pdf-cache/7cb699df0844eaab047cec97d6e9a19f060367b3369f6390170540400ab331bb.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 11, subject: 'chemistry' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'History Of Chemistry', pageFrom: 5 },
  { chapterNo: 2, chapterTitle: 'Atomic Structure', pageFrom: 14 },
  { chapterNo: 3, chapterTitle: 'Chemical Bonding', pageFrom: 39 },
  { chapterNo: 4, chapterTitle: 'Stoichiometry', pageFrom: 80 },
  { chapterNo: 5, chapterTitle: 'States And Phases Of Matter', pageFrom: 96 },
  { chapterNo: 6, chapterTitle: 'Energetics', pageFrom: 114 },
  { chapterNo: 7, chapterTitle: 'Chemical Kinetics', pageFrom: 144 },
  { chapterNo: 8, chapterTitle: 'Chemical Equilibrium', pageFrom: 166 },
  { chapterNo: 9, chapterTitle: 'Acids-Bases Chemistry', pageFrom: 188 },
  { chapterNo: 10, chapterTitle: 'Periodic Table', pageFrom: 212 },
  { chapterNo: 11, chapterTitle: 'Nitrogen And Sulphur', pageFrom: 229 },
  { chapterNo: 12, chapterTitle: 'Halogens', pageFrom: 245 },
  { chapterNo: 13, chapterTitle: 'Environmental Chemistry - Air', pageFrom: 251 },
  { chapterNo: 14, chapterTitle: 'Environmental Chemistry - Water', pageFrom: 271 },
  { chapterNo: 15, chapterTitle: 'Organic Chemistry', pageFrom: 284 },
  { chapterNo: 16, chapterTitle: 'Hydrocarbons', pageFrom: 318 },
  { chapterNo: 17, chapterTitle: 'Halogenoalkanes', pageFrom: 339 },
  { chapterNo: 18, chapterTitle: 'Alcohol', pageFrom: 349 },
  { chapterNo: 19, chapterTitle: 'Carbonyl Compounds', pageFrom: 358 },
  { chapterNo: 20, chapterTitle: 'Nitrogen Compounds-Amines', pageFrom: 373 },
  { chapterNo: 21, chapterTitle: 'Organic Synthesis', pageFrom: 380 },
  { chapterNo: 22, chapterTitle: 'Energy', pageFrom: 396 },
];
const BOOK_LAST_PAGE = 407;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Chemistry 11.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-22) before ingesting...');
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

  console.log('\nDone. Chemistry 11 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
