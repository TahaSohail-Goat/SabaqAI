// One-off backfill: uploads the real PDF for every already-ingested source in
// data/crawl-sources.json to the source-pdfs Storage bucket, and sets the matching
// chapter_sources.storage_path (see supabase/migrations/0011_source_pdf_storage.sql).
//
// Needed because scripts/crawl.ts historically discarded the downloaded PDF after
// extracting text from it — the 33 sources already ingested never had their PDF kept
// anywhere. Going forward, crawl.ts uploads directly; this script only exists to backfill
// what predates that.
//
//   npx tsx scripts/backfill-pdf-storage.ts
//   npx tsx scripts/backfill-pdf-storage.ts --limit 3   (for testing)
//
// Idempotent: re-running overwrites the same storage path (upsert) rather than duplicating.

import fs from 'node:fs';
import path from 'node:path';
import { requireServiceRoleClient } from '../src/lib/supabase/admin';
import {
  ensureSourcePdfBucket,
  sourcePdfPath,
  uploadSourcePdf,
} from '../src/lib/storage/source-pdfs';

// This repo's actual env file is .env.local (not .env, despite scripts/ingest.ts assuming
// .env — that assumption doesn't hold here; verified only .env.local exists).
for (const envFile of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(process.cwd(), envFile));
    break;
  } catch {
    // try the next candidate; fine if env vars are already set some other way
  }
}

interface CrawlSource {
  url: string;
  board: string;
  classLevel: number;
  subject: string;
  sourceType: 'textbook' | 'past_paper' | 'model_paper';
  language: 'en' | 'ur';
  year: number | null;
  checksum: string | null;
  comment?: string;
  note?: string;
}

const SOURCES_FILE = path.join(process.cwd(), 'data', 'crawl-sources.json');

const limitArg = process.argv.find((a) => a.startsWith('--limit'));
const LIMIT = limitArg
  ? parseInt(limitArg.split('=')[1] ?? process.argv[process.argv.indexOf(limitArg) + 1] ?? '99999', 10)
  : Infinity;

async function downloadPdf(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SabaqAI-Crawler/1.0 (educational; contact via github.com/TahaSohail-Goat/SabaqAI)' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
    throw new Error(`Unexpected content-type "${contentType}" for ${url} — the URL may have moved.`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main(): Promise<void> {
  const raw = fs.readFileSync(SOURCES_FILE, 'utf8');
  const allSources = JSON.parse(raw) as CrawlSource[];
  const sources = allSources.filter((s) => Boolean(s.url)).slice(0, LIMIT);

  console.log(`Backfilling PDF storage for ${sources.length} source(s)…\n`);

  const admin = requireServiceRoleClient();
  await ensureSourcePdfBucket(admin);

  let ok = 0;
  let failed = 0;
  let skipped = 0;

  for (const source of sources) {
    const chapterNo = source.year;
    if (chapterNo === null) {
      console.log(`  SKIP (no year, can't match a chapter): ${source.url}`);
      skipped += 1;
      continue;
    }

    const label = `${source.board}/${source.classLevel}/${source.subject}/${source.sourceType}-${chapterNo}`;
    try {
      // Find the chapter_sources row this PDF belongs to — created by ingest already.
      const { data: chapterRow, error: chapterError } = await admin
        .from('chapters')
        .select('id')
        .eq('board_code', source.board)
        .eq('class_level', source.classLevel)
        .eq('subject_code', source.subject)
        .eq('chapter_no', chapterNo)
        .maybeSingle();

      if (chapterError) throw new Error(chapterError.message);
      if (!chapterRow) {
        console.log(`  SKIP (not ingested yet): ${label}`);
        skipped += 1;
        continue;
      }

      const { data: sourceRow, error: sourceError } = await admin
        .from('chapter_sources')
        .select('id')
        .eq('chapter_id', chapterRow.id)
        .eq('source_type', source.sourceType)
        .eq('language_code', source.language)
        .maybeSingle();

      if (sourceError) throw new Error(sourceError.message);
      if (!sourceRow) {
        console.log(`  SKIP (chapter exists, source row doesn't): ${label}`);
        skipped += 1;
        continue;
      }

      console.log(`  Downloading: ${label}`);
      const pdfBytes = await downloadPdf(source.url);

      const storagePath = sourcePdfPath({
        board: source.board,
        classLevel: source.classLevel,
        subject: source.subject,
        sourceType: source.sourceType,
        chapterNo,
        language: source.language,
      });
      await uploadSourcePdf(admin, storagePath, pdfBytes);

      const { error: updateError } = await admin
        .from('chapter_sources')
        .update({ storage_path: storagePath })
        .eq('id', sourceRow.id);
      if (updateError) throw new Error(updateError.message);

      console.log(`  OK: ${label} -> ${storagePath} (${(pdfBytes.length / 1024).toFixed(0)} KB)`);
      ok += 1;
    } catch (err) {
      console.error(`  FAILED: ${label} — ${err instanceof Error ? err.message : err}`);
      failed += 1;
    }
  }

  console.log(`\nDone. ${ok} uploaded, ${skipped} skipped, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error('Backfill failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
