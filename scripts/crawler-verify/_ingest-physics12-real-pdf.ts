// Physics 12 — first real ingest, correct boundaries from the start.
//
// New HSSC-II textbook. The automatic dry-run detection found a real, clean table of contents
// (page 6) but then found ZERO chapters via header-clustering — this book's running-header
// format apparently doesn't match what the clustering heuristic looks for at all, a different
// failure mode from every other book this session (usually it's a lag or a merge, not a total
// miss). The ToC itself is fully legible and every one of its 12 page hints was verified
// directly against the OCR — each lands exactly on that unit's own "TITLE / Student Learning
// Outcomes (SLOs)" opening page with zero lag, so it's used here as fully authoritative.
//
// Like Physics 10 earlier this session, this book's own internal numbering continues from
// Physics 11 (its units are printed 15-26, not 1-12) — mapped Unit 15->chapterNo 1 .. Unit
// 26->chapterNo 12 for consistency with this project's per-class-level numbering convention:
//   Ch.1  Gravitation:                        7
//   Ch.2  Statistical Mechanics And Thermodynamics: 26
//   Ch.3  Simple Harmonic Motion:              44
//   Ch.4  Diffraction And Interference:        70
//   Ch.5  Electric Potential And Capacitor:    86
//   Ch.6  Alternating Current:                 106
//   Ch.7  Quantum Physics:                     124
//   Ch.8  Nuclear Physics:                     141
//   Ch.9  Cosmology:                           170
//   Ch.10 Earth's Climate:                     183
//   Ch.11 Medical Imaging:                     201
//   Ch.12 Nature Of Science: A Debate:         211
// Chapter 12 runs to the end of the book (230), bundling in the trailing Glossary/Index/
// Bibliography/Author's Profile back matter, consistent with every other book this session.
//
//   npx tsx scripts/crawler-verify/_ingest-physics12-real-pdf.ts

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

const OCR_CHECKSUM = '73f1ba335c8032b809a7efa1c00db2ee1c3f396e20725787a44eb4a4d2352211';
const PDF_CACHE_PATH = 'data/.pdf-cache/8eb6f0acd158acfc1a405ec49225a5bf943697386dc78c37abf91df4ea46742b.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 12, subject: 'physics' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Gravitation', pageFrom: 7 },
  { chapterNo: 2, chapterTitle: 'Statistical Mechanics And Thermodynamics', pageFrom: 26 },
  { chapterNo: 3, chapterTitle: 'Simple Harmonic Motion', pageFrom: 44 },
  { chapterNo: 4, chapterTitle: 'Diffraction And Interference', pageFrom: 70 },
  { chapterNo: 5, chapterTitle: 'Electric Potential And Capacitor', pageFrom: 86 },
  { chapterNo: 6, chapterTitle: 'Alternating Current', pageFrom: 106 },
  { chapterNo: 7, chapterTitle: 'Quantum Physics', pageFrom: 124 },
  { chapterNo: 8, chapterTitle: 'Nuclear Physics', pageFrom: 141 },
  { chapterNo: 9, chapterTitle: 'Cosmology', pageFrom: 170 },
  { chapterNo: 10, chapterTitle: "Earth's Climate", pageFrom: 183 },
  { chapterNo: 11, chapterTitle: 'Medical Imaging', pageFrom: 201 },
  { chapterNo: 12, chapterTitle: 'Nature Of Science: A Debate', pageFrom: 211 },
];
const BOOK_LAST_PAGE = 230;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Physics 12.`);

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

  console.log('\nDone. Physics 12 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
