// Urdu 9 — first real ingest, correct boundaries from the start.
//
// New SSC-I arts-subject textbook (130 pages, a mixed prose/poem anthology). The automatic
// dry-run found no chapter headings at all — same root cause as every Urdu-script book this
// batch: the header-clustering algorithm looks for an ALL-CAPS running header, a concept that
// doesn't exist in Urdu script. This book's own front-matter ToC (page 4) was too badly
// OCR-garbled to read even at 300 DPI (the fix in src/lib/crawler/ocr.ts's OCR_DPI_URDU, applied
// to this book too) — a worse scan than Urdu 10/11/12's front matter.
//
// This book also had far weaker structural signal than the other three Urdu textbooks: the
// recurring SLO-style intro phrase ("...کے بعد آپ اس قابل ہو جائیں گے کہ...") that cleanly
// marked every lesson in Urdu 10/11/12 appears only twice here (pages 86 and, less legibly,
// nowhere else) — this book's lessons mostly open directly into prose/poem content without that
// intro line surviving OCR at all. Boundaries below were instead found by directly sampling
// page content every ~5 pages across the whole book, then reading each candidate transition
// exactly: a change in genre (essay -> dialogue/play -> travelogue -> poem), a real title or
// author name appearing (e.g. "علامہ اقبال" / Allama Iqbal at p87, "خواجہ حیدر علی آتش" at
// p110), or a blank page (p75) that lines up with a genre change either side of it.
//   Ch.1: 5    (essay, ethics)
//   Ch.2: 20   (essay, referencing a short story titled "تاوان")
//   Ch.3: 30   (dialogue / one-act play, husband-and-wife scene)
//   Ch.4: 65   (travelogue)
//   Ch.5: 73   (short essay)
//   Ch.6: 76   (poem)
//   Ch.7: 86   (poem by Allama Iqbal, confirmed via author name + dates on the following page)
//   Ch.8: 110  (poem by Khawaja Haider Ali Aatish, confirmed via author name on the same page)
// Pages 1-4 are cover/preface/ToC; pages 129-130 are "About the Authors" back matter — both
// excluded. All 8 chapters partition pages 5-128 with zero gaps or overlaps (verified: sum of
// per-chapter page counts + front matter + back matter = 130, the exact total). This is the
// lowest-confidence reconstruction of the four Urdu textbooks this batch — every boundary was
// checked against real content, but this book's OCR and structural signal were both weaker than
// Urdu 10/11/12, so a couple of the shorter chapters (5 and 6 especially) rest on a genre-change
// read rather than an explicit marker the way most other chapters in this batch do. Titles are
// generic ("Chapter N") for the same reason as the other Urdu textbooks: printed titles could
// not be reliably OCR'd at this scan quality.
//
//   npx tsx scripts/crawler-verify/_ingest-urdu9-real-pdf.ts

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

const OCR_CHECKSUM = 'fdf0efd9d5e124497f452e16b17aa3065fe89f47659e390823e68bab2ed2bd83';
const PDF_CACHE_PATH = 'data/.pdf-cache/b3a30c3ef3b4aaa216f6bfa3b1d54ad1b7d611775a574e3d8c47276d6377dc4f.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 9, subject: 'urdu' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Chapter 1', pageFrom: 5 },
  { chapterNo: 2, chapterTitle: 'Chapter 2', pageFrom: 20 },
  { chapterNo: 3, chapterTitle: 'Chapter 3', pageFrom: 30 },
  { chapterNo: 4, chapterTitle: 'Chapter 4', pageFrom: 65 },
  { chapterNo: 5, chapterTitle: 'Chapter 5', pageFrom: 73 },
  { chapterNo: 6, chapterTitle: 'Chapter 6', pageFrom: 76 },
  { chapterNo: 7, chapterTitle: 'Chapter 7', pageFrom: 86 },
  { chapterNo: 8, chapterTitle: 'Chapter 8', pageFrom: 110 },
];
const BOOK_LAST_PAGE = 128;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Urdu 9.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-8) before ingesting...');
  for (const c of detected) {
    await resetChapterSource(admin, { ...FIXTURE, chapterNo: c.chapterNo, sourceType: 'textbook', language: 'ur' });
  }
  console.log('Reset complete.\n');

  for (const { chapterNo, sections } of chapterSections) {
    if (sections.length === 0) {
      console.log(`Ch.${chapterNo}: 0 sections produced, skipping.`);
      continue;
    }
    const chapter = detected.find((c) => c.chapterNo === chapterNo)!;

    const doc: SourceDocument = { ...FIXTURE, chapterNo, chapterTitle: chapter.chapterTitle, sourceType: 'textbook', language: 'ur', sections };

    const chapterPdf = await rebuildChapterPdf(pdfBuf, chapter.pageFrom, chapter.pageTo);
    const storagePath = sourcePdfPath({ ...FIXTURE, sourceType: 'textbook', chapterNo, language: 'ur' });
    await uploadSourcePdf(admin, storagePath, chapterPdf);

    const result = await ingestDocument(admin, doc, { embedRetry: EMBED_RETRY });
    console.log(`Ch.${chapterNo} "${chapter.chapterTitle}" (pages ${chapter.pageFrom}-${chapter.pageTo}) -> ${result.chunksWritten}/${result.chunksReceived} chunk(s), PDF ${(chapterPdf.length / 1024 / 1024).toFixed(1)}MB`);

    const { data: chapterRow } = await admin.from('chapters').select('id')
      .eq('board_code', FIXTURE.board).eq('class_level', FIXTURE.classLevel).eq('subject_code', FIXTURE.subject).eq('chapter_no', chapterNo)
      .maybeSingle();
    if (chapterRow) {
      await admin.from('chapter_sources').update({ storage_path: storagePath })
        .eq('chapter_id', chapterRow.id).eq('source_type', 'textbook').eq('language_code', 'ur');
    }
  }

  console.log('\nDone. Urdu 9 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
