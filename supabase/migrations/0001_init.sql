-- Sabaq AI MVP — run this whole file in the Supabase SQL Editor.
-- If your embedding model is not 1024-dimensional, change vector(1024) below BEFORE running.

create extension if not exists vector;

create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('student','guardian','admin')),
  display_name text not null default '',
  preferred_language text not null default 'en' check (preferred_language in ('ur','en')),
  created_at timestamptz not null default now()
);

create table if not exists student_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  board text not null default 'PCTB',
  class_level int not null default 10 check (class_level between 1 and 12),
  subjects text[] not null default '{}',
  exam_date date,
  created_at timestamptz not null default now()
);

create table if not exists content_chunks (
  id uuid primary key default gen_random_uuid(),
  board text not null,
  class_level int not null,
  subject text not null,
  chapter_no int not null,
  chapter_title text,
  section text,
  page_from int,
  page_to int,
  source_type text not null default 'textbook' check (source_type in ('textbook','past_paper','marking_scheme')),
  language text not null default 'en',
  content text not null,
  content_hash text not null,
  embedding vector(1024) not null,
  created_at timestamptz not null default now(),
  unique (content_hash)
);

create index if not exists content_chunks_embedding_idx
  on content_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists content_chunks_filter_idx
  on content_chunks (board, class_level, subject);

create table if not exists qa_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  subject text,
  question_language text,
  top1_score numeric,
  support_count int,
  gate_decision text check (gate_decision in ('PASS','BORDERLINE','REFUSE')),
  refusal_reason text,
  retrieved_chunk_ids uuid[],
  cited_chunk_ids uuid[],
  latency_total_ms int,
  created_at timestamptz not null default now()
);

create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  subject text not null,
  chapter_no int not null,
  difficulty text not null default 'medium',
  created_at timestamptz not null default now()
);

create table if not exists quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid references quizzes(id) on delete cascade,
  position int not null,
  stem text not null,
  options jsonb not null,
  correct_index int not null check (correct_index between 0 and 3),
  explanation text,
  chunk_id uuid references content_chunks(id),
  topic_tag text
);

create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid references quizzes(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  answers jsonb not null,
  score int not null,
  submitted_at timestamptz not null default now()
);

-- Row Level Security: students see only their own data and their own curriculum's content.
alter table users            enable row level security;
alter table student_profiles enable row level security;
alter table content_chunks   enable row level security;
alter table qa_log           enable row level security;
alter table quizzes          enable row level security;
alter table quiz_questions   enable row level security;
alter table quiz_attempts    enable row level security;

create policy users_self on users
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_self on student_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy chunks_match_profile on content_chunks
  for select using (
    exists (
      select 1 from student_profiles p
      where p.user_id = auth.uid()
        and p.board = content_chunks.board
        and p.class_level = content_chunks.class_level
        and content_chunks.subject = any (p.subjects)
    )
  );

create policy qa_log_own on qa_log
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy quizzes_own on quizzes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy quiz_attempts_own on quiz_attempts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy quiz_questions_own on quiz_questions
  for select using (
    exists (select 1 from quizzes q where q.id = quiz_questions.quiz_id and q.user_id = auth.uid())
  );

-- Ingestion runs with the service_role key, which bypasses RLS. That is expected and correct.
