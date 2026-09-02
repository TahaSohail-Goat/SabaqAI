-- In-progress (generated-but-ungraded) quizzes, moved server-side so a student can resume one
-- after logging out or on another device.
--
-- This is the one place /api/quiz generation writes a row — but a `quiz_drafts` row is
-- disposable scratch state, NOT a "quiz taken" record. It's deleted the moment the quiz is
-- submitted (when persistQuiz/persistAttempt write the real quizzes/quiz_attempts rows in
-- src/lib/quiz/persist.ts) or when the same chapter is regenerated. Nothing here feeds mastery
-- (src/lib/mastery.ts), /api/dashboard/stats, or the completed-quiz history — those all read
-- quiz_attempts, which a draft never creates.

create table if not exists quiz_drafts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  board_code    text not null references boards(board_code),
  class_level   smallint not null references class_levels(class_level),
  subject_code  text not null references subjects(subject_code),
  chapter_no    smallint not null check (chapter_no > 0),
  chapter_title text not null default '',

  -- The sealed AES-256-GCM token /api/quiz already mints (src/lib/quiz/answer-key.ts).
  -- Server-minted and already encrypted — storing it is not a secrets leak. Carries the
  -- answer key needed to grade the quiz when it's resumed.
  quiz_token    text not null,

  -- Serialized client working-set, deliberately not normalized into per-question rows:
  --   * `questions` is the browser-safe list (no correct_index / explanation / model_answer /
  --     rubric — the exact shape /api/quiz already returns), written once, never mutated.
  --   * `answers` is { "<question_index>": <option_index | free_text> }, replaced wholesale
  --     on each autosave.
  -- The row's lifespan is one sitting and it's queried only as a whole; splitting it into
  -- child tables would add write amplification and cascade complexity for no query benefit.
  -- (exam_plans in 0014 and qa_log set the precedent for pragmatic non-normalized columns.)
  questions        jsonb not null,
  answers          jsonb not null default '{}'::jsonb,
  is_partial       boolean not null default false,
  effective_counts jsonb,

  generated_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- One draft per student per chapter scope — regenerating the same chapter replaces it.
  unique (user_id, board_code, class_level, subject_code, chapter_no)
);

create index if not exists quiz_drafts_user_idx on quiz_drafts (user_id);

alter table quiz_drafts enable row level security;
create policy quiz_drafts_own on quiz_drafts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
