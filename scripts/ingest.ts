// Ingestion: source documents → recursive chunks → Qwen embeddings → Supabase content_chunks.
//
// Idempotent. Chunks are keyed by a content hash, and re-running skips anything already stored,
// so you can ingest repeatedly while iterating on chunk size without duplicating rows.
//
//   npm run ingest              ingest everything in data/source/
//   npm run ingest -- --dry-run chunk and report, but call no APIs and write nothing
//   npm run ingest -- --force   re-embed and overwrite chunks that already exist
//
// See docs/rag-architecture.md for the chunking rules and docs/setup.md for the keys.

import fs from 'node:fs';
import path from 'node:path';
import { chunkDocument, type SourceDocument, type PreparedChunk } from '../src/lib/ingest/chunker';
import { embedTexts } from '../src/lib/ai/embeddings';
import { requireServiceRoleClient } from '../src/lib/supabase/admin';

const SOURCE_DIR = path.join(process.cwd(), 'data/source');
const INSERT_BATCH = 50;

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const FORCE = args.has('--force');

function loadSourceDocuments(): { file: string; doc: SourceDocument }[] {
  if (!fs.existsSync(SOURCE_DIR)) {
    throw new Error(`No source directory at ${SOURCE_DIR}. See data/source/README.md.`);
  }

  const files = fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    throw new Error(
      `No .json documents in ${SOURCE_DIR}.\n` +
      `Convert your textbook/past-paper text into the SourceDocument shape first — ` +
      `see data/source/README.md for the format.`
    );
  }

  return files.map((file) => {
    const raw = fs.readFileSync(path.join(SOURCE_DIR, file), 'utf8');
    let doc: SourceDocument;
    try {
      doc = JSON.parse(raw) as SourceDocument;
    } catch (err) {
      throw new Error(`${file} is not valid JSON: ${(err as Error).message}`);
    }
    validateDocument(file, doc);
    return { file, doc };
  });
}

function validateDocument(file: string, doc: SourceDocument): void {
  const missing: string[] = [];
  if (!doc.board) missing.push('board');
  if (typeof doc.classLevel !== 'number') missing.push('classLevel');
  if (!doc.subject) missing.push('subject');
  if (typeof doc.chapterNo !== 'number') missing.push('chapterNo');
  if (!doc.chapterTitle) missing.push('chapterTitle');
  if (!Array.isArray(doc.sections) || doc.sections.length === 0) missing.push('sections');

  if (missing.length > 0) {
    throw new Error(`${file} is missing required field(s): ${missing.join(', ')}`);
  }

  doc.sections.forEach((section, i) => {
    if (!section.section) throw new Error(`${file}: sections[${i}] has no "section" label.`);
    if (!section.content?.trim()) throw new Error(`${file}: sections[${i}] has empty content.`);
  });
}

async function main(): Promise<void> {
  console.log('Sabaq AI — ingestion');
  console.log('='.repeat(60));
  if (DRY_RUN) console.log('DRY RUN — no API calls, no writes.\n');

  const documents = loadSourceDocuments();
  console.log(`Found ${documents.length} source document(s) in data/source/\n`);

  // 1. Chunk everything first, so a malformed document fails before we spend any API quota.
  const allChunks: PreparedChunk[] = [];
  for (const { file, doc } of documents) {
    const chunks = chunkDocument(doc);
    const chars = chunks.reduce((sum, c) => sum + c.content.length, 0);
    const avg = chunks.length > 0 ? Math.round(chars / chunks.length) : 0;
    console.log(
      `  ${file}\n` +
      `    Chapter ${doc.chapterNo}: ${doc.chapterTitle}\n` +
      `    ${doc.sections.length} section(s) → ${chunks.length} chunk(s), avg ${avg} chars`
    );
    allChunks.push(...chunks);
  }

  // Deduplicate across documents too — the same passage extracted twice must not be embedded twice.
  const byHash = new Map<string, PreparedChunk>();
  for (const chunk of allChunks) byHash.set(chunk.content_hash, chunk);
  const unique = [...byHash.values()];

  const dupes = allChunks.length - unique.length;
  console.log(`\nTotal: ${allChunks.length} chunk(s)${dupes > 0 ? `, ${dupes} duplicate(s) removed` : ''}`);

  if (unique.length === 0) {
    console.log('Nothing to ingest.');
    return;
  }

  if (DRY_RUN) {
    console.log('\nDry run complete. Re-run without --dry-run to embed and store.');
    return;
  }

  const supabase = requireServiceRoleClient();

  // 2. Skip what's already stored, so re-running is cheap and idempotent.
  let toProcess = unique;
  if (!FORCE) {
    const hashes = unique.map((c) => c.content_hash);
    const existing = new Set<string>();

    for (let i = 0; i < hashes.length; i += 200) {
      const { data, error } = await supabase
        .from('content_chunks')
        .select('content_hash')
        .in('content_hash', hashes.slice(i, i + 200));
      if (error) throw new Error(`Failed to check existing chunks: ${error.message}`);
      for (const row of data ?? []) existing.add(row.content_hash as string);
    }

    toProcess = unique.filter((c) => !existing.has(c.content_hash));
    console.log(`${existing.size} chunk(s) already stored, ${toProcess.length} new.`);

    if (toProcess.length === 0) {
      console.log('\nEverything is already ingested. Use --force to re-embed.');
      return;
    }
  }

  // 3. Embed. One vector per chunk, computed once, stored — never recomputed per question.
  console.log(`\nEmbedding ${toProcess.length} chunk(s)…`);
  const vectors = await embedTexts(toProcess.map((c) => c.content));
  console.log(`Embedded ${vectors.length} chunk(s) at ${vectors[0]?.length ?? 0} dimensions.`);

  // 4. Store.
  const rows = toProcess.map((chunk, i) => ({ ...chunk, embedding: vectors[i] }));
  let written = 0;

  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const { error } = await supabase
      .from('content_chunks')
      .upsert(batch, { onConflict: 'content_hash', ignoreDuplicates: !FORCE });

    if (error) {
      throw new Error(
        `Insert failed on batch starting at ${i}: ${error.message}\n` +
        `If this mentions dimensions, your embedding model's size does not match ` +
        `vector(N) in the migration. See docs/setup.md.`
      );
    }
    written += batch.length;
    process.stdout.write(`\r  Stored ${written}/${rows.length}`);
  }

  const { count } = await supabase
    .from('content_chunks')
    .select('*', { count: 'exact', head: true });

  console.log(`\n\nDone. content_chunks now holds ${count ?? 'an unknown number of'} row(s).`);
  console.log('Verify in Supabase:  select count(*) from content_chunks;');
}

main().catch((err: unknown) => {
  console.error('\nIngestion failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
