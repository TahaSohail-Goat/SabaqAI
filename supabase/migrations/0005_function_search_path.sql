-- =============================================================================
-- Sabaq AI — 0005: pin search_path on both RPC functions
-- =============================================================================
-- Found by supabase/tests/001_schema_torture.sql (test 6) on first live run:
--   ERROR 42704: type "vector" does not exist
--   CONTEXT: PL/pgSQL function ingest_document(jsonb,boolean)
--
-- Root cause: the pgvector extension is installed in the `extensions` schema
-- (Supabase dashboard default — confirmed via pg_extension), NOT `public`.
--
--   * ingest_document was created with `set search_path = public` (0003), which
--     strips `extensions`, so its internal `(v_chunk->>'embedding')::vector` casts
--     cannot resolve the vector type — the function fails in EVERY session.
--   * match_content_chunks (0002) sets no search_path at all, so it borrows the
--     CALLER's. The postgres role has `extensions` in its path (SQL Editor and
--     psql work), but the app calls this RPC as service_role via PostgREST, whose
--     search_path is just `public` — the <=> cosine operator would fail to resolve
--     at runtime. A production outage disguised as a test failure.
--
-- Fix: pin `search_path = public, extensions` on both functions. pg_catalog is
-- always searched implicitly first; both functions are security INVOKER with
-- controlled callers, so a fixed two-schema path carries no hijack risk.
-- Idempotent: ALTER FUNCTION ... SET just overwrites the attribute.
-- =============================================================================

alter function public.ingest_document(jsonb, boolean)
  set search_path = public, extensions;

alter function public.match_content_chunks(vector, text, integer, text, integer)
  set search_path = public, extensions;
