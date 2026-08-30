-- The FBISE crawler (data/crawl-sources.json) covers 9 subjects, but 0001_init.sql only
-- seeded 6 — computer_science, islamiyat, and pakistan_studies were missing entirely, so every
-- document in those subjects failed ingestion outright on chapters' subject_code foreign key.
--
-- Deliberately NOT touching student_subjects/ALL_SUBJECT_CODES (src/lib/auth/create-account.ts)
-- or any of the app's subject picker UIs (signup, onboarding, settings, quiz) here — whether to
-- actually offer these 3 to students is a real product decision, not an ingestion bug. This
-- migration only unblocks the corpus from having content for them.
insert into subjects (subject_code, subject_name) values
  ('computer_science', 'Computer Science'),
  ('islamiyat', 'Islamiyat'),
  ('pakistan_studies', 'Pakistan Studies')
on conflict do nothing;
