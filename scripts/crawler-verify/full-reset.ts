// Phase 4 — full clean-slate reset for FBISE, ahead of a from-scratch re-crawl of the entire
// manifest. NEVER run by CI (not referenced by any workflow) and NEVER run without the explicit
// confirmation flag below — this deletes real, live content_chunks/sections/chapter_sources
// rows for every FBISE chapter, board-wide, in one shot.
//
// Deliberately does NOT touch `chapters`, `quizzes`, or `qa_log` rows themselves — only each
// chapter's `chapter_sources` (which cascades to `sections` -> `content_chunks` ->
// `qa_log_chunks`) is deleted, exactly matching what resetChapterSource() does for one source
// at a time (see ingest-adapter.ts) — this script just does it for every FBISE source in one
// pass instead of requiring the caller to enumerate every (class, subject, chapterNo,
// sourceType, language) tuple by hand first.
//
// DO NOT RUN THIS TODAY (2026-09-04): Phase 1's 5 textbooks (Physics 9/Chemistry 9/Biology 9/
// Math 10, plus Math 9's real PDF backfill) are still blocked on an external Google Drive
// download quota. Running this reset right now would delete the currently-live, verified,
// submission-ready content for those books (Math 9's text-fallback fix included) with no way
// to immediately re-ingest them, since the blocked source PDFs can't be re-downloaded yet. Only
// run this once every manifest entry — textbooks included — can actually be re-ingested
// end-to-end afterward; otherwise you are trading working content for a permanent gap.
//
//   npx tsx scripts/crawler-verify/full-reset.ts --yes-really-reset-fbise

import path from 'node:path';
process.loadEnvFile(path.join(process.cwd(), '.env.local'));

import { requireServiceRoleClient } from '../../src/lib/supabase/admin';

const CONFIRM_FLAG = '--yes-really-reset-fbise';

async function main() {
  const admin = requireServiceRoleClient();

  // chapter_sources has no board_code of its own — reach it via its parent chapter.
  const { data: chapters, error: chaptersError } = await admin
    .from('chapters')
    .select('id, class_level, subject_code, chapter_no, chapter_sources(id, source_type, language_code)')
    .eq('board_code', 'FBISE');
  if (chaptersError) throw new Error(`Chapter lookup failed: ${chaptersError.message}`);

  const sourceIds = (chapters ?? []).flatMap((c) => (c.chapter_sources ?? []).map((s) => s.id));
  const chapterCount = chapters?.length ?? 0;

  console.log(`Found ${chapterCount} FBISE chapter(s) with ${sourceIds.length} chapter_sources row(s) total.`);
  console.log('This will delete every one of those rows (cascading to sections, content_chunks,');
  console.log('and qa_log_chunks). The chapters/quizzes/qa_log rows themselves are NOT touched.');

  if (!process.argv.includes(CONFIRM_FLAG)) {
    console.log(`\nDry run only — nothing deleted. Re-run with ${CONFIRM_FLAG} to actually reset.`);
    return;
  }

  if (sourceIds.length === 0) {
    console.log('\nNothing to delete.');
    return;
  }

  console.log(`\n${CONFIRM_FLAG} passed — deleting ${sourceIds.length} chapter_sources row(s) now...`);
  const { error: deleteError, count } = await admin
    .from('chapter_sources')
    .delete({ count: 'exact' })
    .in('id', sourceIds);
  if (deleteError) throw new Error(`Delete failed: ${deleteError.message}`);

  console.log(`Deleted ${count ?? sourceIds.length} chapter_sources row(s). Reset complete.`);
  console.log('Next: run scripts/crawl.ts --force over the full manifest to re-ingest everything.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exitCode = 1;
});
