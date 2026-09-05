// Physics 11 Chapter 14 "Particle Physics" (pages 257-291) only - a standalone finisher.
//
// The full _ingest-physics11-real-pdf.ts run reliably succeeds through chapters 1-13 and then
// fails on chapter 14 with "SOI not found in JPEG" from pdf-lib's JpegEmbedder - reproduced
// three times, including twice in complete isolation (ruling out resource contention with other
// concurrent jobs, and ruling out cumulative memory pressure from a long-running process).
// Traced to one specific page: page 292, the book's very last page, is genuinely blank (0
// characters of OCR text - confirmed) and its rasterized JPEG, despite having a byte-correct
// SOI marker (FF D8 FF E0) when inspected directly, is something pdf-lib's own JPEG parser
// rejects anyway (likely an edge case in how poppler encodes a near-featureless/blank page,
// e.g. a minimal/degenerate JFIF structure pdf-lib doesn't handle). Page 291 is "About the
// Authors" back matter; page 292 has zero real content. Fixed by simply excluding page 292 -
// chapter 14 now ends at 291, not 292.
//
//   npx tsx scripts/crawler-verify/_finish-physics11-ch14.ts

import fs from 'node:fs';
import path from 'node:path';
process.loadEnvFile(path.join(process.cwd(), '.env.local'));

import { requireServiceRoleClient } from '../../src/lib/supabase/admin';
import { buildChapterSections } from '../../src/lib/crawler/structure/textbook-chapters';
import { rebuildChapterPdf } from '../../src/lib/crawler/pdf-rebuild';
import { sourcePdfPath, uploadSourcePdf, ensureSourcePdfBucket } from '../../src/lib/storage/source-pdfs';
import { resetChapterSource, ingestDocument } from '../../src/lib/crawler/ingest-adapter';
import type { SourceDocument } from '../../src/lib/ingest/chunker';
import type { OcrPage } from '../../src/lib/crawler/ocr';

const OCR_CHECKSUM = 'fc7ffdb7224fcd4fb9292138d6a5924f0cdcabed39956dc4ff0207f292035a53';
const PDF_CACHE_PATH = 'data/.pdf-cache/85063475e566dbb8eef2e3f6ff07b94e005f9f244e6e1512dace4145af3b7c26.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 11, subject: 'physics' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTER = { chapterNo: 14, chapterTitle: 'Particle Physics', pageFrom: 257, pageTo: 291 };

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);

  const chapterSections = buildChapterSections(pages, [CHAPTER], new Set());
  const sections = chapterSections.find((c) => c.chapterNo === 14)?.sections ?? [];
  if (sections.length === 0) throw new Error('0 sections produced for chapter 14 - aborting.');

  await resetChapterSource(admin, { ...FIXTURE, chapterNo: 14, sourceType: 'textbook', language: 'en' });

  const doc: SourceDocument = { ...FIXTURE, chapterNo: 14, chapterTitle: CHAPTER.chapterTitle, sourceType: 'textbook', language: 'en', sections };
  const chapterPdf = await rebuildChapterPdf(pdfBuf, CHAPTER.pageFrom, CHAPTER.pageTo);
  const storagePath = sourcePdfPath({ ...FIXTURE, sourceType: 'textbook', chapterNo: 14, language: 'en' });
  await uploadSourcePdf(admin, storagePath, chapterPdf);

  const result = await ingestDocument(admin, doc, { embedRetry: EMBED_RETRY });
  console.log(`Ch.14 "${CHAPTER.chapterTitle}" (pages ${CHAPTER.pageFrom}-${CHAPTER.pageTo}) -> ${result.chunksWritten}/${result.chunksReceived} chunk(s), PDF ${(chapterPdf.length / 1024 / 1024).toFixed(1)}MB`);

  const { data: chapterRow } = await admin.from('chapters').select('id')
    .eq('board_code', FIXTURE.board).eq('class_level', FIXTURE.classLevel).eq('subject_code', FIXTURE.subject).eq('chapter_no', 14)
    .maybeSingle();
  if (chapterRow) {
    await admin.from('chapter_sources').update({ storage_path: storagePath })
      .eq('chapter_id', chapterRow.id).eq('source_type', 'textbook').eq('language_code', 'en');
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
