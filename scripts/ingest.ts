// Day 2. Read text from data/source/, chunk it, embed each chunk, insert into content_chunks.
// Idempotent: skip chunks whose content_hash already exists.
// Uses the SERVICE ROLE key (bypasses RLS) — run locally only, never ship this key.
//
// Steps to implement:
//   1. Read each .txt file in data/source/.
//   2. Split on chapter/heading, then paragraphs, into ~400-700 word chunks (small overlap,
//      never crossing a chapter boundary).
//   3. For each chunk: compute a content hash; skip if it already exists.
//   4. Embed the chunk text with EMBEDDING_MODEL.
//   5. Insert into content_chunks with board/class/subject/chapter metadata.
//   6. Print how many chunks were inserted vs skipped.

console.log('ingest: not implemented yet — build on Day 2 (see docs/build-plan.md)');
