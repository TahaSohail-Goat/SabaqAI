-- Invented search fixtures, not curriculum claims or provider/accuracy evaluation.
-- Run after migration 0023. All fixture rows roll back; never run ingestion.
begin;
set local search_path = public, extensions;
create function pg_temp.ask_vector(sim double precision) returns vector
language sql immutable as $$ select (array[sim::real, sqrt(1 - sim * sim)::real] || array_fill(0::real, array[1022]))::vector $$;
insert into chapters(id, board_code, class_level, subject_code, chapter_no, chapter_title) values
('ab230000-0000-4000-8000-000000000001','FBISE',10,'chemistry',9001,'TEST hybrid chapter'),
('ab230000-0000-4000-8000-000000000002','FBISE',10,'chemistry',9002,'TEST forbidden chapter'),
('ab230000-0000-4000-8000-000000000003','FBISE',10,'physics',9001,'TEST forbidden subject');
insert into chapter_sources(id, chapter_id, source_type, language_code) values
('ab230000-0000-4000-8000-000000000011','ab230000-0000-4000-8000-000000000001','textbook','en'),
('ab230000-0000-4000-8000-000000000012','ab230000-0000-4000-8000-000000000001','textbook','ur'),
('ab230000-0000-4000-8000-000000000013','ab230000-0000-4000-8000-000000000002','textbook','en'),
('ab230000-0000-4000-8000-000000000014','ab230000-0000-4000-8000-000000000003','textbook','en'),
('ab230000-0000-4000-8000-000000000015','ab230000-0000-4000-8000-000000000001','past_paper','en');
insert into sections(id, source_id, section_label, position)
select ('ab230000-0000-4000-8000-0000000000' || n)::uuid,
('ab230000-0000-4000-8000-0000000000' || (n - 10))::uuid, 'TEST section', 1 from generate_series(21,25) n;
insert into content_chunks(section_id, chunk_index, content, content_hash, embedding)
select 'ab230000-0000-4000-8000-000000000021', n,
case when n = 1 then 'Energy transfers to separate particles through a change of state.' else 'TEST unrelated apparatus procedure ' || n end,
'TEST ask hybrid vector ' || n, pg_temp.ask_vector(0.98 - n * 0.02) from generate_series(1,6) n;
insert into content_chunks(section_id, chunk_index, content, content_hash, embedding) values
('ab230000-0000-4000-8000-000000000021',7,
'Boiling temperature stays steady because continued heating supplies energy for a change of state, under constant pressure.',
'TEST ask hybrid condition',pg_temp.ask_vector(0.60));
insert into content_chunks(section_id, chunk_index, content, content_hash, embedding)
select ('ab230000-0000-4000-8000-0000000000' || n)::uuid, 1,
'Boiling temperature heating constant pressure: forbidden source fixture.', 'TEST ask hybrid forbidden ' || n,
pg_temp.ask_vector(0.999) from generate_series(22,25) n;

do $$
declare v vector := pg_temp.ask_vector(1); wanted uuid; selected uuid[]; old_selected uuid[]; t timestamptz; elapsed numeric; old_elapsed numeric;
begin
  select id into wanted from content_chunks where content_hash = 'TEST ask hybrid condition';
  t := clock_timestamp();
  select array_agg(id) into old_selected from (
    select c.id from content_chunks c join sections s on s.id=c.section_id
    where s.source_id='ab230000-0000-4000-8000-000000000011'
    order by c.embedding <=> v limit 6
  ) old;
  old_elapsed := extract(epoch from clock_timestamp()-t)*1000;
  if wanted = any(old_selected) then raise exception 'Bad fixture: old vector shortlist must miss condition'; end if;
  t := clock_timestamp();
  select array_agg(id order by retrieval_rank) into selected from public.search_ask_hybrid(v,
    array['boiling','temperature','heating','pressure'], 'FBISE',10,'chemistry','textbook',9001,
    'ab230000-0000-4000-8000-000000000011',6);
  elapsed := extract(epoch from clock_timestamp()-t)*1000;
  if not (wanted = any(selected[1:6])) then raise exception 'Hybrid shortlist missed lexical condition'; end if;
  if selected[1] <> old_selected[1] then raise exception 'Strongest vector (synonym-only passage) was lost'; end if;
  if exists(select 1 from unnest(selected) i join content_chunks c on c.id=i join sections s on s.id=c.section_id
    where s.source_id <> 'ab230000-0000-4000-8000-000000000011') then raise exception 'Source/subject/chapter leak'; end if;
  if exists(select 1 from public.search_ask_hybrid(v,array['boiling'],'FBISE',10,'chemistry','textbook',9002,
    'ab230000-0000-4000-8000-000000000011',6)) then raise exception 'Wrong chapter accepted'; end if;
  if exists(select 1 from public.search_ask_hybrid(v,array['boiling'],'FBISE',10,'physics','textbook',9001,
    'ab230000-0000-4000-8000-000000000011',6)) then raise exception 'Wrong subject accepted'; end if;
  if exists(select 1 from public.search_ask_hybrid(v,array['boiling'],'OTHER',10,'chemistry','textbook',9001,
    'ab230000-0000-4000-8000-000000000011',6)) then raise exception 'Wrong board accepted'; end if;
  if exists(select 1 from public.search_ask_hybrid(v,array['boiling'],'FBISE',9,'chemistry','textbook',9001,
    'ab230000-0000-4000-8000-000000000011',6)) then raise exception 'Wrong class accepted'; end if;
  if exists(select 1 from public.search_ask_hybrid(v,array['boiling'],'FBISE',10,'chemistry','past_paper',9001,
    'ab230000-0000-4000-8000-000000000011',6)) then raise exception 'Wrong source category accepted'; end if;
  if (select count(*) from public.search_ask_hybrid(v,array['unmatchedsynonym'],'FBISE',10,'chemistry','textbook',9001,
    'ab230000-0000-4000-8000-000000000011',6)) <> 6 then raise exception 'Lexical miss must not exclude vectors'; end if;
  if (select count(*) from public.search_ask_hybrid(v,array[]::text[],'FBISE',10,'chemistry','textbook',9001,
    'ab230000-0000-4000-8000-000000000011',6)) <> 6 then raise exception 'Empty terms must retain vectors'; end if;
  if (select count(*) <> count(distinct id) from public.search_ask_hybrid(v,array['boiling'],'FBISE',10,'chemistry','textbook',9001,
    'ab230000-0000-4000-8000-000000000011',6)) then raise exception 'Duplicate hybrid identity'; end if;
  if exists(select 1 from public.search_ask_hybrid(v,array['boiling'],'FBISE',10,'chemistry','textbook',9001,
    'ab230000-0000-4000-8000-000000000011',6) h join content_chunks c on c.id=h.id
    where abs(h.score - (1 - (c.embedding <=> v))) > 1e-9) then raise exception 'Confidence score was changed by fusion'; end if;
  if has_function_privilege('anon','public.search_ask_hybrid(vector,text[],text,int,text,text,int,uuid,int)','EXECUTE')
    or has_function_privilege('authenticated','public.search_ask_hybrid(vector,text[],text,int,text,text,int,uuid,int)','EXECUTE')
    or not has_function_privilege('service_role','public.search_ask_hybrid(vector,text[],text,int,text,text,int,uuid,int)','EXECUTE') then raise exception 'Unsafe function grants'; end if;
  raise notice 'PASS: hybrid condition recovered, vector synonyms retained, real cosine preserved, scopes isolated, grants restricted. Fixture old vector query ms=%, hybrid query ms=%',old_elapsed,elapsed;
end $$;
rollback;
