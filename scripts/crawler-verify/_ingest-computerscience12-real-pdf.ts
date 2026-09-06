// Computer Science 12 — first real ingest, correct boundaries from the start.
//
// New HSSC-II textbook (see the HSSC batch's own manifest comments — this is part of the
// user's explicit request to extend textbook coverage from SSC to HSSC for Math/Bio/CS/Chem/
// Physics, classes 11-12). The automatic dry-run HALTED outright: "No chapter headings
// detected". This book's OCR quality is markedly worse than every other textbook this session —
// several pages came back completely empty (0 characters), and the "After completing this
// lesson, you will be able to:" SLO phrasing that reliably marked chapter starts elsewhere in
// this curriculum series only matched cleanly on 2 of 6 real chapters here; the rest were found
// by reading actual page content across the whole book rather than pattern-matching a phrase.
//
// No usable table of contents exists either — pages 4-6 (where a ToC would normally sit) came
// back as 0-length OCR, and detectTableOfContents() correctly reported nothing in the first 15
// pages. Every boundary below is therefore based on direct content-boundary reading alone, with
// less independent cross-validation than every other book this session had (no ToC to check
// page hints against). Confidence is correspondingly lower for the exact page of each title
// (usually confirmed within 1-2 pages via the SLO/topic-shift pattern; see the DISPUTED note on
// chapter 4 below for the one specific case that couldn't be pinned down further):
//   Ch.1 Operating System:                    9   ("OPERATING SYSTEM" heading + garbled SLO
//                                                   intro; this chapter's own content later also
//                                                   covers multiprogramming/multithreading and
//                                                   software-engineering/SDLC topics before its
//                                                   own end-of-chapter exercises at p38-39 — kept
//                                                   as one chapter since no internal title break
//                                                   was found, following the title as printed)
//   Ch.2 Object Oriented Programming In C++:  41  (clean title + SLO intro, unambiguous)
//   Ch.3 Control Structures:                  71  ("...concept of nested if statement... Control
//                                                   [structu]res... control the flow of program
//                                                   execution" — the title itself OCR'd as "RS
//                                                   INTRODUCTION", reconstructed from context and
//                                                   this book's own later "5.1"/"5.3" subsection
//                                                   numbering convention)
//   Ch.4 Arrays, Strings And Functions:       97  (DISPUTED/uncertain: the SLO intro explicitly
//                                                   opens on "the concept of array", and 5.1/5.3
//                                                   subsections confirm Arrays+Strings share one
//                                                   chapter — but Functions and Pointers content
//                                                   continues for another ~50 pages with no
//                                                   further title/SLO break found, even though a
//                                                   later page (171) makes a forward-reference to
//                                                   "unit 6, as topic 6.3" while discussing
//                                                   function-related content, implying Functions
//                                                   may really be its own Unit 6 that this book's
//                                                   OCR simply never surfaced legibly. Ingested
//                                                   as one chapter rather than guess where a
//                                                   split would go — flagged here for any future
//                                                   re-check against a cleaner scan of this book.
//   Ch.5 Classes:                             151 (topic shift to "class is used to specify the
//                                                   form of an object... data members... member
//                                                   functions" with no legible title/SLO line
//                                                   directly on this page either, but a clean,
//                                                   unambiguous prose transition after chapter 4's
//                                                   own exercise questions end at p148-150)
//   Ch.6 File Handling:                       175 (clean title + SLO intro, unambiguous)
//
//   npx tsx scripts/crawler-verify/_ingest-computerscience12-real-pdf.ts

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

const OCR_CHECKSUM = '81afa25eac89d8655138e20c0ece67dfd6de4d7e4edefaf83b0152657538f36c';
const PDF_CACHE_PATH = 'data/.pdf-cache/810d7a6314a46b95529ac00c3a0e6856c089072881a5974ed3e6c9b3865f7c12.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 12, subject: 'computer_science' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Operating System', pageFrom: 9 },
  { chapterNo: 2, chapterTitle: 'Object Oriented Programming In C++', pageFrom: 41 },
  { chapterNo: 3, chapterTitle: 'Control Structures', pageFrom: 71 },
  { chapterNo: 4, chapterTitle: 'Arrays, Strings And Functions', pageFrom: 97 },
  { chapterNo: 5, chapterTitle: 'Classes', pageFrom: 151 },
  { chapterNo: 6, chapterTitle: 'File Handling', pageFrom: 175 },
];
const BOOK_LAST_PAGE = 190;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Computer Science 12.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-6) before ingesting...');
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

  console.log('\nDone. Computer Science 12 ingested with real per-chapter PDFs and best-effort corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
