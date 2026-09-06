// Phase 1 torture test — compares live model_paper chunk counts against the pre-change
// baseline captured by capture-modelpaper-baseline.ts. Reports every difference explicitly
// (not just pass/fail) — a small, explainable delta (FBISE revised a live PDF; a different
// poppler-utils version on this machine extracts slightly different text from the same
// bytes) is a different finding than a chunk count collapsing to zero or a document
// vanishing, and this script's job is to tell those apart, not just declare "regression" for
// any change at all.
//
//   npx tsx scripts/crawler-verify/compare-modelpaper-regression.ts <baseline-path>

import fs from 'node:fs';
import path from 'node:path';
process.loadEnvFile(path.join(process.cwd(), '.env.local'));

import { requireServiceRoleClient } from '../../src/lib/supabase/admin';

interface BaselineRow { classLevel: number; subject: string; chapterNo: number; chunkCount: number }

async function main() {
  const baselinePath = process.argv[2];
  if (!baselinePath) {
    console.error('usage: npx tsx scripts/crawler-verify/compare-modelpaper-regression.ts <baseline-path>');
    process.exit(2);
  }
  const baseline: BaselineRow[] = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

  const admin = requireServiceRoleClient();
  const { data, error } = await admin
    .from('chapters')
    .select('class_level, subject_code, chapter_no, chapter_sources!inner(source_type, sections(content_chunks(id)))')
    .eq('board_code', 'FBISE')
    .eq('chapter_sources.source_type', 'model_paper');
  if (error) throw new Error(error.message);

  const now = new Map<string, number>();
  for (const row of data ?? []) {
    const chunkCount = (row.chapter_sources ?? []).reduce(
      (n: number, src: { sections?: { content_chunks?: unknown[] }[] }) =>
        n + (src.sections ?? []).reduce((m: number, s) => m + (s.content_chunks?.length ?? 0), 0),
      0
    );
    now.set(`${row.subject_code}|${row.class_level}`, chunkCount);
  }

  console.log('Model-paper regression check — Phase 1 torture test');
  console.log('='.repeat(70));

  let missing = 0, zeroed = 0, wildSwing = 0, minorDelta = 0, exact = 0;
  let baselineTotal = 0, nowTotal = 0;

  for (const b of baseline) {
    const key = `${b.subject}|${b.classLevel}`;
    const current = now.get(key);
    baselineTotal += b.chunkCount;

    if (current === undefined) {
      console.log(`[MISSING] ${key}: was ${b.chunkCount}, now absent entirely`);
      missing++;
      continue;
    }
    nowTotal += current;

    const delta = current - b.chunkCount;
    const pctChange = b.chunkCount > 0 ? Math.abs(delta) / b.chunkCount : 1;

    if (current === 0) {
      console.log(`[ZEROED] ${key}: was ${b.chunkCount}, now 0`);
      zeroed++;
    } else if (delta === 0) {
      exact++;
    } else if (pctChange > 0.5) {
      console.log(`[WILD SWING] ${key}: ${b.chunkCount} -> ${current} (${delta > 0 ? '+' : ''}${delta}, ${(pctChange * 100).toFixed(0)}%)`);
      wildSwing++;
    } else {
      console.log(`[minor delta] ${key}: ${b.chunkCount} -> ${current} (${delta > 0 ? '+' : ''}${delta})`);
      minorDelta++;
    }
  }

  console.log('='.repeat(70));
  console.log(`Exact match: ${exact}/${baseline.length}`);
  console.log(`Minor delta (<=50% change, non-zero): ${minorDelta}/${baseline.length}`);
  console.log(`Wild swing (>50% change): ${wildSwing}/${baseline.length}`);
  console.log(`Zeroed out: ${zeroed}/${baseline.length}`);
  console.log(`Missing entirely: ${missing}/${baseline.length}`);
  console.log(`Total chunks: ${baselineTotal} -> ${nowTotal} (${nowTotal - baselineTotal >= 0 ? '+' : ''}${nowTotal - baselineTotal})`);

  if (missing > 0 || zeroed > 0 || wildSwing > 0) {
    console.error('\nFAIL — at least one document is missing, zeroed, or swung wildly. This needs investigation before Phase 1 can be considered passing.');
    process.exitCode = 1;
  } else {
    console.log('\nPASS — every document is present with a non-zero, non-wild chunk count. Minor deltas are consistent with FBISE revising a live PDF or a poppler-utils version difference across machines, not a chunking regression (chunking logic itself is unchanged from the old crawler).');
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
