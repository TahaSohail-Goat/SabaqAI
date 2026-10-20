-- Self-rolling-back isolation/integrity checks. Run after migration 0019.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000001901', 'notifications-test-a@example.invalid'),
  ('00000000-0000-4000-8000-000000001902', 'notifications-test-b@example.invalid');
insert into public.users (id) values
  ('00000000-0000-4000-8000-000000001901'), ('00000000-0000-4000-8000-000000001902')
  on conflict do nothing;
insert into exam_plans (id, user_id, board_code, class_level, subject_code, from_chapter_no, to_chapter_no, exam_date)
values
  ('00000000-0000-4000-8000-000000001911', '00000000-0000-4000-8000-000000001901', 'FBISE', 10, 'physics', 1, 2, current_date + 7),
  ('00000000-0000-4000-8000-000000001912', '00000000-0000-4000-8000-000000001902', 'FBISE', 10, 'physics', 1, 2, current_date + 7);
insert into notifications (user_id, event_key, kind, board_code, class_level, subject_code, plan_id, title, body, href, expires_at)
select user_id, 'test:' || id, 'plan_created', board_code, class_level, subject_code, id,
  'Saved plan', 'Test only', '/dashboard/plan?plan=' || id, now() + interval '1 day'
from exam_plans where id in ('00000000-0000-4000-8000-000000001911', '00000000-0000-4000-8000-000000001912');
insert into notification_preferences (user_id, quiz_results) values
  ('00000000-0000-4000-8000-000000001901', false), ('00000000-0000-4000-8000-000000001902', true);

do $$ begin
  if has_table_privilege('anon', 'notifications', 'select') then raise exception 'Anonymous inbox access'; end if;
  if has_table_privilege('authenticated', 'notifications', 'insert,update,delete') then raise exception 'Client notification write access'; end if;
  if has_table_privilege('authenticated', 'notification_preferences', 'insert,update,delete') then raise exception 'Client preferences write access'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001901', true);
do $$ begin
  if (select count(*) from notifications) <> 1 then raise exception 'Inbox RLS isolation failed'; end if;
  if exists (select 1 from notifications where user_id <> auth.uid()) then raise exception 'Foreign notification visible'; end if;
  if (select count(*) from notification_preferences) <> 1 then raise exception 'Preferences RLS isolation failed'; end if;
  if (select quiz_results from notification_preferences) then raise exception 'Wrong preferences owner'; end if;
end $$;
reset role;

update notifications set read_at = now(), archived_at = now()
where user_id = '00000000-0000-4000-8000-000000001901';
insert into notifications (user_id, event_key, kind, board_code, class_level, subject_code, plan_id, title, body, href, expires_at)
select user_id, 'test:' || id, 'plan_created', board_code, class_level, subject_code, id,
  'Saved plan', 'Repeated event', '/dashboard/plan?plan=' || id, now() + interval '1 day'
from exam_plans where id = '00000000-0000-4000-8000-000000001911'
on conflict (user_id, event_key) do nothing;
do $$ begin
  if (select count(*) from notifications where user_id = '00000000-0000-4000-8000-000000001901') <> 1 then raise exception 'Duplicate event created'; end if;
  if exists (select 1 from notifications where user_id = '00000000-0000-4000-8000-000000001901' and (read_at is null or archived_at is null)) then raise exception 'Duplicate sync reset read/archive'; end if;
end $$;

delete from exam_plans where id = '00000000-0000-4000-8000-000000001911';
do $$ begin
  if exists (select 1 from notifications where plan_id = '00000000-0000-4000-8000-000000001911') then raise exception 'Deleted plan left a dead notification'; end if;
end $$;
delete from public.users where id = '00000000-0000-4000-8000-000000001902';
do $$ begin
  if exists (select 1 from notifications where user_id = '00000000-0000-4000-8000-000000001902') then raise exception 'User cascade failed'; end if;
  if exists (select 1 from notification_preferences where user_id = '00000000-0000-4000-8000-000000001902') then raise exception 'Preferences cascade failed'; end if;
end $$;
select 'Notification isolation, permissions, deduplication, state preservation and cascades passed' as result;
rollback;
