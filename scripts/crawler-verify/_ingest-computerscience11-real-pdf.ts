// Computer Science 11 — first real ingest, correct boundaries from the start.
//
// New HSSC-I textbook. The automatic dry-run detection was badly wrong (no ToC found, only 3
// "chapters" detected with nonsensical ranges — one even had pageFrom > pageTo). A real table of
// contents exists on pages 4-5, listing 8 real units; every boundary below was found directly:
// each real unit opens with "After completing this lesson, you will [be able to]:" followed a
// page later by "UNIT INTRODUCTION" prose (this book's own two-stage opening pattern, distinct
// from Grade 9/10/12's phrasing but structurally the same idea) — confirmed against the ToC's
// own subsection page hints where legible:
//   Ch.1 Computer Systems:                      6   (ToC hint for 1.3 is 9, consistent)
//   Ch.2 Computational Thinking And Algorithms: 69
//   Ch.3 Programming Fundamentals:               98  (ToC hint for 3.4 is 102, consistent)
//   Ch.4 Data And Analysis:                     127  (ToC hint for 4.1 is 128 - 1 page later,
//                                                      same SLO-precedes-title/intro pattern)
//   Ch.5 Application Of Computer Science:       154  (ToC hint for 5.4 is 160, consistent)
//   Ch.6 Impacts Of Computing:                  169  (page itself says "Chapter 06")
//   Ch.7 Digital Literacy:                      189  (title explicitly visible)
//   Ch.8 Entrepreneurship In Digital Age:       203  (title explicitly visible, exact ToC match)
// Pages 225-226 are back matter (author bio, acknowledgments), bundled into chapter 8 per the
// usual convention for trailing back matter.
//
//   npx tsx scripts/crawler-verify/_ingest-computerscience11-real-pdf.ts

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

const OCR_CHECKSUM = '8de53a6d90e8eeea8979ee25220c18a91fe0c0d99f79d3c13050c1a940d8544e';
const PDF_CACHE_PATH = 'data/.pdf-cache/732ded216714e70d92eb0ccc826adf0bb5ca91672943ff8763ecf980c76ebc5e.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 11, subject: 'computer_science' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Computer Systems', pageFrom: 6 },
  { chapterNo: 2, chapterTitle: 'Computational Thinking And Algorithms', pageFrom: 69 },
  { chapterNo: 3, chapterTitle: 'Programming Fundamentals', pageFrom: 98 },
  { chapterNo: 4, chapterTitle: 'Data And Analysis', pageFrom: 127 },
  { chapterNo: 5, chapterTitle: 'Application Of Computer Science', pageFrom: 154 },
  { chapterNo: 6, chapterTitle: 'Impacts Of Computing', pageFrom: 169 },
  { chapterNo: 7, chapterTitle: 'Digital Literacy', pageFrom: 189 },
  { chapterNo: 8, chapterTitle: 'Entrepreneurship In Digital Age', pageFrom: 203 },
];
const BOOK_LAST_PAGE = 226;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Computer Science 11.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-8) before ingesting...');
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

  console.log('\nDone. Computer Science 11 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
