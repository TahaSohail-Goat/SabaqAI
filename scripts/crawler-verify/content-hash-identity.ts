// Phase 1 torture test — content_hash collision fix (see src/lib/ingest/chunker.ts's
// hashChunk, and its own comment for the full "why").
//
// The plan named this supabase/tests/002_content_hash_identity.sql, but content_hash is
// actually COMPUTED in TypeScript (chunker.ts's hashChunk), not by the ingest_document RPC —
// the RPC only stores whatever hash it's handed. Faking two hash values inside raw SQL would
// test the schema's own uniqueness constraint (already proven by 001_schema_torture.sql's
// existing idempotency tests) without actually exercising the code that changed. This script
// instead calls the REAL production path (ingest-adapter.ts's ingestDocument, which calls
// chunkDocument -> hashChunk internally) against live Supabase — the more direct and more
// honest test of the actual fix. Self-cleaning: resets its synthetic chapter's sources both
// before and after running, so it's safe to re-run and leaves nothing behind.
//
//   npx tsx scripts/crawler-verify/content-hash-identity.ts

import path from 'node:path';
process.loadEnvFile(path.join(process.cwd(), '.env.local'));

import { requireServiceRoleClient } from '../../src/lib/supabase/admin';
import { ingestDocument, resetChapterSource } from '../../src/lib/crawler/ingest-adapter';
import type { SourceDocument } from '../../src/lib/ingest/chunker';

// Real board/class/subject (must satisfy real FK references — chapters.subject_code etc.),
// synthetic chapter number reserved for tests (matches 001_schema_torture.sql's own
// chapter_no 999 convention, so it can never collide with a real ingested chapter).
const FIXTURE = { board: 'FBISE', classLevel: 9, subject: 'physics', chapterNo: 999 };
const SHARED_CONTENT = 'This is a deliberately identical boilerplate sentence shared by two different source types, used only to prove they hash to different rows. '.repeat(3);

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function makeDoc(sourceType: SourceDocument['sourceType']): SourceDocument {
  return {
    ...FIXTURE,
    chapterTitle: 'Content-hash identity test fixture',
    sourceType,
    language: 'en',
    sections: [{ section: 'Test Section', content: SHARED_CONTENT }],
  };
}

async function main() {
  console.log('Content-hash identity — Phase 1 torture test');
  console.log('='.repeat(60));

  const admin = requireServiceRoleClient();

  // Clean slate — in case a previous run of this script was interrupted before its own cleanup.
  await resetChapterSource(admin, { ...FIXTURE, sourceType: 'textbook', language: 'en' });
  await resetChapterSource(admin, { ...FIXTURE, sourceType: 'past_paper', language: 'en' });

  try {
    // 1. Same content, DIFFERENT sourceType, same chapter — must both persist (this is the
    //    actual fix: content_hash now includes sourceType, so these no longer collide).
    const textbookResult = await ingestDocument(admin, makeDoc('textbook'));
    check('textbook source ingests the shared content', textbookResult.chunksWritten === 1, `chunksWritten=${textbookResult.chunksWritten}`);

    const pastPaperResult = await ingestDocument(admin, makeDoc('past_paper'));
    check(
      'past_paper source with IDENTICAL content also ingests (no collision)',
      pastPaperResult.chunksWritten === 1,
      `chunksWritten=${pastPaperResult.chunksWritten} (0 would mean the old bug is back — the second source's chunk silently collided with the first's hash)`
    );

    // 2. Control — re-ingesting the SAME sourceType+language+content must still dedupe to 0
    //    new rows. Proves the fix didn't accidentally make every re-run non-idempotent.
    const textbookRepeat = await ingestDocument(admin, makeDoc('textbook'));
    check('re-ingesting the identical textbook document is idempotent', textbookRepeat.chunksWritten === 0, `chunksWritten=${textbookRepeat.chunksWritten}`);

    // 3. Direct DB proof: two distinct content_hash rows exist under the synthetic chapter,
    //    one per source type, not one shared/collided row.
    const { data: chapterRow } = await admin.from('chapters').select('id')
      .eq('board_code', FIXTURE.board).eq('class_level', FIXTURE.classLevel)
      .eq('subject_code', FIXTURE.subject).eq('chapter_no', FIXTURE.chapterNo).maybeSingle();
    if (!chapterRow) {
      check('fixture chapter exists after ingest', false, 'chapter row not found');
    } else {
      const { data: sources } = await admin.from('chapter_sources').select('id, source_type')
        .eq('chapter_id', chapterRow.id);
      const sourceIds = (sources ?? []).map((s) => s.id);
      const { data: chunks } = await admin.from('content_chunks')
        .select('content_hash, section_id, sections!inner(source_id)')
        .in('sections.source_id', sourceIds);
      const distinctHashes = new Set((chunks ?? []).map((c) => c.content_hash));
      check(
        '2 distinct content_hash values stored (one per source type, not a collision)',
        distinctHashes.size === 2,
        `found ${distinctHashes.size} distinct hash(es) across ${chunks?.length ?? 0} chunk row(s)`
      );
    }
  } finally {
    // Always clean up, pass or fail — this fixture must never linger in real data.
    // resetChapterSource deliberately never deletes the `chapters` row itself (see its own
    // comment — a real reset must never touch chapters/quizzes/qa_log), so this test's own
    // reserved synthetic chapter row needs its own explicit delete once no chapter_sources
    // reference it any more, or it leaks a permanent "Content-hash identity test fixture"
    // row into the real chapters table on every run.
    await resetChapterSource(admin, { ...FIXTURE, sourceType: 'textbook', language: 'en' });
    await resetChapterSource(admin, { ...FIXTURE, sourceType: 'past_paper', language: 'en' });
    await admin.from('chapters').delete()
      .eq('board_code', FIXTURE.board).eq('class_level', FIXTURE.classLevel)
      .eq('subject_code', FIXTURE.subject).eq('chapter_no', FIXTURE.chapterNo);
    console.log('\n(cleaned up synthetic fixture chapter 999, including its chapters row)');
  }

  console.log('='.repeat(60));
  if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log('All checks passed.');
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exitCode = 1;
});
