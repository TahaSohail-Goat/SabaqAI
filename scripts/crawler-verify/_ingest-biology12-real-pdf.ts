// Biology 12 — first real ingest, correct boundaries from the start.
//
// New HSSC-II textbook. The automatic dry-run badly undercounted (8 detected vs. 15 real
// chapters) with several huge merged blocks (one spanning 92-161, another 192-251) — the same
// failure mode found repeatedly this session. A real, exceptionally clean table of contents
// exists on page 6 (garbled by 2-column OCR splitting but fully reconstructable) listing all 15
// chapters with real page numbers; every single one was verified directly against the OCR and
// landed exactly on that chapter's own "TITLE / Students' learning outcomes / After studying
// this chapter, students will be able to:" opening page, with zero lag on any of them — as
// clean a match as Biology 9/Math 9/Math 11's own clean ToCs earlier this session, used here as
// fully authoritative:
//   Ch.1  Digestive System Of Man:              7
//   Ch.2  Blood Circulatory System Of Man:      27
//   Ch.3  Respiratory System Of Man:            54
//   Ch.4  Urinary System Of Man:                70
//   Ch.5  Nervous System Of Man:                85
//   Ch.6  Endocrine System Of Man:               116
//   Ch.7  Skeletal System Of Man:                133
//   Ch.8  Thermoregulation, Homeostasis:         154
//   Ch.9  Immunity:                              167
//   Ch.10 Biotechnology:                         189
//   Ch.11 Biostatistics And Data Handling:       210 (ToC itself says "Biostatic and Data
//                                                      Analyzing" but the chapter's own clean
//                                                      printed title, "BIOSTATISTICS AND DATA
//                                                      HANDLING", is used instead)
//   Ch.12 Structural And Computational Biology:  237 (ToC says "Structural Biology and
//                                                      Computational Biology" - reordered to
//                                                      match the chapter's own printed title)
//   Ch.13 Climate Change:                        244
//   Ch.14 Selected Topics:                        261
//   Ch.15 Pharmacological Drugs:                  271
// Chapter 15 runs to the end of the book (292), bundling in the trailing Glossary back matter
// (ToC hint 279), consistent with every other book this session.
//
//   npx tsx scripts/crawler-verify/_ingest-biology12-real-pdf.ts

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

const OCR_CHECKSUM = '53c1ac052f0039f2b8c4be0736cde13016f2ad1cef33782a79ca19a278472903';
const PDF_CACHE_PATH = 'data/.pdf-cache/d8a77ff1c6f257ff9da3955ac743db14337f89aa0369beec28623d8d4f194bcf.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 12, subject: 'biology' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Digestive System Of Man', pageFrom: 7 },
  { chapterNo: 2, chapterTitle: 'Blood Circulatory System Of Man', pageFrom: 27 },
  { chapterNo: 3, chapterTitle: 'Respiratory System Of Man', pageFrom: 54 },
  { chapterNo: 4, chapterTitle: 'Urinary System Of Man', pageFrom: 70 },
  { chapterNo: 5, chapterTitle: 'Nervous System Of Man', pageFrom: 85 },
  { chapterNo: 6, chapterTitle: 'Endocrine System Of Man', pageFrom: 116 },
  { chapterNo: 7, chapterTitle: 'Skeletal System Of Man', pageFrom: 133 },
  { chapterNo: 8, chapterTitle: 'Thermoregulation, Homeostasis', pageFrom: 154 },
  { chapterNo: 9, chapterTitle: 'Immunity', pageFrom: 167 },
  { chapterNo: 10, chapterTitle: 'Biotechnology', pageFrom: 189 },
  { chapterNo: 11, chapterTitle: 'Biostatistics And Data Handling', pageFrom: 210 },
  { chapterNo: 12, chapterTitle: 'Structural And Computational Biology', pageFrom: 237 },
  { chapterNo: 13, chapterTitle: 'Climate Change', pageFrom: 244 },
  { chapterNo: 14, chapterTitle: 'Selected Topics', pageFrom: 261 },
  { chapterNo: 15, chapterTitle: 'Pharmacological Drugs', pageFrom: 271 },
];
const BOOK_LAST_PAGE = 292;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Biology 12.`);

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

  console.log('\nDone. Biology 12 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
