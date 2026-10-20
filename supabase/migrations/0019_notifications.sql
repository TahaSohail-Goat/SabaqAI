-- In-app inbox only: notifications reflect saved plans/attempts and never modify them.
begin;
create table if not exists notification_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  exam_reminders boolean not null default true,
  plan_updates boolean not null default true,
  quiz_results boolean not null default true
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_key text not null,
  kind text not null check (kind in ('exam_reminder', 'plan_created', 'quiz_completed')),
  board_code text not null references boards(board_code),
  class_level smallint not null references class_levels(class_level),
  subject_code text not null references subjects(subject_code),
  plan_id uuid references exam_plans(id) on delete cascade,
  attempt_id uuid references quiz_attempts(id) on delete cascade,
  title text not null,
  body text not null,
  href text not null check (href like '/dashboard/plan?plan=%' or href like '/quiz/history/%'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  read_at timestamptz,
  archived_at timestamptz,
  unique (user_id, event_key),
  check (
    (kind in ('exam_reminder', 'plan_created') and plan_id is not null and attempt_id is null)
    or (kind = 'quiz_completed' and attempt_id is not null and plan_id is null)
  )
);

create index if not exists notifications_inbox_idx
  on notifications (user_id, board_code, class_level, created_at desc, id desc)
  where archived_at is null;
create index if not exists notifications_unread_idx
  on notifications (user_id) where read_at is null and archived_at is null;

alter table notifications enable row level security;
alter table notification_preferences enable row level security;
create policy notifications_read_own on notifications
  for select to authenticated using (user_id = auth.uid());
create policy notification_preferences_read_own on notification_preferences
  for select to authenticated using (user_id = auth.uid());

-- Clients may read their own inbox; only authenticated, owner-filtered server routes write it.
revoke all on notifications, notification_preferences from public, anon, authenticated;
grant select on notifications, notification_preferences to authenticated;
grant all on notifications, notification_preferences to service_role;
commit;
