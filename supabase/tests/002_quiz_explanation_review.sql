-- Run ONLY against a chosen development database after migration 0022. No providers/accounts.
-- Uses an existing student/chapter, creates assessment fixtures, and rolls them all back.
begin;
do $$
declare u uuid; c uuid; quiz uuid; other_quiz uuid; q uuid; other_q uuid; a uuid; written_q uuid; written_a uuid;
  snapshot jsonb; t1 uuid := gen_random_uuid(); t2 uuid := gen_random_uuid(); checks int := 0;
begin
  select id into u from public.users limit 1;
  select id into c from public.chapters limit 1;
  if u is null or c is null then raise exception 'Existing local user and chapter required; no account is created'; end if;
  insert into public.quizzes(user_id, chapter_id) values(u, c) returning id into quiz;
  insert into public.quiz_questions(quiz_id,position,stem) values(quiz,1,'Original submitted question') returning id into q;
  insert into public.quiz_options values(q,0,'Original wrong option'),(q,1,'Original expected option');
  insert into public.quiz_answer_keys(question_id,correct_option_index) values(q,1);
  insert into public.quiz_attempts(quiz_id,user_id,score,total,answered) values(quiz,u,0,1,1) returning id into a;
  insert into public.quiz_attempt_answers(attempt_id,question_id,selected_option_index,is_correct,points_awarded,points_possible,grading_state)
    values(a,q,0,false,0,1,'graded');
  select review_snapshot into snapshot from public.quiz_attempt_answers where attempt_id=a and question_id=q;
  if snapshot->>'question' <> 'Original submitted question' or snapshot->>'expectedAnswer' <> 'Original expected option'
    or snapshot->>'gradingState' <> 'graded' then raise exception 'Snapshot missing submission context'; end if;
  checks := checks + 1;
  update public.quiz_questions set stem='A later changed question' where id=q;
  update public.quiz_answer_keys set correct_option_index=0 where question_id=q;
  if (select review_snapshot from public.quiz_attempt_answers where attempt_id=a and question_id=q) <> snapshot then raise exception 'Live edits changed snapshot'; end if;
  checks := checks + 1;
  begin
    update public.quiz_attempt_answers set review_snapshot='{}' where attempt_id=a and question_id=q;
    raise exception 'TEST FAILED: Snapshot update was allowed';
  exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
  checks := checks + 1;
  insert into public.quizzes(user_id,chapter_id) values(u,c) returning id into other_quiz;
  insert into public.quiz_questions(quiz_id,position,stem) values(other_quiz,1,'Outside this attempt') returning id into other_q;
  begin
    insert into public.quiz_attempt_answers(attempt_id,question_id,is_correct) values(a,other_q,false);
    raise exception 'TEST FAILED: Cross-quiz question was accepted';
  exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
  checks := checks + 1;
  if public.claim_quiz_explanation(repeat('a',64),u,t1) <> 0 then raise exception 'First lease was not acquired'; end if;
  if public.claim_quiz_explanation(repeat('a',64),u,t2) <= 0 then raise exception 'Duplicate lease acquired'; end if;
  checks := checks + 2;
  if public.claim_quiz_explanation(repeat('b',64),u,t2) <= 0 then raise exception 'User concurrency bypassed'; end if;
  checks := checks + 1;
  perform public.finish_quiz_explanation(repeat('a',64),t2,true);
  if not exists(select 1 from public.quiz_explanation_leases where key=repeat('a',64) and active_until>now()) then raise exception 'Wrong token released lease'; end if;
  checks := checks + 1;
  perform public.finish_quiz_explanation(repeat('a',64),t1,true);
  if public.claim_quiz_explanation(repeat('a',64),u,t2) <> 300 then raise exception 'Successful duplicate cooldown missing'; end if;
  checks := checks + 1;
  if has_function_privilege('anon','public.claim_quiz_explanation(text,uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.finish_quiz_explanation(text,uuid,boolean)','EXECUTE')
    or has_function_privilege('anon','public.capture_quiz_review_snapshot()','EXECUTE') then raise exception 'PUBLIC/anonymous function grant leaked'; end if;
  checks := checks + 1;
  if has_table_privilege('authenticated','public.quiz_explanation_leases','SELECT')
    or not (select relrowsecurity from pg_class where oid='public.quiz_explanation_leases'::regclass) then raise exception 'Lease table access leaked'; end if;
  checks := checks + 1;
  if (select points_awarded from public.quiz_attempt_answers where attempt_id=a and question_id=q) <> 0
    or (select score from public.quiz_attempts where id=a) <> 0 then raise exception 'Review changed marks'; end if;
  checks := checks + 1;
  insert into public.quiz_questions(quiz_id,position,stem,question_type) values(quiz,2,'Written assessment','short') returning id into written_q;
  insert into public.quiz_answer_rubrics(question_id,model_answer,rubric,max_score) values(written_q,'Expected written concept','Private rubric not sent',4);
  insert into public.quiz_attempts(quiz_id,user_id,score,total,answered) values(quiz,u,1,1,1) returning id into written_a;
  insert into public.quiz_attempt_answers(attempt_id,question_id,answer_text,is_correct,points_awarded,points_possible,grading_state)
    values(written_a,written_q,'Partial written response',true,2,4,'graded');
  if not exists(select 1 from public.quiz_attempt_answers where attempt_id=written_a and question_id=written_q
    and review_snapshot->>'expectedAnswer'='Expected written concept'
    and (review_snapshot->>'pointsAwarded')::numeric=2 and not review_snapshot ? 'rubric' and review_version is not null) then raise exception 'Written snapshot/partial credit/private rubric handling failed'; end if;
  checks := checks + 1;
  raise notice 'Passed % Quiz review SQL assertions; assessment fixtures will roll back', checks;
end $$;
rollback;
