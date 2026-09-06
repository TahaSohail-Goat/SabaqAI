// Pakistan Studies 10 — first real ingest, correct boundaries from the start.
//
// New SSC-II arts-subject textbook (130 pages). The automatic dry-run detected 6 chapters with
// no ToC available, and got the count right, but every boundary lagged exactly 1 page behind
// the real start (each chapter's own "Section N ... In this unit the students will be able
// to..." title/SLO page) — confirmed directly against all 6 transitions. Titles also carried
// running-header/logo OCR noise (e.g. "Society And Culture ® National Is Ee =_") that's cleaned
// up here to their real printed titles.
//
// The book groups its 6 chapters into 3 broad sections (2 chapters each) — Section 1 "Cultural
// Diversity in Pakistan", Section 2 "Constitution of Pakistan", Section 3 "Pakistan and
// International Affairs" — not represented as separate chapters, consistent with this project's
// convention of chapter-per-actual-unit.
//   Ch.1 Society And Culture Of Pakistan:            6
//   Ch.2 Recreation - Sports:                         22
//   Ch.3 Constitutional Development:                  37
//   Ch.4 Citizenship And Sustainable Society:          58
//   Ch.5 Foreign Policy:                               82
//   Ch.6 Pakistan And International Organizations:    105
// Page 130 (book end) is real chapter-6 content (a project exercise), not back matter.
//
//   npx tsx scripts/crawler-verify/_ingest-pakistanstudies10-real-pdf.ts

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

const OCR_CHECKSUM = '59cb737d5af1e95c8bc5f601abc5c855a3d966fa35ba514f2de45eed08cbccf9';
const PDF_CACHE_PATH = 'data/.pdf-cache/be296fc5899091aacc8b0afd8223e815405648a31b564b96a3057ef6b45ffbe6.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 10, subject: 'pakistan_studies' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Society And Culture Of Pakistan', pageFrom: 6 },
  { chapterNo: 2, chapterTitle: 'Recreation - Sports', pageFrom: 22 },
  { chapterNo: 3, chapterTitle: 'Constitutional Development', pageFrom: 37 },
  { chapterNo: 4, chapterTitle: 'Citizenship And Sustainable Society', pageFrom: 58 },
  { chapterNo: 5, chapterTitle: 'Foreign Policy', pageFrom: 82 },
  { chapterNo: 6, chapterTitle: 'Pakistan And International Organizations', pageFrom: 105 },
];
const BOOK_LAST_PAGE = 130;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Pakistan Studies 10.`);

  const detected: DetectedChapter[] = CHAPTERS.map((c, i) => ({
    chapterNo: c.chapterNo,
    chapterTitle: c.chapterTitle,
    pageFrom: c.pageFrom,
    pageTo: i + 1 < CHAPTERS.length ? CHAPTERS[i + 1].pageFrom - 1 : BOOK_LAST_PAGE,
  }));

  const chapterSections = buildChapterSections(pages, detected, new Set());

  console.log('\nResetting chapter_sources rows (chapters 1-6) before ingesting...');
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

  console.log('\nDone. Pakistan Studies 10 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
