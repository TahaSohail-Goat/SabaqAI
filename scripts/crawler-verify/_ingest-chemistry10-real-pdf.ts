// Chemistry 10 — first real ingest, correct boundaries from the start.
//
// This is a NEW textbook (Class 10 science was entirely missing from the manifest until
// 2026-09-04 — see textbooks.json's own comment on this entry), not a fix of previously-wrong
// live data. Still applied the same careful direct-OCR boundary check used on every other book
// this session before ingesting, rather than trusting the automatic detector's dry-run output
// as-is — good thing, since ALL 13 of its 13 chapters turned out to have the same "objectives/
// SLOs page doesn't repeat the running header" lag bug found in 4 of the 5 earlier books, some
// worse than anything seen so far (Ch.11 was 5 pages late, Ch.6 was 4 pages late). Every
// pageFrom below was confirmed directly against the cached OCR — each corrected page opens
// with the chapter's own ALL-CAPS title followed by "Student Learning Outcomes (SLOs)", one
// page (or several) earlier than the automatic detector had placed it:
//   Ch.1  History Of Chemistry:          7   (detected 9;  2-page lag)
//   Ch.2  Matter:                        14  (detected 15; 1-page lag)
//   Ch.3  Stoichiometry:                 26  (detected 27; 1-page lag)
//   Ch.4  Electrochemistry:              46  (detected 47; 1-page lag)
//   Ch.5  Reaction Kinetics:             63  (detected 64; 1-page lag)
//   Ch.6  Salts:                         74  (detected 78; 4-page lag — largest besides Ch.11)
//   Ch.7  Nitrogen, Sulphur And Metals:  82  (detected 83; 1-page lag)
//   Ch.8  Organic Chemistry:             95  (detected 98; 3-page lag)
//   Ch.9  Hydrocarbons:                  109 (detected 110; 1-page lag)
//   Ch.10 Hydroxy Compounds:             123 (detected 124; 1-page lag)
//   Ch.11 Carboxylic Compounds:          129 (detected 134; 5-page lag — largest in this book)
//   Ch.12 Polymers:                      137 (detected 138; 1-page lag)
//   Ch.13 Biochemistry:                  147 (detected 148; 1-page lag)
// A real (if heavily OCR-garbled) table of contents exists on page 6 — "No table of contents
// detected" was wrong here too (same as Biology 9) — but it was legible enough to independently
// corroborate only the Ch.4 (46) and Ch.8 (95) starts; treated as a soft cross-check only, not
// authoritative, consistent with how Biology 9's own garbled ToC was handled.
//
// Titles: the automatic detector's titles were otherwise clean except for 4 chapters that
// picked up trailing OCR-noise fragments from adjacent text ("Salts Fi", "Nitrogen, Sulphur
// And Metals . 7", "Organic Chemistry Om'", "Biochemistry Os") — corrected below by reading the
// chapter's own clean ALL-CAPS title line directly.
//
//   npx tsx scripts/crawler-verify/_ingest-chemistry10-real-pdf.ts

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

const OCR_CHECKSUM = '018bce96077ad3462f55ed3775999e4d62c89b956d1343e674769cccbf5aad04';
const PDF_CACHE_PATH = 'data/.pdf-cache/5f66c8f89999120b77a950823b5303f9f18307dc9689e2e21120f7dfa0d197c0.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 10, subject: 'chemistry' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'History Of Chemistry', pageFrom: 7 },
  { chapterNo: 2, chapterTitle: 'Matter', pageFrom: 14 },
  { chapterNo: 3, chapterTitle: 'Stoichiometry', pageFrom: 26 },
  { chapterNo: 4, chapterTitle: 'Electrochemistry', pageFrom: 46 },
  { chapterNo: 5, chapterTitle: 'Reaction Kinetics', pageFrom: 63 },
  { chapterNo: 6, chapterTitle: 'Salts', pageFrom: 74 },
  { chapterNo: 7, chapterTitle: 'Nitrogen, Sulphur And Metals', pageFrom: 82 },
  { chapterNo: 8, chapterTitle: 'Organic Chemistry', pageFrom: 95 },
  { chapterNo: 9, chapterTitle: 'Hydrocarbons', pageFrom: 109 },
  { chapterNo: 10, chapterTitle: 'Hydroxy Compounds', pageFrom: 123 },
  { chapterNo: 11, chapterTitle: 'Carboxylic Compounds', pageFrom: 129 },
  { chapterNo: 12, chapterTitle: 'Polymers', pageFrom: 137 },
  { chapterNo: 13, chapterTitle: 'Biochemistry', pageFrom: 147 },
];
const BOOK_LAST_PAGE = 164;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Chemistry 10.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-13) before ingesting...');
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

  console.log('\nDone. Chemistry 10 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
