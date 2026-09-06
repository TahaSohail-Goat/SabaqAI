// Islamiyat 11 — first real ingest, correct boundaries from the start.
//
// New HSSC-I arts-subject textbook (151 pages), organized into "Baab" (Part) groupings that
// repeat as a running header on every page within them (Part 1: Quran and Hadith, Part 2:
// Beliefs and Practices, Part 3: Seerah, Part 4: Ethics, Part 5: Social Matters and Society,
// Part 6: Guidance and Notable Muslims, Part 7: Islamic Teachings and the Modern Age). The
// automatic dry-run found no chapter headings at all — same root cause as every Urdu-script
// book this batch: the header-clustering algorithm looks for an ALL-CAPS running header, a
// concept that doesn't exist in Urdu script.
//
// Chapters here are the 7 Baab groupings, each confirmed as a real transition by its own running
// header changing (e.g. "باب دوم" -> "باب سوم") — except Part 6, which itself contains two
// distinct lessons (confirmed by a second, independent SLO-style intro phrase appearing partway
// through it), so it is split into two chapters below.
//   Ch.1  Part 1 (Quran and Hadith):                        6
//   Ch.2  Part 2 (Beliefs and Practices):                    24
//   Ch.3  Part 3 (Seerah):                                   64
//   Ch.4  Part 4 (Ethics):                                   83
//   Ch.5  Part 5 (Social Matters and Society):               100
//   Ch.6  Part 6a (Guidance and Notable Muslims):            114
//   Ch.7  Part 6b (Guidance and Notable Muslims, continued):  129
//   Ch.8  Part 7 (Islamic Teachings and the Modern Age):     133
// Pages 1-5 are cover/preface/ToC; pages 150-151 are "About the Authors" back matter — both
// excluded. All 8 chapters partition pages 6-149 with zero gaps or overlaps (verified: sum of
// per-chapter page counts + front matter + back matter = 151, the exact total). As with the
// Urdu-language textbooks this batch, printed titles could not be reliably OCR'd at this scan
// quality, so chapters are labelled by their Baab grouping rather than guessing unverifiable
// individual lesson titles.
//
//   npx tsx scripts/crawler-verify/_ingest-islamiyat11-real-pdf.ts

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

const OCR_CHECKSUM = 'de1160b6bf3d2e04724b6f5fcba8d341fb8d2d2c7c9e806c9111ba75884dd28c';
const PDF_CACHE_PATH = 'data/.pdf-cache/e1773607f012d5ee19c800abfc01409377543ade0f0d30259177613e5ee6339e.pdf';
const FIXTURE = { board: 'FBISE', classLevel: 11, subject: 'islamiyat' };
const EMBED_RETRY = { maxAttempts: 4, baseDelayMs: 2000 };

const CHAPTERS: { chapterNo: number; chapterTitle: string; pageFrom: number }[] = [
  { chapterNo: 1, chapterTitle: 'Part 1: Quran And Hadith', pageFrom: 6 },
  { chapterNo: 2, chapterTitle: 'Part 2: Beliefs And Practices', pageFrom: 24 },
  { chapterNo: 3, chapterTitle: 'Part 3: Seerah', pageFrom: 64 },
  { chapterNo: 4, chapterTitle: 'Part 4: Ethics', pageFrom: 83 },
  { chapterNo: 5, chapterTitle: 'Part 5: Social Matters And Society', pageFrom: 100 },
  { chapterNo: 6, chapterTitle: 'Part 6: Guidance And Notable Muslims (I)', pageFrom: 114 },
  { chapterNo: 7, chapterTitle: 'Part 6: Guidance And Notable Muslims (II)', pageFrom: 129 },
  { chapterNo: 8, chapterTitle: 'Part 7: Islamic Teachings And The Modern Age', pageFrom: 133 },
];
const BOOK_LAST_PAGE = 149;

async function main() {
  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  const pages: OcrPage[] = JSON.parse(fs.readFileSync(path.join('data', '.ocr-cache', `${OCR_CHECKSUM}.json`), 'utf8'));
  const pdfBuf = fs.readFileSync(PDF_CACHE_PATH);
  console.log(`Loaded ${pages.length} cached OCR page(s) and ${(pdfBuf.length / 1024 / 1024).toFixed(1)}MB PDF for Islamiyat 11.`);

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

  console.log('\nDone. Islamiyat 11 ingested with real per-chapter PDFs and corrected boundaries.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
