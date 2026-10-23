-- Structured, source-backed criterion reviews are saved with each submitted answer.
-- Existing attempts remain readable with a null review.
alter table public.quiz_attempt_answers
  add column if not exists grading_review jsonb;
