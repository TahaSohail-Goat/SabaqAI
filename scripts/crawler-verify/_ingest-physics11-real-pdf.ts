// Physics 11 — first real ingest, correct boundaries from the start.
//
// New HSSC-I textbook. The automatic dry-run found a real ToC (14 entries) but miscounted it
// as 15 (its own back matter — Glossary/Bibliography/Authors' Profile — got read as one extra
// line) and only detected 13 chapters via clustering (one merge somewhere). The real ToC is
// fully clean and legible; every single one of its 14 page hints was verified directly against
// the OCR and landed exactly on that unit's own "TITLE / The students will: / Student Learning
// Outcomes (SLOs)" opening page with zero lag — used here as fully authoritative, the same way
// Physics 12's ToC was found to be earlier in this same HSSC batch:
//   Ch.1  Physical Quantities And Measurements: 7
//   Ch.2  Vectors:                              22
//   Ch.3  Translatory Motion:                   32
//   Ch.4  Rotational And Circular Motion:       53
//   Ch.5  Work And Kinetic Energy:               77
//   Ch.6  Fluid Mechanics:                       88
//   Ch.7  Physics Of Solids:                     112
//   Ch.8  Heat And Thermodynamics:               127
//   Ch.9  Waves:                                 154
//   Ch.10 Electrostatics:                        184
//   Ch.11 Electricity:                           197
//   Ch.12 Magnetism:                             219
//   Ch.13 Relativity:                            246
//   Ch.14 Particle Physics:                      257
// Chapter 14 runs to the end of the book (292), bundling in the trailing Glossary/Bibliography/
// Authors' Profile back matter, consistent with every other book this session.
//
//   npx tsx scripts/crawler-verify/_ingest-physics11-real-pdf.ts

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

const OCR_CHECKSUM = 'fc7ffdb7224fcd4fb9292138d6a5924f0cdcabed39956dc4ff0207f292035a53';
const PDF_CACHE_PATH = 'data/.pdf-cache/85063475e566dbb8eef2e3f6ff07b94e005f9f244e6e1512dace4145af3b7c26.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 11, subject: 'physics' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Physical Quantities And Measurements', pageFrom: 7 },
  { chapterNo: 2, chapterTitle: 'Vectors', pageFrom: 22 },
  { chapterNo: 3, chapterTitle: 'Translatory Motion', pageFrom: 32 },
  { chapterNo: 4, chapterTitle: 'Rotational And Circular Motion', pageFrom: 53 },
  { chapterNo: 5, chapterTitle: 'Work And Kinetic Energy', pageFrom: 77 },
  { chapterNo: 6, chapterTitle: 'Fluid Mechanics', pageFrom: 88 },
  { chapterNo: 7, chapterTitle: 'Physics Of Solids', pageFrom: 112 },
  { chapterNo: 8, chapterTitle: 'Heat And Thermodynamics', pageFrom: 127 },
  { chapterNo: 9, chapterTitle: 'Waves', pageFrom: 154 },
  { chapterNo: 10, chapterTitle: 'Electrostatics', pageFrom: 184 },
  { chapterNo: 11, chapterTitle: 'Electricity', pageFrom: 197 },
  { chapterNo: 12, chapterTitle: 'Magnetism', pageFrom: 219 },
  { chapterNo: 13, chapterTitle: 'Relativity', pageFrom: 246 },
  { chapterNo: 14, chapterTitle: 'Particle Physics', pageFrom: 257 },
];
// 291, not 292 - the book's actual final page is blank (0 chars OCR'd) and its rasterized JPEG
// is rejected by pdf-lib's embedder despite having a valid SOI marker; see
// _finish-physics11-ch14.ts's own header comment for the full diagnosis.
const BOOK_LAST_PAGE = 291;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Physics 11.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-14) before ingesting...');
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

  console.log('\nDone. Physics 11 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
