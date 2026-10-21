-- Capture the submitted version, not a later edit to quiz_questions or its private key.
-- Existing answers deliberately stay NULL: their original version cannot be reconstructed.
alter table public.quiz_attempt_answers add column if not exists grading_state text
  check (grading_state in ('graded', 'unavailable'));
alter table public.quiz_attempt_answers add column if not exists review_snapshot jsonb;
alter table public.quiz_attempt_answers add column if not exists review_version uuid;

create or replace function public.capture_quiz_review_snapshot() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare q record; options jsonb; expected text;
begin
  if tg_op = 'UPDATE' then
    if new.review_snapshot is distinct from old.review_snapshot or new.review_version is distinct from old.review_version then
      raise exception 'Submission review snapshots are immutable';
    end if;
    return new;
  end if;
  select qq.*, a.quiz_id as attempt_quiz, c.board_code, c.class_level, c.subject_code, c.chapter_no
    into q from public.quiz_attempts a
    join public.quizzes quiz on quiz.id = a.quiz_id and quiz.user_id = a.user_id
    join public.chapters c on c.id = quiz.chapter_id
    join public.quiz_questions qq on qq.quiz_id = quiz.id and qq.id = new.question_id
    where a.id = new.attempt_id;
  if not found then raise exception 'Question does not belong to submitted attempt'; end if;
  select coalesce(jsonb_agg(option_text order by option_index), '[]'::jsonb) into options
    from public.quiz_options where question_id = new.question_id;
  if q.question_type = 'mcq' then
    select o.option_text into expected from public.quiz_answer_keys k
      join public.quiz_options o on o.question_id = k.question_id and o.option_index = k.correct_option_index
      where k.question_id = new.question_id;
  else
    select model_answer into expected from public.quiz_answer_rubrics where question_id = new.question_id;
  end if;
  new.review_version := gen_random_uuid();
  new.review_snapshot := jsonb_build_object('quizId', q.quiz_id, 'questionId', q.id,
    'question', q.stem, 'questionType', q.question_type, 'options', options, 'expectedAnswer', expected,
    'scope', jsonb_build_object('board', q.board_code, 'classLevel', q.class_level,
      'subject', q.subject_code, 'chapterNo', q.chapter_no, 'sourceType', 'textbook'),
    'selectedIndex', new.selected_option_index, 'answerText', new.answer_text,
    'pointsAwarded', new.points_awarded, 'pointsPossible', new.points_possible,
    'gradingState', new.grading_state, 'correct', new.is_correct);
  return new;
end $$;
revoke all on function public.capture_quiz_review_snapshot() from public, anon, authenticated;
grant execute on function public.capture_quiz_review_snapshot() to service_role;
create trigger quiz_review_snapshot before insert or update on public.quiz_attempt_answers
  for each row execute function public.capture_quiz_review_snapshot();

-- No explanation cache: these rows retain only coordination metadata. An authorized duplicate
-- gets a retry response, never a personalized result from another request or another student.
create table public.quiz_explanation_leases (
  key text primary key check (key ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references public.users(id) on delete cascade,
  token uuid not null,
  active_until timestamptz not null,
  retry_until timestamptz not null
);
alter table public.quiz_explanation_leases enable row level security;
revoke all on public.quiz_explanation_leases from public, anon, authenticated;
grant all on public.quiz_explanation_leases to service_role;

create function public.claim_quiz_explanation(p_key text, p_user uuid, p_token uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare wait_until timestamptz;
begin
  -- Serialize the tiny lease transaction, not provider work. Limits hold across replicas.
  perform pg_advisory_xact_lock(22822, 1);
  delete from public.quiz_explanation_leases where retry_until < now() - interval '1 day';
  select retry_until into wait_until from public.quiz_explanation_leases where key = p_key;
  if wait_until > now() then return greatest(1, ceil(extract(epoch from wait_until - now()))::int); end if;
  if exists (select 1 from public.quiz_explanation_leases where user_id = p_user and active_until > now())
    or (select count(*) from public.quiz_explanation_leases where active_until > now()) >= 4 then return 120; end if;
  insert into public.quiz_explanation_leases(key, user_id, token, active_until, retry_until)
    values(p_key, p_user, p_token, now() + interval '150 seconds', now() + interval '150 seconds')
    on conflict(key) do update set user_id = excluded.user_id, token = excluded.token,
      active_until = excluded.active_until, retry_until = excluded.retry_until;
  return 0;
end $$;
revoke all on function public.claim_quiz_explanation(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_quiz_explanation(text, uuid, uuid) to service_role;

create function public.finish_quiz_explanation(p_key text, p_token uuid, p_success boolean)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.quiz_explanation_leases set active_until = now(),
    retry_until = now() + case when p_success then interval '5 minutes' else interval '60 seconds' end
    where key = p_key and token = p_token;
$$;
revoke all on function public.finish_quiz_explanation(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.finish_quiz_explanation(text, uuid, boolean) to service_role;
