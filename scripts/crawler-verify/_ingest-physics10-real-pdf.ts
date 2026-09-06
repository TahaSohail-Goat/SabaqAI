// Physics 10 — first real ingest, correct boundaries from the start.
//
// New textbook (see textbooks.json's comment — Class 10 science was entirely missing from the
// manifest until 2026-09-04). The automatic pipeline HALTED this one on its own dry run in the
// worst way seen all session: the ToC parser found 87 "entries" (it has no concept of a ToC
// sub-level — this book's contents page lists every subsection, e.g. "10.1 Specific Heat
// Capacity", not just the 12 real chapter/unit titles) and the header-clustering detector
// found 29 "chapters" (each real unit was split into up to 3 near-duplicate detections, e.g.
// "Unit Heat Capacity...", "Heat Capacity... Unit", "Unit Heat Capacity... Title" — a
// three-way echo of the same running header). Both numbers were obvious nonsense for what
// should be a normal ~12-chapter physics book, so this was reconstructed entirely from direct
// OCR inspection rather than trusting either automated signal:
//
// This book's own internal numbering continues from a presumed Class 9 volume (its chapters
// are printed "Unit 10" through "Unit 21", not "Unit 1"-"Unit 12") — confirmed by checking the
// live DB: this project's own Physics 9 uses chapterNo 1-8. Mapped Unit 10->chapterNo 1 etc.
// below, consistent with how Chemistry 10 and Biology 10 both restart chapterNo at 1 rather
// than continuing their own Class 9 sibling's numbering.
//
// Every boundary was found via this book's own two-stage opening pattern (unlike Chemistry 10/
// Biology 10, where the ALL-CAPS title leads): each unit opens with an un-headed "hook"
// question + "The students will:" + "[SLO: P-10-...]" list, and the ALL-CAPS unit title only
// appears a page (sometimes more) later, still mid-SLO-list. The hook page — not the titled
// page — is the true start; every one below was confirmed directly:
//   Ch.1  Heat Capacity And Modes Of Heat Transfer:  11  (Unit 10; ToC hint also 11 - matches)
//   Ch.2  Thermal Expansion And Change Of State:     45  (Unit 11; ToC hint also 45 - matches)
//   Ch.3  Waves:                                     75  (Unit 12; ToC hint also 75 - matches)
//   Ch.4  Sound:                                     93  (Unit 13; ToC hint also 93 - matches)
//   Ch.5  Optics:                                    121 (Unit 14; title missing from the ToC's
//                                                          own OCR entirely - recovered directly)
//   Ch.6  Electrostatics:                            159 (Unit 15; ditto, title missing from ToC)
//   Ch.7  Current Electricity:                       185 (Unit 16; ditto, title missing from ToC)
//   Ch.8  Electric Circuits:                         205 (Unit 17; ToC page-numbers column paired
//                                                          the title to 206 - the hook page a
//                                                          page earlier is the real start)
//   Ch.9  Electronics:                               235 (Unit 18)
//   Ch.10 Electromagnetism:                          259 (Unit 19)
//   Ch.11 Electromagnetic Waves:                     281 (Unit 20; ToC hint 282 for its first
//                                                          subsection - hook page 1 earlier)
//   Ch.12 Nuclear Physics:                           309 (Unit 21; ToC hint also 309 - matches)
// Chapter 12 runs to the end of the book (364), bundling in the trailing Glossary/Index/
// Bibliography/Authors Profile back matter - consistent with how Biology 10's trailing
// Glossary was handled, not specially excluded.
//
//   npx tsx scripts/crawler-verify/_ingest-physics10-real-pdf.ts

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

const OCR_CHECKSUM = '7e1ed09b9b0334e51163feaa63a3830042cf3ca2473ffacaeff4d5206514243d';
const PDF_CACHE_PATH = 'data/.pdf-cache/13aeb38538d4445bb7a5eba79fe98a8f05a2179d322482c9717582dd8d8bcc46.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 10, subject: 'physics' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Heat Capacity And Modes Of Heat Transfer', pageFrom: 11 },
  { chapterNo: 2, chapterTitle: 'Thermal Expansion And Change Of State', pageFrom: 45 },
  { chapterNo: 3, chapterTitle: 'Waves', pageFrom: 75 },
  { chapterNo: 4, chapterTitle: 'Sound', pageFrom: 93 },
  { chapterNo: 5, chapterTitle: 'Optics', pageFrom: 121 },
  { chapterNo: 6, chapterTitle: 'Electrostatics', pageFrom: 159 },
  { chapterNo: 7, chapterTitle: 'Current Electricity', pageFrom: 185 },
  { chapterNo: 8, chapterTitle: 'Electric Circuits', pageFrom: 205 },
  { chapterNo: 9, chapterTitle: 'Electronics', pageFrom: 235 },
  { chapterNo: 10, chapterTitle: 'Electromagnetism', pageFrom: 259 },
  { chapterNo: 11, chapterTitle: 'Electromagnetic Waves', pageFrom: 281 },
  { chapterNo: 12, chapterTitle: 'Nuclear Physics', pageFrom: 309 },
];
const BOOK_LAST_PAGE = 364;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Physics 10.`);

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

  console.log('\nDone. Physics 10 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
