-- Usernames must be unique, case-insensitively — "tahasohail" and "TahaSohail" are the
-- same handle. Enforced at the database level (not just checked in the API) so a race
-- between two signups can't both win. Partial index excludes '' so the empty-string
-- default on pre-existing rows (created before this feature) never collides with itself.
--
-- Once an account is deleted, its row is gone and the index no longer blocks that name —
-- no separate "release the username" step is needed.
create unique index if not exists users_display_name_lower_unique
  on users (lower(display_name))
  where display_name <> '';
