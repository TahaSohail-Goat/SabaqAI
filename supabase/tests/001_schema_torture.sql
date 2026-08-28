-- =============================================================================
-- Sabaq AI — schema v2 torture tests
-- =============================================================================
-- Proves the claims in docs/schema-proposal.md against the LIVE database:
--   structure (24 tables, RLS everywhere), CHECK/FK/UNIQUE enforcement,
--   ingest_document atomicity + idempotency + force mode, vector search correctness,
--   the expanded view, and RLS visibility for the anon role.
--
-- Everything runs inside ONE transaction that is ROLLED BACK at the end. No matter
-- what these tests insert, your database is left byte-identical.
--
-- How to run:
--   Supabase SQL Editor : paste this whole file, Run, read the final result grid.
--   psql                : psql "<session-pooler-uri>" -f supabase/tests/001_schema_torture.sql
--
-- Expected: a results grid of 22 rows, all ok = true, then ROLLBACK.
-- A failure raises a "TEST FAILED: ..." exception naming the exact broken guarantee.
-- =============================================================================

begin;

create temporary table test_results (test int, name text, ok boolean) on commit drop;

-- =============================================================================
-- A. STRUCTURE — the schema that was promised is the schema that exists
-- =============================================================================

do $$
declare
  v_tables int;
  v_fks    int;
  v_checks int;
begin
  select count(*) into v_tables
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE';
  if v_tables <> 24 then
    raise exception 'TEST FAILED: expected 24 tables, found %', v_tables;
  end if;

  select count(*) into v_fks
  from pg_constraint c
  join pg_class r on r.oid = c.conrelid
  join pg_namespace n on n.oid = r.relnamespace
  where n.nspname = 'public' and c.contype = 'f';
  if v_fks < 30 then
    raise exception 'TEST FAILED: expected >= 30 foreign keys, found %', v_fks;
  end if;

  select count(*) into v_checks
  from pg_constraint c
  join pg_class r on r.oid = c.conrelid
  join pg_namespace n on n.oid = r.relnamespace
  where n.nspname = 'public' and c.contype = 'c';
  if v_checks < 15 then
    raise exception 'TEST FAILED: expected >= 15 CHECK constraints, found %', v_checks;
  end if;

  insert into test_results values (1, 'structure: 24 tables, FKs, CHECKs', true);
end $$;

-- RLS must be ENABLED on every public table — a table without it is a data leak.
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ) then
    raise exception 'TEST FAILED: at least one public table has RLS disabled';
  end if;
  insert into test_results values (2, 'RLS enabled on all 24 tables', true);
end $$;

-- quiz_answer_keys must have ZERO policies: with RLS on and no policy, the answer key
-- is deny-by-default. This is what makes "answers never reach the browser" structural.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'quiz_answer_keys'
  ) then
    raise exception 'TEST FAILED: quiz_answer_keys has an RLS policy — answer key is reachable';
  end if;
  insert into test_results values (3, 'quiz_answer_keys deny-by-default (no policies)', true);
end $$;

-- Functions must be service-role only.
do $$
begin
  if has_function_privilege('anon', 'public.match_content_chunks(vector,text,integer,text,integer)', 'EXECUTE') then
    raise exception 'TEST FAILED: anon can execute match_content_chunks';
  end if;
  if has_function_privilege('anon', 'public.ingest_document(jsonb,boolean)', 'EXECUTE') then
    raise exception 'TEST FAILED: anon can execute ingest_document';
  end if;
  if not has_function_privilege('service_role', 'public.match_content_chunks(vector,text,integer,text,integer)', 'EXECUTE') then
    raise exception 'TEST FAILED: service_role cannot execute match_content_chunks';
  end if;
  if not has_function_privilege('service_role', 'public.ingest_document(jsonb,boolean)', 'EXECUTE') then
    raise exception 'TEST FAILED: service_role cannot execute ingest_document';
  end if;
  insert into test_results values (4, 'RPCs are service-role only', true);
end $$;

-- Reference data was seeded by the migration.
do $$
begin
  if (select count(*) from boards) < 2
     or (select count(*) from class_levels) <> 12
     or (select count(*) from subjects) < 6
     or (select count(*) from languages) < 3 then
    raise exception 'TEST FAILED: reference tables not seeded as expected';
  end if;
  insert into test_results values (5, 'reference data seeded (boards, classes, subjects, languages)', true);
end $$;

-- =============================================================================
-- B. HAPPY-PATH INGEST — one document through ingest_document, verified row by row
-- (also builds the fixtures the negative tests below need)
-- =============================================================================

do $$
declare
  v_payload jsonb;
  v_result  jsonb;
  emb1 jsonb := (select jsonb_agg(case when g = 1 then 1 else 0 end order by g) from generate_series(1, 1024) g);
  emb2 jsonb := (select jsonb_agg(case when g = 2 then 1 else 0 end order by g) from generate_series(1, 1024) g);
  v_chapter uuid;
  v_section uuid;
begin
  v_payload := jsonb_build_object(
    'board', 'PCTB', 'classLevel', 10, 'subject', 'physics',
    'chapterNo', 999, 'chapterTitle', 'Torture Test Chapter',
    'sourceType', 'textbook', 'language', 'en',
    'sections', jsonb_build_array(
      jsonb_build_object(
        'section', 'T.1 Alpha', 'position', 1, 'pageFrom', 1, 'pageTo', 2,
        'chunks', jsonb_build_array(
          jsonb_build_object('chunkIndex', 1, 'content', 'alpha torture content about electric current',
                             'contentHash', 'torture-hash-alpha', 'embedding', emb1),
          jsonb_build_object('chunkIndex', 2, 'content', 'beta torture content about voltage',
                             'contentHash', 'torture-hash-beta', 'embedding', emb2)
        )
      )
    )
  );

  select ingest_document(v_payload, false) into v_result;

  if (v_result->>'chunksReceived')::int <> 2 or (v_result->>'chunksWritten')::int <> 2 then
    raise exception 'TEST FAILED: ingest_document reported %', v_result;
  end if;

  select id into v_chapter from chapters
  where board_code = 'PCTB' and class_level = 10 and subject_code = 'physics' and chapter_no = 999;
  if v_chapter is null then
    raise exception 'TEST FAILED: chapter row missing after ingest';
  end if;

  if (select count(*) from chapter_sources where chapter_id = v_chapter) <> 1 then
    raise exception 'TEST FAILED: expected exactly 1 chapter_sources row';
  end if;

  select s.id into v_section
  from sections s
  join chapter_sources cs on cs.id = s.source_id
  where cs.chapter_id = v_chapter and s.section_label = 'T.1 Alpha';
  if v_section is null then
    raise exception 'TEST FAILED: section row missing after ingest';
  end if;

  if (select count(*) from content_chunks where section_id = v_section) <> 2 then
    raise exception 'TEST FAILED: expected 2 chunks, found %',
      (select count(*) from content_chunks where section_id = v_section);
  end if;

  -- Embeddings must be 1024-dim or nothing downstream works.
  if (select vector_dims(embedding) from content_chunks where content_hash = 'torture-hash-alpha') <> 1024 then
    raise exception 'TEST FAILED: stored embedding is not 1024 dimensions';
  end if;

  insert into test_results values (6, 'ingest_document happy path: chapter + source + section + 2 chunks', true);
end $$;

-- =============================================================================
-- C. IDEMPOTENCY + FORCE MODE
-- =============================================================================

-- Re-ingesting the identical document must write ZERO new chunks.
do $$
declare
  v_payload jsonb;
  v_result  jsonb;
  emb1 jsonb := (select jsonb_agg(case when g = 1 then 1 else 0 end order by g) from generate_series(1, 1024) g);
  emb2 jsonb := (select jsonb_agg(case when g = 2 then 1 else 0 end order by g) from generate_series(1, 1024) g);
begin
  v_payload := jsonb_build_object(
    'board', 'PCTB', 'classLevel', 10, 'subject', 'physics',
    'chapterNo', 999, 'chapterTitle', 'Torture Test Chapter',
    'sourceType', 'textbook', 'language', 'en',
    'sections', jsonb_build_array(
      jsonb_build_object('section', 'T.1 Alpha', 'position', 1, 'pageFrom', 1, 'pageTo', 2,
        'chunks', jsonb_build_array(
          jsonb_build_object('chunkIndex', 1, 'content', 'alpha torture content about electric current',
                             'contentHash', 'torture-hash-alpha', 'embedding', emb1),
          jsonb_build_object('chunkIndex', 2, 'content', 'beta torture content about voltage',
                             'contentHash', 'torture-hash-beta', 'embedding', emb2))))
  );
  select ingest_document(v_payload, false) into v_result;
  if (v_result->>'chunksWritten')::int <> 0 then
    raise exception 'TEST FAILED: idempotent re-ingest wrote % chunks, expected 0', v_result->>'chunksWritten';
  end if;
  insert into test_results values (7, 're-ingestion is idempotent (content_hash dedupe)', true);
end $$;

-- --force must OVERWRITE the stored embedding for the same content hash.
do $$
declare
  v_payload jsonb;
  v_result  jsonb;
  emb1 jsonb := (select jsonb_agg(case when g = 1 then 1 else 0 end order by g) from generate_series(1, 1024) g);
  emb3 jsonb := (select jsonb_agg(case when g = 3 then 1 else 0 end order by g) from generate_series(1, 1024) g);
  v_dist double precision;
begin
  v_payload := jsonb_build_object(
    'board', 'PCTB', 'classLevel', 10, 'subject', 'physics',
    'chapterNo', 999, 'chapterTitle', 'Torture Test Chapter',
    'sourceType', 'textbook', 'language', 'en',
    'sections', jsonb_build_array(
      jsonb_build_object('section', 'T.1 Alpha', 'position', 1, 'pageFrom', 1, 'pageTo', 2,
        'chunks', jsonb_build_array(
          jsonb_build_object('chunkIndex', 1, 'content', 'alpha torture content about electric current',
                             'contentHash', 'torture-hash-alpha', 'embedding', emb1),
          -- same hash as beta, NEW embedding (one-hot at position 3 instead of 2)
          jsonb_build_object('chunkIndex', 2, 'content', 'beta torture content about voltage',
                             'contentHash', 'torture-hash-beta', 'embedding', emb3))))
  );
  select ingest_document(v_payload, true) into v_result;
  if (v_result->>'chunksWritten')::int <> 2 then
    raise exception 'TEST FAILED: force re-ingest wrote % chunks, expected 2', v_result->>'chunksWritten';
  end if;

  select embedding <=> emb3::text::vector into v_dist
  from content_chunks where content_hash = 'torture-hash-beta';
  if v_dist > 0.0001 then
    raise exception 'TEST FAILED: force mode did not overwrite the embedding (distance %)', v_dist;
  end if;
  insert into test_results values (8, 'force mode overwrites existing chunks', true);
end $$;

-- =============================================================================
-- D. ATOMICITY — a document with ONE bad chunk must leave ZERO rows behind
-- =============================================================================

do $$
declare
  v_payload jsonb;
  emb1 jsonb := (select jsonb_agg(case when g = 1 then 1 else 0 end order by g) from generate_series(1, 1024) g);
begin
  v_payload := jsonb_build_object(
    'board', 'PCTB', 'classLevel', 10, 'subject', 'physics',
    'chapterNo', 998, 'chapterTitle', 'Doomed Chapter',
    'sourceType', 'textbook', 'language', 'en',
    'sections', jsonb_build_array(
      jsonb_build_object('section', 'D.1 Fine', 'position', 1, 'pageFrom', 1, 'pageTo', 1,
        'chunks', jsonb_build_array(
          jsonb_build_object('chunkIndex', 1, 'content', 'a perfectly good chunk',
                             'contentHash', 'torture-hash-doomed-good', 'embedding', emb1))),
      jsonb_build_object('section', 'D.2 Broken', 'position', 2, 'pageFrom', 2, 'pageTo', 3,
        'chunks', jsonb_build_array(
          -- 3 dimensions against a vector(1024) column: the classic silent failure, here used
          -- deliberately as the poison pill.
          jsonb_build_object('chunkIndex', 1, 'content', 'bad chunk',
                             'contentHash', 'torture-hash-doomed-bad',
                             'embedding', jsonb_build_array(1, 2, 3)))))
  );

  begin
    perform ingest_document(v_payload, false);
    raise exception 'TEST FAILED: a 3-dimensional embedding was accepted';
  exception
    when others then
      -- Expected. Now the real assertion: the function ran as ONE transaction, so not even
      -- the chapter row may survive.
      if exists (select 1 from chapters where board_code = 'PCTB' and chapter_no = 998) then
        raise exception 'TEST FAILED: failed ingest left a partial chapter row (not atomic)';
      end if;
      if exists (select 1 from content_chunks where content_hash = 'torture-hash-doomed-good') then
        raise exception 'TEST FAILED: failed ingest left a partial chunk row (not atomic)';
      end if;
  end;

  insert into test_results values (9, 'atomicity: one bad chunk rolls back the whole document', true);
end $$;

-- =============================================================================
-- E. CONSTRAINT ENFORCEMENT — every guard must actually fire
-- (uses the valid parent rows created by the happy-path ingest)
-- =============================================================================

do $$
declare
  v_section uuid;
  -- Dimensionally-valid throwaway embedding: each insert below targets a SPECIFIC
  -- constraint, so the vector itself must pass vector(1024) validation first —
  -- Postgres checks the column type BEFORE the CHECK constraint, and a 1-dim literal
  -- fails with 22000 before the constraint under test is ever reached. (Verified the
  -- hard way: that dimension guard is exactly the #1 trap in AGENTS.md, working.)
  v_emb text := '[' || array_to_string(array_fill(0::float, array[1024]), ',') || ']';
begin
  select s.id into v_section
  from sections s
  join chapter_sources cs on cs.id = s.source_id
  join chapters ch on ch.id = cs.chapter_id
  where ch.chapter_no = 999 and s.section_label = 'T.1 Alpha';

  -- CHECK: page_from <= page_to
  begin
    insert into sections (source_id, section_label, position, page_from, page_to)
    values ((select source_id from sections where id = v_section), 'Bad pages', 9, 10, 2);
    raise exception 'TEST FAILED: page_from > page_to accepted';
  exception when check_violation then null;
  end;
  insert into test_results values (10, 'CHECK fires: page range', true);

  -- CHECK: position > 0
  begin
    insert into sections (source_id, section_label, position)
    values ((select source_id from sections where id = v_section), 'Bad position', 0);
    raise exception 'TEST FAILED: position 0 accepted';
  exception when check_violation then null;
  end;
  insert into test_results values (11, 'CHECK fires: section position > 0', true);

  -- CHECK: non-empty chunk content
  begin
    insert into content_chunks (section_id, chunk_index, content, content_hash, embedding)
    values (v_section, 9, '   ', 'torture-hash-empty', v_emb::vector);
    raise exception 'TEST FAILED: empty chunk content accepted';
  exception when check_violation then null;
  end;
  insert into test_results values (12, 'CHECK fires: empty chunk content', true);

  -- UNIQUE: content_hash
  begin
    insert into content_chunks (section_id, chunk_index, content, content_hash, embedding)
    values (v_section, 9, 'duplicate hash attempt', 'torture-hash-alpha', v_emb::vector);
    raise exception 'TEST FAILED: duplicate content_hash accepted';
  exception when unique_violation then null;
  end;
  insert into test_results values (13, 'UNIQUE fires: content_hash', true);

  -- FK: chunk must reference a real section
  begin
    insert into content_chunks (section_id, chunk_index, content, content_hash, embedding)
    values (gen_random_uuid(), 1, 'orphan chunk', 'torture-hash-orphan', v_emb::vector);
    raise exception 'TEST FAILED: chunk with bogus section_id accepted';
  exception when foreign_key_violation then null;
  end;
  insert into test_results values (14, 'FK fires: chunk -> section', true);

  -- UNIQUE: chapter natural key
  begin
    insert into chapters (board_code, class_level, subject_code, chapter_no, chapter_title)
    values ('PCTB', 10, 'physics', 999, 'Duplicate Chapter');
    raise exception 'TEST FAILED: duplicate chapter natural key accepted';
  exception when unique_violation then null;
  end;
  insert into test_results values (15, 'UNIQUE fires: chapter natural key', true);

  -- FK: chapter must reference a real board
  begin
    insert into chapters (board_code, class_level, subject_code, chapter_no, chapter_title)
    values ('NO_SUCH_BOARD', 10, 'physics', 1, 'Bogus');
    raise exception 'TEST FAILED: chapter with bogus board accepted';
  exception when foreign_key_violation then null;
  end;
  insert into test_results values (16, 'FK fires: chapter -> boards', true);

  -- CHECK: top1_score within [-1, 1]
  begin
    insert into qa_log (subject_code, top1_score) values ('physics', 5.0);
    raise exception 'TEST FAILED: top1_score 5.0 accepted';
  exception when check_violation then null;
  end;
  insert into test_results values (17, 'CHECK fires: top1_score range', true);

  -- FK: gate_decision must be a real decision
  begin
    insert into qa_log (subject_code, gate_decision) values ('physics', 'MAYBE');
    raise exception 'TEST FAILED: gate_decision MAYBE accepted';
  exception when foreign_key_violation then null;
  end;
  insert into test_results values (18, 'FK fires: gate_decision reference', true);
end $$;

-- =============================================================================
-- F. VECTOR SEARCH — the RPC returns the right chunk, filtered, scored, joined
-- =============================================================================

do $$
declare
  emb1 jsonb := (select jsonb_agg(case when g = 1 then 1 else 0 end order by g) from generate_series(1, 1024) g);
  v_content text;
  v_score   double precision;
  v_title   text;
  v_section text;
  v_page    int;
begin
  -- Query with alpha's exact embedding: alpha must be the top hit with score ~1.0,
  -- and the join must bring back chapter/section/page metadata.
  select m.content, m.score, m.chapter_title, m.section, m.page_from
    into v_content, v_score, v_title, v_section, v_page
  from match_content_chunks(emb1::text::vector, 'PCTB', 10, 'physics', 5) m
  order by m.score desc
  limit 1;

  if v_content is null or v_content <> 'alpha torture content about electric current' then
    raise exception 'TEST FAILED: vector search returned the wrong chunk: %', v_content;
  end if;
  if abs(v_score - 1) > 0.001 then
    raise exception 'TEST FAILED: identical embedding scored %, expected ~1.0', v_score;
  end if;
  if v_title <> 'Torture Test Chapter' or v_section <> 'T.1 Alpha' or v_page <> 1 then
    raise exception 'TEST FAILED: join metadata wrong (title=%, section=%, page=%)', v_title, v_section, v_page;
  end if;
  insert into test_results values (19, 'match_content_chunks: correct chunk, score, joined metadata', true);
end $$;

-- The curriculum filter must exclude everything outside the filter (invariant 6).
do $$
declare
  emb1 jsonb := (select jsonb_agg(case when g = 1 then 1 else 0 end order by g) from generate_series(1, 1024) g);
begin
  if exists (
    select 1 from match_content_chunks(emb1::text::vector, 'FBISE', 10, 'physics', 5)
  ) then
    raise exception 'TEST FAILED: search leaked across the board filter';
  end if;
  if exists (
    select 1 from match_content_chunks(emb1::text::vector, 'PCTB', 9, 'physics', 5)
  ) then
    raise exception 'TEST FAILED: search leaked across the class filter';
  end if;
  insert into test_results values (20, 'match_content_chunks: board/class filter is airtight', true);
end $$;

-- The expanded view must flatten the chain correctly.
do $$
declare
  v record;
begin
  select * into v from content_chunks_expanded where content_hash = 'torture-hash-alpha';
  if v is null then
    raise exception 'TEST FAILED: content_chunks_expanded is missing the ingested chunk';
  end if;
  if v.board <> 'PCTB' or v.chapter_title <> 'Torture Test Chapter'
     or v.section <> 'T.1 Alpha' or v.source_type <> 'textbook' or v.language <> 'en' then
    raise exception 'TEST FAILED: view flattened the chain incorrectly';
  end if;
  insert into test_results values (21, 'content_chunks_expanded view flattens correctly', true);
end $$;

-- =============================================================================
-- G. RLS VISIBILITY — what the anon role actually sees
-- =============================================================================
-- The SQL Editor / psql session runs as postgres, which bypasses RLS. So switch to the
-- anon role for these reads. Temp tables are not RLS-covered, so we stage the counts.

grant insert on test_results to anon;
create temporary table rls_probe (name text, n bigint) on commit drop;
grant insert on rls_probe to anon;

set local role anon;
insert into rls_probe select 'chunks', count(*) from content_chunks;
insert into rls_probe select 'boards', count(*) from boards;
insert into rls_probe select 'answer_keys', count(*) from quiz_answer_keys;
reset role;

do $$
begin
  -- Two chunks EXIST (inserted above), but the anon role has no student profile,
  -- so chunks_match_profile must hide them. This is the RLS trap, working as designed —
  -- and the reason retrieval always runs with the service role.
  if (select n from rls_probe where name = 'chunks') <> 0 then
    raise exception 'TEST FAILED: anon sees content_chunks rows';
  end if;
  -- Reference data is intentionally public.
  if (select n from rls_probe where name = 'boards') < 2 then
    raise exception 'TEST FAILED: anon cannot read reference data';
  end if;
  -- Answer keys: deny by default.
  if (select n from rls_probe where name = 'answer_keys') <> 0 then
    raise exception 'TEST FAILED: anon can read quiz_answer_keys';
  end if;
  insert into test_results values (22, 'RLS: anon sees 0 chunks, 0 answer keys, reference data only', true);
end $$;

-- =============================================================================
-- RESULTS — then roll EVERYTHING back. The database is left untouched.
-- =============================================================================

select * from test_results order by test;
select count(*) as passed, (select count(*) from test_results) as of_total from test_results;

rollback;
