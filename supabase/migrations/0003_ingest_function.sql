-- Atomic ingestion write path.
-- Run this in the Supabase SQL Editor AFTER 0001_init.sql.
--
-- scripts/ingest.ts chunks and embeds locally, then hands ONE document to this function.
-- A plpgsql function body is a single transaction: the chapter, its source row, its sections
-- and all its chunks either all land or none do. A half-ingested chapter is impossible.
--
-- Payload shape (built by scripts/ingest.ts):
-- {
--   "board": "PCTB", "classLevel": 10, "subject": "physics",
--   "chapterNo": 14, "chapterTitle": "Current Electricity",
--   "sourceType": "textbook", "language": "en",
--   "sections": [
--     { "section": "14.1 Electric Current", "position": 1, "pageFrom": 91, "pageTo": 92,
--       "chunks": [
--         { "chunkIndex": 1, "content": "...", "contentHash": "<sha256>",
--           "embedding": [0.01, ...] }
--       ] }
--   ]
-- }

create or replace function ingest_document(payload jsonb, p_force boolean default false)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_chapter_id uuid;
  v_source_id  uuid;
  v_section_id uuid;
  v_section    jsonb;
  v_chunk      jsonb;
  v_received   int := 0;
  v_written    int := 0;
begin
  -- Chapter: keyed by its natural identity. A re-ingested chapter updates its title.
  insert into chapters (board_code, class_level, subject_code, chapter_no, chapter_title)
  values (
    payload->>'board',
    (payload->>'classLevel')::smallint,
    payload->>'subject',
    (payload->>'chapterNo')::int,
    payload->>'chapterTitle'
  )
  on conflict (board_code, class_level, subject_code, chapter_no)
  do update set chapter_title = excluded.chapter_title
  returning id into v_chapter_id;

  -- Source document for the chapter (textbook / past_paper / marking_scheme, per language).
  insert into chapter_sources (chapter_id, source_type, language_code)
  values (v_chapter_id, payload->>'sourceType', payload->>'language')
  on conflict (chapter_id, source_type, language_code) do nothing
  returning id into v_source_id;

  if v_source_id is null then
    select id into v_source_id
    from chapter_sources
    where chapter_id = v_chapter_id
      and source_type = payload->>'sourceType'
      and language_code = payload->>'language';
  end if;

  for v_section in select value from jsonb_array_elements(payload->'sections') loop
    insert into sections (source_id, section_label, position, page_from, page_to)
    values (
      v_source_id,
      v_section->>'section',
      (v_section->>'position')::smallint,
      nullif(v_section->>'pageFrom', '')::int,
      nullif(v_section->>'pageTo', '')::int
    )
    on conflict (source_id, section_label)
    do update set position  = excluded.position,
                  page_from = excluded.page_from,
                  page_to   = excluded.page_to
    returning id into v_section_id;

    for v_chunk in select value from jsonb_array_elements(v_section->'chunks') loop
      v_received := v_received + 1;

      if p_force then
        -- --force: overwrite chunks we already hold (re-embedded content wins).
        insert into content_chunks (section_id, chunk_index, content, content_hash, embedding)
        values (
          v_section_id,
          (v_chunk->>'chunkIndex')::smallint,
          v_chunk->>'content',
          v_chunk->>'contentHash',
          (v_chunk->>'embedding')::vector
        )
        on conflict (content_hash) do update
          set section_id = excluded.section_id,
              chunk_index = excluded.chunk_index,
              content    = excluded.content,
              embedding  = excluded.embedding;
        v_written := v_written + 1;
      else
        -- Normal run: the content hash makes re-ingestion idempotent. Existing rows win.
        insert into content_chunks (section_id, chunk_index, content, content_hash, embedding)
        values (
          v_section_id,
          (v_chunk->>'chunkIndex')::smallint,
          v_chunk->>'content',
          v_chunk->>'contentHash',
          (v_chunk->>'embedding')::vector
        )
        on conflict (content_hash) do nothing;
        if found then
          v_written := v_written + 1;
        end if;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'chapterId', v_chapter_id,
    'chunksReceived', v_received,
    'chunksWritten', v_written
  );
end;
$$;

comment on function ingest_document is
  'Writes one source document (chapter + source + sections + chunks) in a single transaction. '
  'Called only by scripts/ingest.ts with the service role.';

-- Ingestion is a server-side batch job, never a browser call.
revoke all on function ingest_document(jsonb, boolean) from anon;
grant execute on function ingest_document(jsonb, boolean) to service_role;
