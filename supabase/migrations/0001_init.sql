-- Sabaq AI — schema v2 (BCNF-normalised). Run this whole file in the Supabase SQL Editor.
-- Supersedes the v1 schema before it ever ran: no live database contains the old tables.
-- Design record: docs/schema-proposal.md (approved).
--
-- Guarantees this file is built around:
--   * BCNF — no arrays, no JSONB repeating groups, no duplicated chapter/section metadata.
--   * Atomicity — multi-row writes happen inside ingest_document() (see 0003) or single upserts.
--   * Consistency — every relationship is a FK; every bounded value is a CHECK or reference FK.
--   * Zero dependencies — the ONLY extension is pgvector (required for embeddings).
--     gen_random_uuid() is Postgres 13+ core; no pgcrypto needed.
--
-- If your embedding model is not 1024-dimensional, change vector(1024) below BEFORE running,
-- set EMBEDDING_DIM to match, and change query_embedding in 0002_match_function.sql too.

create extension if not exists vector;

-- =============================================================================
-- 1. Reference tables — every enumerated domain, keyed by its natural code.
--    Growing a domain (new board, subject, language) is an INSERT, never a migration.
-- =============================================================================

create table if not exists boards (
  board_code text primary key,
  board_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists class_levels (
  class_level smallint primary key check (class_level between 1 and 12),
  label       text not null
);

create table if not exists subjects (
  subject_code text primary key,
  subject_name text not null
);

create table if not exists languages (
  language_code text primary key,
  language_name text not null
);

create table if not exists source_types (
  source_type text primary key,
  description text not null default ''
);

create table if not exists user_roles (
  role_code   text primary key,
  description text not null default ''
);

create table if not exists gate_decisions (
  decision text primary key
);

create table if not exists refusal_reasons (
  reason_code text primary key
);

create table if not exists quiz_difficulties (
  difficulty text primary key
);

insert into boards (board_code, board_name) values
  ('PCTB', 'Punjab Curriculum and Textbook Board'),
  ('FBISE', 'Federal Board of Intermediate and Secondary Education')
on conflict do nothing;

insert into class_levels (class_level, label)
select g, 'Class ' || g from generate_series(1, 12) as g
on conflict do nothing;

insert into subjects (subject_code, subject_name) values
  ('physics', 'Physics'),
  ('chemistry', 'Chemistry'),
  ('biology', 'Biology'),
  ('mathematics', 'Mathematics'),
  ('english', 'English'),
  ('urdu', 'Urdu')
on conflict do nothing;

insert into languages (language_code, language_name) values
  ('en', 'English'),
  ('ur', 'Urdu'),
  ('roman_ur', 'Roman Urdu')
on conflict do nothing;

insert into source_types (source_type, description) values
  ('textbook', 'Official board textbook'),
  ('past_paper', 'Past board examination paper'),
  ('marking_scheme', 'Official marking scheme')
on conflict do nothing;

insert into user_roles (role_code, description) values
  ('student', 'Student'),
  ('guardian', 'Parent or guardian'),
  ('admin', 'Administrator')
on conflict do nothing;

insert into gate_decisions (decision) values ('PASS'), ('BORDERLINE'), ('REFUSE')
on conflict do nothing;

insert into refusal_reasons (reason_code) values
  ('no_candidates'), ('low_similarity'), ('ungrounded_output')
on conflict do nothing;

insert into quiz_difficulties (difficulty) values ('easy'), ('medium'), ('hard')
on conflict do nothing;

-- =============================================================================
-- 2. Identity and student profile
-- =============================================================================

create table if not exists users (
  id                 uuid primary key references auth.users(id) on delete cascade,
  role_code          text not null default 'student' references user_roles(role_code),
  display_name       text not null default '',
  preferred_language text not null default 'en' references languages(language_code),
  created_at         timestamptz not null default now()
);

create table if not exists student_profiles (
  user_id     uuid primary key references users(id) on delete cascade,
  board_code  text not null references boards(board_code),
  class_level smallint not null references class_levels(class_level),
  exam_date   date,
  created_at  timestamptz not null default now()
);

-- A student's subjects are a set, not an array column (1NF).
create table if not exists student_subjects (
  user_id      uuid not null references student_profiles(user_id) on delete cascade,
  subject_code text not null references subjects(subject_code),
  primary key (user_id, subject_code)
);

-- =============================================================================
-- 3. Curriculum content — the grounding corpus.
--    chapters → chapter_sources → sections → content_chunks.
--    A chunk's board/class/subject/title/pages are reached by joining this chain;
--    storing any of them on the chunk row would be a transitive dependency (3NF).
-- =============================================================================

create table if not exists chapters (
  id            uuid primary key default gen_random_uuid(),
  board_code    text not null references boards(board_code),
  class_level   smallint not null references class_levels(class_level),
  subject_code  text not null references subjects(subject_code),
  chapter_no    int not null check (chapter_no > 0),
  chapter_title text not null,
  created_at    timestamptz not null default now(),
  unique (board_code, class_level, subject_code, chapter_no)
);

-- One row per ingested document for a chapter: the textbook, a past paper, a marking scheme.
-- source_type and language are document-level facts, not chunk-level.
create table if not exists chapter_sources (
  id            uuid primary key default gen_random_uuid(),
  chapter_id    uuid not null references chapters(id) on delete cascade,
  source_type   text not null references source_types(source_type),
  language_code text not null references languages(language_code),
  created_at    timestamptz not null default now(),
  unique (chapter_id, source_type, language_code)
);

-- section_label is what the citation chip shows: '14.3 Ohm''s Law and Resistance'.
-- Page ranges are section-level facts.
create table if not exists sections (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references chapter_sources(id) on delete cascade,
  section_label text not null,
  position      smallint not null check (position > 0),
  page_from     int,
  page_to       int,
  check (page_from is null or page_to is null or page_from <= page_to),
  unique (source_id, section_label)
);

create table if not exists content_chunks (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references sections(id) on delete cascade,
  chunk_index smallint not null check (chunk_index > 0),
  content     text not null check (length(btrim(content)) > 0),
  -- sha256 of normalised content + curriculum identity; makes ingestion idempotent.
  content_hash text not null unique,
  -- Must match EMBEDDING_DIM and the embedding model. Change all three together and re-embed
  -- everything — a mismatch fails inserts with an error that never mentions the model.
  embedding   vector(1024) not null,
  created_at  timestamptz not null default now(),
  unique (section_id, chunk_index)
);

create index if not exists content_chunks_embedding_idx
  on content_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists content_chunks_section_idx on content_chunks (section_id);
create index if not exists sections_source_idx on sections (source_id);
create index if not exists chapter_sources_chapter_idx on chapter_sources (chapter_id);
-- chapters' natural unique constraint already indexes the retrieval filter
-- (board_code, class_level, subject_code).

-- Flattened read model for the corpus browser and debugging. Derived, not stored — the
-- normalised tables above remain the single source of truth. security_invoker makes the
-- underlying tables' RLS apply to whoever queries the view.
create or replace view content_chunks_expanded
with (security_invoker = true) as
select
  c.id,
  ch.board_code   as board,
  ch.class_level,
  ch.subject_code as subject,
  ch.chapter_no,
  ch.chapter_title,
  s.section_label as section,
  s.page_from,
  s.page_to,
  cs.source_type,
  cs.language_code as language,
  c.chunk_index,
  c.content,
  c.content_hash,
  c.created_at
from content_chunks c
join sections s         on s.id = c.section_id
join chapter_sources cs on cs.id = s.source_id
join chapters ch        on ch.id = cs.chapter_id;

-- =============================================================================
-- 4. Question-answer log
-- =============================================================================

create table if not exists qa_log (
  id                uuid primary key default gen_random_uuid(),
  -- SET NULL, not CASCADE: a deleted student's metrics must survive for evaluation.
  user_id           uuid references users(id) on delete set null,
  subject_code      text references subjects(subject_code),
  question_language text references languages(language_code),
  top1_score        real check (top1_score between -1 and 1),
  support_count     int check (support_count >= 0),
  gate_decision     text references gate_decisions(decision),
  refusal_reason    text references refusal_reasons(reason_code),
  latency_total_ms  int check (latency_total_ms >= 0),
  created_at        timestamptz not null default now()
);

-- Which chunks were retrieved for a question, with rank and score, and which were cited.
-- v1 stored these as two uuid[] columns — arrays are repeating groups (1NF) and lost the
-- per-chunk score and rank entirely.
create table if not exists qa_log_chunks (
  qa_log_id uuid not null references qa_log(id) on delete cascade,
  chunk_id  uuid not null references content_chunks(id) on delete cascade,
  rank      smallint not null check (rank > 0),
  score     real not null check (score between -1 and 1),
  was_cited boolean not null default false,
  primary key (qa_log_id, chunk_id)
);

create index if not exists qa_log_user_idx on qa_log (user_id);
create index if not exists qa_log_created_idx on qa_log (created_at desc);
create index if not exists qa_log_chunks_chunk_idx on qa_log_chunks (chunk_id);

-- =============================================================================
-- 5. Quizzes
-- =============================================================================

create table if not exists quizzes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  chapter_id uuid not null references chapters(id),
  difficulty text not null default 'medium' references quiz_difficulties(difficulty),
  created_at timestamptz not null default now()
);

create table if not exists quiz_questions (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references quizzes(id) on delete cascade,
  position    smallint not null check (position > 0),
  stem        text not null,
  -- SET NULL: deleting a corpus chunk must not cascade-delete a student's quiz history.
  chunk_id    uuid references content_chunks(id) on delete set null,
  unique (quiz_id, position)
);

-- Options are atomic rows, not a jsonb array (1NF). Students read these to render the quiz.
create table if not exists quiz_options (
  question_id  uuid not null references quiz_questions(id) on delete cascade,
  option_index smallint not null check (option_index >= 0),
  option_text  text not null check (length(btrim(option_text)) > 0),
  primary key (question_id, option_index)
);

-- The answer key lives in its own table with NO anon/authenticated RLS policy — deny by
-- default, readable only through the service role. This keeps "the correct answer never
-- reaches the browser before submission" structural rather than conventional, and is what
-- lets src/lib/quiz/answer-key.ts be retired once quiz persistence ships.
-- The composite FK guarantees the key points at an option that actually exists.
create table if not exists quiz_answer_keys (
  question_id          uuid primary key references quiz_questions(id) on delete cascade,
  correct_option_index smallint not null check (correct_option_index >= 0),
  explanation          text not null default '',
  foreign key (question_id, correct_option_index)
    references quiz_options (question_id, option_index) on delete cascade
);

create table if not exists quiz_attempts (
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid not null references quizzes(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  score        int not null check (score >= 0),
  total        int not null check (total > 0),
  answered     int not null check (answered >= 0),
  submitted_at timestamptz not null default now(),
  check (score <= total and answered <= total)
);

-- One atomic row per question answered in an attempt, not a jsonb blob (1NF).
create table if not exists quiz_attempt_answers (
  attempt_id            uuid not null references quiz_attempts(id) on delete cascade,
  question_id           uuid not null references quiz_questions(id) on delete cascade,
  selected_option_index smallint check (selected_option_index >= 0),  -- null = unanswered
  is_correct            boolean not null,
  primary key (attempt_id, question_id)
);

create index if not exists quiz_questions_quiz_idx on quiz_questions (quiz_id);
create index if not exists quizzes_user_idx on quizzes (user_id);
create index if not exists quiz_attempts_quiz_idx on quiz_attempts (quiz_id);
create index if not exists quiz_attempts_user_idx on quiz_attempts (user_id);

-- =============================================================================
-- 6. Row Level Security
--    Ingestion and retrieval run with the service role, which bypasses RLS deliberately
--    (see src/lib/supabase/admin.ts — with the anon key, every content query would return
--    zero rows and the app would refuse every question with no visible error).
-- =============================================================================

alter table boards               enable row level security;
alter table class_levels         enable row level security;
alter table subjects             enable row level security;
alter table languages            enable row level security;
alter table source_types         enable row level security;
alter table user_roles           enable row level security;
alter table gate_decisions       enable row level security;
alter table refusal_reasons      enable row level security;
alter table quiz_difficulties    enable row level security;
alter table users                enable row level security;
alter table student_profiles     enable row level security;
alter table student_subjects     enable row level security;
alter table chapters             enable row level security;
alter table chapter_sources      enable row level security;
alter table sections             enable row level security;
alter table content_chunks       enable row level security;
alter table qa_log               enable row level security;
alter table qa_log_chunks        enable row level security;
alter table quizzes              enable row level security;
alter table quiz_questions       enable row level security;
alter table quiz_options         enable row level security;
alter table quiz_answer_keys     enable row level security;
alter table quiz_attempts        enable row level security;
alter table quiz_attempt_answers enable row level security;

-- Reference data: readable by anyone, writable only via the service role.
create policy ref_read on boards            for select using (true);
create policy ref_read on class_levels      for select using (true);
create policy ref_read on subjects          for select using (true);
create policy ref_read on languages         for select using (true);
create policy ref_read on source_types      for select using (true);
create policy ref_read on user_roles        for select using (true);
create policy ref_read on gate_decisions    for select using (true);
create policy ref_read on refusal_reasons   for select using (true);
create policy ref_read on quiz_difficulties for select using (true);

-- Owner-only rows.
create policy users_self on users
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_self on student_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy student_subjects_self on student_subjects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Curriculum readable by a student whose profile matches it.
create policy chapters_match_profile on chapters for select using (
  exists (
    select 1
    from student_profiles p
    join student_subjects ss on ss.user_id = p.user_id
                            and ss.subject_code = chapters.subject_code
    where p.user_id = auth.uid()
      and p.board_code = chapters.board_code
      and p.class_level = chapters.class_level
  )
);
create policy chapter_sources_match_profile on chapter_sources for select using (
  exists (
    select 1
    from chapters ch
    join student_profiles p  on p.board_code = ch.board_code
                            and p.class_level = ch.class_level
    join student_subjects ss on ss.user_id = p.user_id
                            and ss.subject_code = ch.subject_code
    where ch.id = chapter_sources.chapter_id
      and p.user_id = auth.uid()
  )
);
create policy sections_match_profile on sections for select using (
  exists (
    select 1
    from chapter_sources cs
    join chapters ch          on ch.id = cs.chapter_id
    join student_profiles p   on p.board_code = ch.board_code
                             and p.class_level = ch.class_level
    join student_subjects ss  on ss.user_id = p.user_id
                             and ss.subject_code = ch.subject_code
    where cs.id = sections.source_id
      and p.user_id = auth.uid()
  )
);
create policy chunks_match_profile on content_chunks for select using (
  exists (
    select 1
    from sections s
    join chapter_sources cs   on cs.id = s.source_id
    join chapters ch          on ch.id = cs.chapter_id
    join student_profiles p   on p.board_code = ch.board_code
                             and p.class_level = ch.class_level
    join student_subjects ss  on ss.user_id = p.user_id
                             and ss.subject_code = ch.subject_code
    where s.id = content_chunks.section_id
      and p.user_id = auth.uid()
  )
);

create policy qa_log_own on qa_log
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy qa_log_chunks_own on qa_log_chunks
  for all using (
    exists (select 1 from qa_log l where l.id = qa_log_chunks.qa_log_id and l.user_id = auth.uid())
  ) with check (
    exists (select 1 from qa_log l where l.id = qa_log_chunks.qa_log_id and l.user_id = auth.uid())
  );

create policy quizzes_own on quizzes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy quiz_questions_own on quiz_questions for select using (
  exists (select 1 from quizzes q where q.id = quiz_questions.quiz_id and q.user_id = auth.uid())
);
create policy quiz_options_own on quiz_options for select using (
  exists (
    select 1 from quiz_questions qq
    join quizzes q on q.id = qq.quiz_id
    where qq.id = quiz_options.question_id and q.user_id = auth.uid()
  )
);
create policy quiz_attempts_own on quiz_attempts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy quiz_attempt_answers_own on quiz_attempt_answers for select using (
  exists (
    select 1 from quiz_attempts a
    where a.id = quiz_attempt_answers.attempt_id and a.user_id = auth.uid()
  )
);

-- quiz_answer_keys deliberately gets NO policy for anon/authenticated: deny by default.
-- Grading reads it with the service role only.

-- Ingestion runs with the service_role key, which bypasses RLS. That is expected and correct.
