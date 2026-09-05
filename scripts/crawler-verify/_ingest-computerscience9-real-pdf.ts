// Computer Science 9 — first real ingest, correct boundaries from the start.
//
// New textbook (Computer Science had only past_paper/model_paper entries until 2026-09-06 —
// no textbook at all for either class 9 or 10). The automatic dry-run detection was badly
// wrong: it found only 4 "chapters" for what a real (if garbled) table of contents on pages
// 5-6 shows is 7 real units — Unit 2 (Computational Thinking & Algorithms), Unit 3 (Programming
// Fundamentals), and Unit 4 (Data and Analysis) were completely undetected, all three swallowed
// into one 117-page mislabeled block ("Punt Computer Systems", pages 14-130) — the same failure
// mode Math 10/Biology 10 hit earlier this session. Unit 7 (Entrepreneurship) was also missing
// entirely, absorbed into the tail of "Impacts Of Computing".
//
// Every boundary below was found directly: each real unit opens with "After completing this
// lesson, you will be able to:" (this book's own SLO phrasing) followed a page later by the
// ALL-CAPS/Title-Case unit heading — confirmed against the ToC's own subsection page hints
// where legible:
//   Ch.1 Computer Systems:                    7   (detected 9; matches ToC hint for 1.1 ~p8)
//   Ch.2 Computational Thinking And Algorithms: 53 (detected: not found at all - merged into
//                                                    the detector's over-wide "Ch.2" span)
//   Ch.3 Programming Fundamentals:            76  (detected: not found at all, ditto)
//   Ch.4 Data And Analysis:                   112 (detected: not found at all, ditto)
//   Ch.5 Applications Of Computer Science:    131 (detected 131 - matches exactly)
//   Ch.6 Impacts Of Computing:                153 (detected 153 - matches exactly)
//   Ch.7 Entrepreneurship:                    176 (detected: not found at all - merged into
//                                                    the tail of the detector's "Impacts" chapter)
//
//   npx tsx scripts/crawler-verify/_ingest-computerscience9-real-pdf.ts

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

const OCR_CHECKSUM = 'c7316115d79de064bf56e1b3bfd714164f53beffb6ad677934879a7036682974';
const PDF_CACHE_PATH = 'data/.pdf-cache/39e4558ff90826a730c840410781b453f526f79bf062951406e7f6f6637d366f.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 9, subject: 'computer_science' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Computer Systems', pageFrom: 7 },
  { chapterNo: 2, chapterTitle: 'Computational Thinking And Algorithms', pageFrom: 53 },
  { chapterNo: 3, chapterTitle: 'Programming Fundamentals', pageFrom: 76 },
  { chapterNo: 4, chapterTitle: 'Data And Analysis', pageFrom: 112 },
  { chapterNo: 5, chapterTitle: 'Applications Of Computer Science', pageFrom: 131 },
  { chapterNo: 6, chapterTitle: 'Impacts Of Computing', pageFrom: 153 },
  { chapterNo: 7, chapterTitle: 'Entrepreneurship', pageFrom: 176 },
];
const BOOK_LAST_PAGE = 194;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Computer Science 9.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-7) before ingesting...');
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

  console.log('\nDone. Computer Science 9 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
