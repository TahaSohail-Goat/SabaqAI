begin;

-- Keep a tombstone/event key so repeated syncs never resurrect a deleted notification.
alter table public.notifications add column deleted_at timestamptz;
drop policy notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications
  for select to authenticated using (user_id = auth.uid() and deleted_at is null);

commit;
