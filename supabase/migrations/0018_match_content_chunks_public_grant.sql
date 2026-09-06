-- =============================================================================
-- Sabaq AI — 0016: re-close the PUBLIC execute loophole on match_content_chunks
-- =============================================================================
-- 0004 closed this exact loophole (Postgres grants EXECUTE on new functions to
-- PUBLIC by default; revoking from named roles like anon does NOT remove it —
-- you must revoke from PUBLIC itself). 0010 then dropped the old 5-arg
-- match_content_chunks and recreated it with a new 7-arg signature (source-type
-- and chapter-number filters), revoking execute from anon again but NOT from
-- public — the new signature is a distinct object as far as grants are
-- concerned, so it silently inherited a fresh PUBLIC execute grant, regressing
-- 0004's fix. Found by supabase/tests/001_schema_torture.sql (test 4) after
-- updating that test's own hardcoded signature string to match reality.
--
-- Impact before this fix: anyone holding the public anon key could call the
-- vector search RPC directly (abuse/compute risk). Data exposure itself was
-- still blocked — the function is security-invoker, so RLS on the underlying
-- tables returns zero rows to anon — but the intended posture is service-role
-- only, same as every other RPC here.
--
-- Idempotent: revoking a privilege that doesn't exist is a no-op.
-- =============================================================================

revoke all on function public.match_content_chunks(vector, text, integer, text, integer, text, integer) from public;

-- service_role keeps its direct grant from 0010; nothing else should change.
