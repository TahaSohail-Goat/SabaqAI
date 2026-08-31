-- Dynamic quiz module: chapter/topic scope + MCQ/short/long question types.
-- Everything here is additive — no existing MCQ column dropped or renamed, so rows written by
-- the old chapter-only, MCQ-only quiz flow keep working unchanged.

-- =============================================================================
-- Question types (mirrors the quiz_difficulties reference-table pattern in 0001_init.sql)
-- =============================================================================

create table if not exists quiz_question_types (
  question_type text primary key
);

insert into quiz_question_types (question_type) values ('mcq'), ('short'), ('long')
on conflict do nothing;

alter table quiz_question_types enable row level security;
create policy ref_read on quiz_question_types for select using (true);

-- =============================================================================
-- Scope + type columns
-- =============================================================================

-- null = whole-chapter quiz (existing behavior). Non-null = generated from a single topic
-- (sections.section_label) within the chapter. Not a FK: one quiz spans many chunks/sections,
-- and section_label itself carries no id worth pointing at here.
alter table quizzes add column if not exists topic_label text;

alter table quiz_questions
  add column if not exists question_type text not null default 'mcq'
    references quiz_question_types(question_type);

-- =============================================================================
-- Free-text grading spec — parallel to quiz_answer_keys, same deny-by-default posture.
-- Kept as its own table rather than widening quiz_answer_keys: MCQ grading (index match) and
-- free-text grading (LLM judgment against a rubric) are different enough mechanisms that a
-- shared table would need a pile of nullable columns plus a check that exactly one grading
-- shape is populated. A question has a row in exactly one of these two tables, never both.
-- =============================================================================

create table if not exists quiz_answer_rubrics (
  question_id  uuid primary key references quiz_questions(id) on delete cascade,
  model_answer text not null,
  rubric       text not null default '',
  max_score    smallint not null default 1 check (max_score > 0)
);

alter table quiz_answer_rubrics enable row level security;
-- quiz_answer_rubrics deliberately gets NO policy for anon/authenticated: deny by default,
-- same as quiz_answer_keys — the model answer/rubric never reaches the browser before
-- submission. Grading reads it with the service role only.

-- =============================================================================
-- Attempt answers: free-text submission + partial credit
-- =============================================================================

alter table quiz_attempt_answers add column if not exists answer_text text;
alter table quiz_attempt_answers add column if not exists points_awarded numeric(4,2);
alter table quiz_attempt_answers add column if not exists points_possible numeric(4,2);
alter table quiz_attempt_answers add column if not exists feedback text;

-- =============================================================================
-- Repeat-avoidance lookup: "what has this student already been asked in this chapter"
-- =============================================================================

create index if not exists quizzes_user_chapter_idx on quizzes (user_id, chapter_id);
