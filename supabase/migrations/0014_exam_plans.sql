-- Revision Planner (M10). Each plan has its own subject + chapter range + exam date — a student
-- has a Physics exam on one date and a Chemistry exam on another, so this can't reuse the single
-- profile-wide student_profiles.exam_date column.
--
-- Only the scope (subject/range/date/buffer-day choice) is persisted here. The day-by-day
-- schedule itself is computed fresh every time a plan is viewed (see src/lib/mastery.ts and
-- the plan detail route) from *current* mastery data, not stored — so if a student quizzes
-- mid-plan and a chapter's band changes, the remaining days reprioritize automatically instead
-- of showing a stale schedule.

create table if not exists exam_plans (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references users(id) on delete cascade,
  board_code          text not null references boards(board_code),
  class_level         smallint not null references class_levels(class_level),
  subject_code        text not null references subjects(subject_code),
  from_chapter_no      int not null check (from_chapter_no > 0),
  to_chapter_no        int not null check (to_chapter_no >= from_chapter_no),
  -- Postgres check constraints must be immutable; current_date is stable, not immutable, so
  -- "exam_date must be in the future" is validated in the API instead, not here.
  exam_date           date not null,
  reserve_buffer_day  boolean not null default true,
  created_at          timestamptz not null default now()
);

create index if not exists exam_plans_user_idx on exam_plans (user_id);

alter table exam_plans enable row level security;
create policy exam_plans_own on exam_plans
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
