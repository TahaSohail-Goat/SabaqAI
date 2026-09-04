// Urgent, one-off fix — Biology 9's automatic detection got the right chapter COUNT (10) and
// mostly-clean titles, but 7 of 10 chapters had a real boundary error — the widest-spread case
// of the "objectives page doesn't repeat the running header" pattern found across all three
// textbooks fixed this session (Chemistry 9, Math 10, now this one). Every pageFrom below was
// confirmed by direct inspection of the cached OCR, including a genuine table of contents on
// page 4 that the detector's own ToC-detection missed entirely ("No table of contents detected
// in the first 15 pages" was WRONG — it exists, just garbled into a jumbled two-column OCR read
// that didn't match the detector's ToC-line regex; used here only as a soft cross-check, not
// as ground truth, since attempting to realign its numbers to titles produced contradictions
// with direct page reads for at least 3 chapters):
//   Ch1 The Science of Biology: p5  (was p17 — a 12-page lag, the largest found this session;
//     p4 is the real ToC, p5 is Ch1's own "SLOs: After completing this lesson..." page)
//   Ch2 Biodiversity: p20 (was p27; confirmed both directly AND by the one ToC number that
//     didn't contradict direct evidence)
//   Ch3 The Cell: p31 (was p32 — 1 page, minor; p31 has a typo'd "The Celt" SLOs page)
//   Ch4 Cell Cycle: p48 (was p54 — 6 pages; also the one case where a naive ToC-number
//     reconstruction agreed with direct inspection)
//   Ch5 Tissues, Organs and Organ Systems: p64 (matches original detection — no lag here)
//   Ch6 Molecular Biology: p77 (was p81 — 4 pages)
//   Ch7 Metabolism: p94 (was p96 — 2 pages; p93 is ambiguous, arguably still Ch6's own closing
//     diagram, so not claimed for Ch7 without clearer evidence)
//   Ch8 Plant Physiology: p112 (was p113 — 1 page, minor)
//   Ch9 Plant Reproduction: p129 (matches original detection — no lag here)
//   Ch10 Evolution: p146 (was p150 — 4 pages)
// Titles: only Ch5 and Ch6 needed cleanup (a duplicated "Organs systems" -> "Organ Systems",
// and a stray trailing "J" respectively) — everything else the detector already had right.
//
//   npx tsx scripts/crawler-verify/_fix-biology9-titles.ts

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

const OCR_CHECKSUM = '990a2882d1747d803a279f60e1384b234a2d7027b339b367b1d32e15effce33e';
const PDF_CACHE_PATH = 'data/.pdf-cache/84e617fd007c72746c0629ebd886cd2aaf737c99627a57ecf7b77d1675da5e64.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 9, subject: 'biology' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'The Science of Biology', pageFrom: 5 },
  { chapterNo: 2, chapterTitle: 'Biodiversity', pageFrom: 20 },
  { chapterNo: 3, chapterTitle: 'The Cell', pageFrom: 31 },
  { chapterNo: 4, chapterTitle: 'Cell Cycle', pageFrom: 48 },
  { chapterNo: 5, chapterTitle: 'Tissues, Organs and Organ Systems', pageFrom: 64 },
  { chapterNo: 6, chapterTitle: 'Molecular Biology', pageFrom: 77 },
  { chapterNo: 7, chapterTitle: 'Metabolism', pageFrom: 94 },
  { chapterNo: 8, chapterTitle: 'Plant Physiology', pageFrom: 112 },
  { chapterNo: 9, chapterTitle: 'Plant Reproduction', pageFrom: 129 },
  { chapterNo: 10, chapterTitle: 'Evolution', pageFrom: 146 },
];
const BOOK_LAST_PAGE = 168;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Biology 9.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-10) before re-ingesting...');
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

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
