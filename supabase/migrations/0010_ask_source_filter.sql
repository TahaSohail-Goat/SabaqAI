-- Lets /api/ask narrow retrieval to one specific source (a book chapter, or one named
-- past/model paper/marking scheme) instead of searching every ingested source for the
-- subject at once. Adds two nullable, defaulted parameters at the end of
-- match_content_chunks — existing callers (e.g. any that only pass the original five) are
-- unaffected; both new filters are no-ops (null) unless the caller supplies them.
--
-- Board + class + subject remain mandatory, exactly as before (see AGENTS.md invariant 6) —
-- this only ever narrows further, never replaces that filter.
--
-- IMPORTANT: adding trailing defaulted params to an existing function via CREATE OR REPLACE
-- does NOT replace it in place — Postgres treats the new (longer) argument list as a
-- distinct overload, leaving the old 5-arg version behind alongside it. The old one must be
-- dropped explicitly, or bare-name GRANT/REVOKE (and any ambiguous call) breaks with
-- "function name is not unique". Also: DROP FUNCTION wants the bare element type here — a
-- typmod'd `vector(1024)` fails to resolve in this position (unlike in CREATE FUNCTION,
-- where it's fine); confirmed live against this database.
drop function if exists match_content_chunks(vector, text, int, text, int);

create or replace function match_content_chunks(
  query_embedding     vector(1024),
  filter_board        text,
  filter_class        int,
  filter_subject      text,
  match_count         int default 20,
  filter_source_type  text default null,
  filter_chapter_no   int default null
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
    ch.chapter_no,
    ch.chapter_title,
    s.section_label,
    s.page_from,
    s.page_to,
    cs.source_type,
    c.content,
    (1 - (c.embedding <=> query_embedding))::double precision as score
  from content_chunks c
  join sections s         on s.id = c.section_id
  join chapter_sources cs on cs.id = s.source_id
  join chapters ch        on ch.id = cs.chapter_id
  where lower(ch.board_code)   = lower(filter_board)
    and ch.class_level         = filter_class
    and lower(ch.subject_code) = lower(filter_subject)
    and (filter_source_type is null or cs.source_type = filter_source_type)
    and (filter_chapter_no is null or ch.chapter_no = filter_chapter_no)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

comment on function match_content_chunks is
  'Cosine similarity search over content_chunks, always filtered by board/class/subject, '
  'optionally narrowed further to one source_type and/or chapter_no. An unfiltered '
  'board/class/subject search is a bug: it pulls the wrong curriculum and breaks grounding.';

revoke all on function match_content_chunks from anon;
grant execute on function match_content_chunks to service_role;
