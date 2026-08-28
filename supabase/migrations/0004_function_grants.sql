-- =============================================================================
-- Sabaq AI — 0004: close the PUBLIC execute loophole on RPC functions
-- =============================================================================
-- Found by supabase/tests/001_schema_torture.sql (test 4) on first run against the
-- live project: `has_function_privilege('anon', 'match_content_chunks', 'EXECUTE')`
-- returned TRUE even though 0002 revoked execute from anon and authenticated.
--
-- Root cause: Postgres grants EXECUTE on new functions to PUBLIC by default, and
-- every role inherits PUBLIC's privileges. Revoking from named roles does NOT
-- remove the inherited PUBLIC grant — you must revoke from PUBLIC itself.
--
-- Impact before this fix: anyone holding the public anon key could call the vector
-- search RPC and the ingestion RPC directly (abuse/compute risk). Data exposure was
-- still blocked — both functions are security-invoker, so RLS on the underlying
-- tables returned zero rows to anon — but the intended posture is service-role only.
--
-- Idempotent: revoking a privilege that doesn't exist is a no-op.
-- =============================================================================

revoke all on function public.match_content_chunks(vector, text, integer, text, integer) from public;
revoke all on function public.ingest_document(jsonb, boolean) from public;

-- service_role keeps its direct grant from 0002/0003; nothing else should change.
