-- Additive retrieval only: no OCR, vectors, identifiers or source paths are rewritten.
-- Restored clusters can have pgvector in public; new projects commonly use extensions.
-- Resolve its installed type without moving the extension or changing database settings.
set search_path = public, extensions;
create index if not exists content_chunks_english_fts_idx
  on public.content_chunks using gin (to_tsvector('english'::regconfig, content));

create or replace function public.search_ask_hybrid(
  query_embedding vector(1024), search_terms text[],
  filter_board text, filter_class int, filter_subject text,
  filter_source_type text, filter_chapter_no int default null,
  filter_source_id uuid default null, match_count int default 20
)
returns table(id uuid, score double precision, retrieval_rank bigint)
language plpgsql stable set search_path = public, extensions
as $$
declare lexical_query tsquery;
begin
  if coalesce(filter_board, '') = '' or filter_class is null or coalesce(filter_subject, '') = ''
    or filter_source_type not in ('textbook', 'past_paper', 'model_paper') or filter_source_type is null
    or query_embedding is null or match_count is null or match_count < 1 or match_count > 100 then
    raise exception 'Invalid Ask retrieval scope or limit';
  end if;
  -- plainto_tsquery escapes each term. OR makes words useful hints, never mandatory matches.
  select string_agg(nullif(plainto_tsquery('english', term)::text, ''), ' | ')::tsquery
    into lexical_query from unnest(search_terms[1:48]) term;
  return query
  with permitted as not materialized (
    select c.id, c.embedding, c.content
    from content_chunks c join sections s on s.id = c.section_id
    join chapter_sources cs on cs.id = s.source_id join chapters ch on ch.id = cs.chapter_id
    where ch.board_code = filter_board and ch.class_level = filter_class
      and ch.subject_code = filter_subject and cs.source_type = filter_source_type
      and (filter_chapter_no is null or ch.chapter_no = filter_chapter_no)
      and (filter_source_id is null or cs.id = filter_source_id)
      and c.embedding is not null
  ), vectors as (
    select p.id, row_number() over(order by p.embedding <=> query_embedding, p.id) r
    from permitted p order by p.embedding <=> query_embedding, p.id limit match_count
  ), lexical as (
    select p.id, row_number() over(order by ts_rank_cd(to_tsvector('english', p.content), lexical_query) desc, p.id) r
    from permitted p where to_tsvector('english', p.content) @@ lexical_query
    order by ts_rank_cd(to_tsvector('english', p.content), lexical_query) desc, p.id limit match_count
  ), fused as (
    select coalesce(v.id, l.id) id,
      coalesce(1.0 / (60 + v.r), 0) + coalesce(1.0 / (60 + l.r), 0) relevance,
      coalesce(v.r = 1, false) strongest_vector
    from vectors v full join lexical l on v.id = l.id
  )
  select p.id, (1 - (p.embedding <=> query_embedding))::double precision,
    row_number() over(order by f.strongest_vector desc, f.relevance desc, p.id)
  from fused f join permitted p on p.id = f.id
  order by f.strongest_vector desc, f.relevance desc, p.id;
  -- Return the bounded union before application deduplication. RRF is NEVER a confidence score.
end;
$$;
revoke all on function public.search_ask_hybrid(vector, text[], text, int, text, text, int, uuid, int) from public, anon, authenticated;
grant execute on function public.search_ask_hybrid(vector, text[], text, int, text, text, int, uuid, int) to service_role;
reset search_path;
