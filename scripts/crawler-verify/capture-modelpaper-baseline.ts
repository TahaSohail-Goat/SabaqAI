// Phase 1 pre-work — captures pre-change chunk counts for every currently-ingested
// model_paper chapter, so the real re-ingest (which now hashes content with sourceType +
// language folded in — see chunker.ts's hashChunk) can be checked for a chunk-count
// regression afterward, not just "it didn't error."
//
//   npx tsx scripts/crawler-verify/capture-modelpaper-baseline.ts <output-path>

import fs from 'node:fs';
import path from 'node:path';
process.loadEnvFile(path.join(process.cwd(), '.env.local'));

import { requireServiceRoleClient } from '../../src/lib/supabase/admin';

async function main() {
  const outputPath = process.argv[2];
  if (!outputPath) {
    console.error('usage: npx tsx scripts/crawler-verify/capture-modelpaper-baseline.ts <output-path>');
    process.exit(2);
  }

  const admin = requireServiceRoleClient();

  const { data, error } = await admin
    .from('chapters')
    .select('class_level, subject_code, chapter_no, chapter_sources!inner(source_type, sections(content_chunks(id)))')
    .eq('board_code', 'FBISE')
    .eq('chapter_sources.source_type', 'model_paper');

  if (error) throw new Error(error.message);

  const baseline = (data ?? []).map((row) => {
    const chunkCount = (row.chapter_sources ?? []).reduce(
      (n: number, src: { sections?: { content_chunks?: unknown[] }[] }) =>
        n + (src.sections ?? []).reduce((m: number, s) => m + (s.content_chunks?.length ?? 0), 0),
      0
    );
    return { classLevel: row.class_level, subject: row.subject_code, chapterNo: row.chapter_no, chunkCount };
  }).sort((a, b) => a.classLevel - b.classLevel || a.subject.localeCompare(b.subject));

  baseline.forEach((b) => console.log(`${b.subject} ${b.classLevel} (ch.${b.chapterNo}): ${b.chunkCount} chunk(s)`));
  console.log(`\nTotal: ${baseline.length} model_paper document(s), ${baseline.reduce((n, b) => n + b.chunkCount, 0)} chunk(s)`);

  fs.writeFileSync(outputPath, JSON.stringify(baseline, null, 2), 'utf8');
  console.log(`Baseline written to ${outputPath}`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
