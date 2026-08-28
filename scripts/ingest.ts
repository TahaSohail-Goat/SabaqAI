// Ingestion: source documents → recursive chunks → embeddings → Supabase.
//
// Writes go through the ingest_document RPC (supabase/migrations/0003_ingest_function.sql),
// which upserts chapter → source → sections → chunks in ONE Postgres transaction per document:
// a document either lands whole or not at all.
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
import {
  chunkDocument,
  type SourceDocument,
  type PreparedDocument,
} from '../src/lib/ingest/chunker';
import { embedTexts } from '../src/lib/ai/embeddings';
import { requireServiceRoleClient } from '../src/lib/supabase/admin';

const SOURCE_DIR = path.join(process.cwd(), 'data/source');

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

const countChunks = (doc: PreparedDocument): number =>
  doc.sections.reduce((n, s) => n + s.chunks.length, 0);

const countChars = (doc: PreparedDocument): number =>
  doc.sections.reduce((n, s) => n + s.chunks.reduce((m, c) => m + c.content.length, 0), 0);

async function main(): Promise<void> {
  console.log('Sabaq AI — ingestion');
  console.log('='.repeat(60));
  if (DRY_RUN) console.log('DRY RUN — no API calls, no writes.\n');

  const documents = loadSourceDocuments();
  console.log(`Found ${documents.length} source document(s) in data/source/\n`);

  // 1. Chunk everything first, so a malformed document fails before we spend any API quota.
  const prepared = documents.map(({ file, doc }) => {
    const chunked = chunkDocument(doc);
    const chunkCount = countChunks(chunked);
    const avg = chunkCount > 0 ? Math.round(countChars(chunked) / chunkCount) : 0;
    console.log(
      `  ${file}\n` +
      `    Chapter ${doc.chapterNo}: ${doc.chapterTitle}\n` +
      `    ${doc.sections.length} section(s) → ${chunkCount} chunk(s), avg ${avg} chars`
    );
    return { file, chunked };
  });

  const total = prepared.reduce((n, p) => n + countChunks(p.chunked), 0);
  console.log(`\nTotal: ${total} chunk(s)`);

  if (total === 0) {
    console.log('Nothing to ingest.');
    return;
  }

  if (DRY_RUN) {
    console.log('\nDry run complete. Re-run without --dry-run to embed and store.');
    return;
  }

  const supabase = requireServiceRoleClient();

  // 2. Find what's already stored, so re-running is cheap and idempotent. The RPC also enforces
  //    this via the content_hash unique constraint; checking first just saves embedding quota.
  const existing = new Set<string>();
  if (!FORCE) {
    const allHashes = prepared.flatMap((p) =>
      p.chunked.sections.flatMap((s) => s.chunks.map((c) => c.contentHash))
    );

    for (let i = 0; i < allHashes.length; i += 200) {
      const { data, error } = await supabase
        .from('content_chunks')
        .select('content_hash')
        .in('content_hash', allHashes.slice(i, i + 200));
      if (error) throw new Error(`Failed to check existing chunks: ${error.message}`);
      for (const row of data ?? []) existing.add(row.content_hash as string);
    }

    console.log(`${existing.size} chunk(s) already stored.`);
  }

  // 3. Per document: embed what's new, then write the whole document in one transaction.
  for (const { file, chunked } of prepared) {
    const sectionsToWrite = chunked.sections
      .map((s) => ({
        ...s,
        chunks: FORCE ? s.chunks : s.chunks.filter((c) => !existing.has(c.contentHash)),
      }))
      .filter((s) => s.chunks.length > 0);

    const toWrite = sectionsToWrite.reduce((n, s) => n + s.chunks.length, 0);
    if (toWrite === 0) {
      console.log(`\n${file}: already ingested, skipping.`);
      continue;
    }

    // Embed. One vector per chunk, computed once, stored — never recomputed per question.
    console.log(`\n${file}: embedding ${toWrite} chunk(s)…`);
    const flat = sectionsToWrite.flatMap((s) => s.chunks);
    const vectors = await embedTexts(flat.map((c) => c.content));
    console.log(`  Embedded at ${vectors[0]?.length ?? 0} dimensions.`);

    let cursor = 0;
    const payload = {
      board: chunked.board,
      classLevel: chunked.classLevel,
      subject: chunked.subject,
      chapterNo: chunked.chapterNo,
      chapterTitle: chunked.chapterTitle,
      sourceType: chunked.sourceType,
      language: chunked.language,
      sections: sectionsToWrite.map((s) => ({
        section: s.section,
        position: s.position,
        pageFrom: s.pageFrom,
        pageTo: s.pageTo,
        chunks: s.chunks.map((c) => ({
          chunkIndex: c.chunkIndex,
          content: c.content,
          contentHash: c.contentHash,
          embedding: vectors[cursor++],
        })),
      })),
    };

    const { data, error } = await supabase.rpc('ingest_document', { payload, p_force: FORCE });
    if (error) {
      throw new Error(
        `Ingest failed for ${file}: ${error.message}\n` +
        `If this mentions the function, run supabase/migrations/0003_ingest_function.sql.\n` +
        `If this mentions dimensions, your embedding model's size does not match vector(N) ` +
        `in 0001_init.sql. See docs/setup.md.`
      );
    }

    const result = data as { chunksWritten?: number } | null;
    console.log(`  Stored ${result?.chunksWritten ?? toWrite}/${toWrite} chunk(s) — chapter ${chunked.chapterNo} committed atomically.`);
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
