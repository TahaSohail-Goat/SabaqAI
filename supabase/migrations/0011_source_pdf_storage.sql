-- Lets /ask show the real source PDF instead of reconstructed text. Nullable and
-- display-only: retrieval, embeddings, the guardrail, and citation validation all keep
-- using content_chunks exactly as before — this column is never read by anything in the
-- AI pipeline, only by /api/ask/options when building a URL for the browser.
--
-- The actual file bytes live in Supabase Storage (bucket created by
-- scripts/backfill-pdf-storage.ts), not in Postgres — this is a path string, not a blob.

alter table chapter_sources add column if not exists storage_path text;

comment on column chapter_sources.storage_path is
  'Path within the source-pdfs Storage bucket to this source''s original PDF, or null if '
  'not (yet) uploaded. Display-only — never read by retrieval/generation.';
