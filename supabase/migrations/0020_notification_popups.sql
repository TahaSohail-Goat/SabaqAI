begin;

alter table public.notification_preferences add column popups boolean not null default true;
-- Event time can predate delivery (for example a plan saved before the app was opened).
-- Keep receipt time separately so restoring an old message never triggers a new popup.
alter table public.notifications add column received_at timestamptz not null default now();

commit;
