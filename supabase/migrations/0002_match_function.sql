-- Vector similarity search for retrieval.
-- Run this in the Supabase SQL Editor AFTER 0001_init.sql.
--
-- PostgREST cannot express pgvector's distance operators directly, so retrieval goes through this
-- function. It is the ONLY way the app queries content_chunks for search.
--
-- IMPORTANT: if you changed vector(1024) in 0001_init.sql to match a different embedding model,
-- change the query_embedding parameter below to the same size. A mismatch fails at call time with
-- an error that never mentions your embedding model.

create or replace function match_content_chunks(
  query_embedding  vector(1024),
  filter_board     text,
  filter_class     int,
  filter_subject   text,
  match_count      int default 20
)
returns table (
  id           uuid,
  chapter_no   int,
  chapter_title text,
  section      text,
  page_from    int,
  page_to      int,
  source_type  text,
  content      text,
  score        double precision
)
language sql
stable
as $$
  select
    c.id,
    c.chapter_no,
    c.chapter_title,
    c.section,
    c.page_from,
    c.page_to,
    c.source_type,
    c.content,
    -- <=> is cosine DISTANCE in pgvector. Score = 1 - distance, so higher is better and the
    -- thresholds in docs/confidence-guardrails.md read the way you'd expect.
    (1 - (c.embedding <=> query_embedding))::double precision as score
  from content_chunks c
  where lower(c.board)   = lower(filter_board)
    and c.class_level    = filter_class
    and lower(c.subject) = lower(filter_subject)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

comment on function match_content_chunks is
  'Cosine similarity search over content_chunks, always filtered by board/class/subject. '
  'An unfiltered search is a bug: it pulls the wrong curriculum and breaks grounding.';

-- Called with the service_role key from the server (see src/lib/supabase/admin.ts), which bypasses
-- RLS. This is deliberate: the chunks_match_profile policy requires a student_profiles row, and
-- with the anon key every query would return zero rows, making the app refuse every question with
-- no visible error. Textbook content is not sensitive; the board/class/subject filter above is what
-- enforces correctness. RLS stays enforced on qa_log, quizzes and quiz_attempts.
--
-- Deliberately NOT granted to anon: search runs server-side only.
revoke all on function match_content_chunks from anon;
grant execute on function match_content_chunks to service_role;
