-- Add avatar URL to the users table.
-- The column is nullable — existing rows get NULL (falls back to initials in UI).
alter table users add column if not exists avatar_url text;

-- Create the storage bucket for profile pictures if it doesn't already exist.
-- public = true so the generated public URL is directly usable in <img> tags without
-- a signed URL (avatars are intentionally non-sensitive).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Allow any authenticated user to upload/replace only their own avatar.
-- Path convention enforced by the API route: avatars/<user_id>/<filename>
create policy if not exists "Users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy if not exists "Users can update their own avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Public read — the bucket is public so this is belt-and-suspenders.
create policy if not exists "Avatars are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');
