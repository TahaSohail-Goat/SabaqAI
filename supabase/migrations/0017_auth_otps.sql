-- Email verification codes, moved out of process memory.
--
-- src/lib/email/otp-store.ts held these in a module-level Map, which is correct for a single
-- long-lived server and silently broken on Vercel: each serverless instance gets its own Map,
-- so a code minted while serving instance A does not exist when the verify request lands on
-- instance B. The student sees "Incorrect code" for a code that is genuinely correct, and it
-- fails intermittently rather than consistently, which is worse. This affects all three OTP
-- flows — signup (send-otp/verify-otp), password reset (forgot-password/reset-password), and
-- account deletion (delete-account/send-otp + delete-account).
--
-- Same class of bug QUIZ_SECRET already exists to prevent for quiz grading (see .env.example),
-- just applied to the other subsystem that carries cross-request state.
--
-- `key` is the already-namespaced string the app builds, so the three flows can hold three
-- independent live codes for one email without colliding:
--   "<email>"          signup
--   "reset:<email>"    password reset   (resetOtpKey)
--   "delete:<email>"   account deletion (deleteAccountOtpKey)
--
-- Codes are stored as-issued rather than hashed — same exposure the in-memory version had, and
-- bounded hard by a 2-minute TTL plus the 5-attempt cap enforced in otp-store.ts. Nothing but
-- the service-role client can read this table (see the RLS note below).
create table if not exists auth_otps (
  key        text primary key,
  code       text not null,
  expires_at timestamptz not null,
  attempts   smallint not null default 0,
  -- Doubles as the resend cooldown clock: the three send routes used to keep a separate
  -- in-memory `lastSent` Map (same multi-instance bug), and now derive "how long until another
  -- code may be requested" from this column instead. One table serves both jobs.
  created_at timestamptz not null default now()
);

-- Supports the expired-row sweep otp-store.ts runs on each write.
create index if not exists auth_otps_expires_idx on auth_otps (expires_at);

-- RLS on with NO policies, deliberately: every row is a live credential. Postgres denies all
-- access when a table has RLS enabled and no policy matches, and the service-role client
-- bypasses RLS entirely — so the server can use this table and no browser session, however
-- authenticated, can read another person's code (or their own).
alter table auth_otps enable row level security;
