// Computer Science 10 — first real ingest, correct boundaries from the start.
//
// New textbook (see Computer Science 9's own ingest script comment for the full context —
// Computer Science had only past_paper/model_paper entries until 2026-09-06, no textbook for
// either class). This one's automatic dry-run HALTED outright: "No chapter headings detected in
// OCR output" — the ToC detector had a false POSITIVE (a different failure mode than every
// other book this session), flagging page 13 (a decimal-to-binary worked-example page deep in
// Unit 1) as the table of contents instead of the REAL one on pages 5-6, which apparently threw
// off the header-clustering step badly enough to find zero chapters at all.
//
// The real ToC (pages 5-6) lists 8 units, not the 0 the automated detector found. Every
// boundary below was found directly: each real unit opens with "Learning Outcomes / At the end
// of this unit students will be able to:" (this book's own SLO phrasing, distinct from Grade
// 9's "After completing this lesson..." but the same structural pattern), confirmed against
// the ToC's own subsection page hints where legible:
//   Ch.1 Computer Systems:                      7   (ToC hint for 1.1 is 8 - 1 page earlier,
//                                                     same SLO-precedes-title pattern as always)
//   Ch.2 Computational Thinking And Algorithms: 53
//   Ch.3 Programming Fundamentals:               74  (ToC hint for 3.3 is 92, consistent)
//   Ch.4 Data And Analysis:                     116  (ToC hint for 4.1 is 117)
//   Ch.5 Applications Of Computer Science:      147  (ToC hint for 5.1 is 148)
//   Ch.6 Impacts Of Computing:                  174  (ToC hint for 6.1 is 175)
//   Ch.7 Digital Literacy:                      199  (title explicitly visible: "Unit 7:
//                                                      Digital Literacy")
//   Ch.8 Entrepreneurship:                      222  (unit title itself missing from both the
//                                                      ToC's own OCR and this page's text, but
//                                                      its SLOs - "pitch a business idea",
//                                                      "market insights for an entrepreneurial
//                                                      solution" - and subsection topics ToC
//                                                      lists for it - quantitative/qualitative
//                                                      research, market validation, business
//                                                      pitching - match Grade 9's own
//                                                      "Entrepreneurship" unit exactly)
//
//   npx tsx scripts/crawler-verify/_ingest-computerscience10-real-pdf.ts

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

const OCR_CHECKSUM = 'd43ab26d4ae5275eb369251a183d802adadc1f7df648d556d6eaa6b59c1cee23';
const PDF_CACHE_PATH = 'data/.pdf-cache/6f1496a1732189388f0585bd51941622146da6fce4fb62757231b732c8d8161e.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 10, subject: 'computer_science' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Computer Systems', pageFrom: 7 },
  { chapterNo: 2, chapterTitle: 'Computational Thinking And Algorithms', pageFrom: 53 },
  { chapterNo: 3, chapterTitle: 'Programming Fundamentals', pageFrom: 74 },
  { chapterNo: 4, chapterTitle: 'Data And Analysis', pageFrom: 116 },
  { chapterNo: 5, chapterTitle: 'Applications Of Computer Science', pageFrom: 147 },
  { chapterNo: 6, chapterTitle: 'Impacts Of Computing', pageFrom: 174 },
  { chapterNo: 7, chapterTitle: 'Digital Literacy', pageFrom: 199 },
  { chapterNo: 8, chapterTitle: 'Entrepreneurship', pageFrom: 222 },
];
const BOOK_LAST_PAGE = 262;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Computer Science 10.`);

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

  console.log('\nDone. Computer Science 10 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
