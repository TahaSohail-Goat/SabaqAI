-- 0009_missing_subjects.sql added computer_science/islamiyat/pakistan_studies to the `subjects`
-- reference table but deliberately left student_subjects untouched, since offering them to
-- students was flagged there as a separate product decision. That decision was made afterward
-- (every new signup is now enrolled in all subjects via ALL_SUBJECT_CODES, see
-- src/lib/auth/create-account.ts) — but accounts created before both changes landed were never
-- backfilled, so they're still missing whichever subjects didn't exist yet at signup time.
-- This is a one-time catch-up: give every existing student every subject they don't already
-- have, matching what a fresh signup gets today.
insert into student_subjects (user_id, subject_code)
select sp.user_id, s.subject_code
from student_profiles sp
cross join subjects s
on conflict (user_id, subject_code) do nothing;
