# Project status — what is real and what is a stub

## In-app notifications (M15) — 2026-10-21

Implemented the shared header bell/preview, sidebar entry, and `/notifications` inbox with
read/unread/archive/restore, selected-item bulk actions, undo, All/Unread/Archived views,
category/title filters, mark-all-read, pagination, and persisted category/popup preferences.
New unread receipts show dismissible bottom-right popups while the app is open. The initial
backlog is suppressed, read/archive changes do not replay receipts, and source event time is
kept separate from receipt time. Archive remains accessible with categories disabled; restoring
preserves read status and original expiry. Filtered views retain their cards during passive polling.
Events are
deterministically derived from owned saved exam plans and completed quiz attempts in the current
curriculum scope. Exam reminders use Asia/Karachi calendar days. No model or delivery provider
is called, and the planner's scheduling algorithm and mastery computation are unchanged.

Migrations `0019_notifications.sql` and `0020_notification_popups.sql` were applied to the
separate local recovery database only.
The self-rolling-back `supabase/tests/002_notifications.sql` passed ownership/RLS, write-grant,
deduplication, read/archive/receipt-time preservation, popup defaults, and cascade checks.
The repeatable `npm run test:notifications:e2e` script passed against real local auth: eleven
saved plans exercised pagination and deduplication; read/unread/archive/restore, disabled-category
archive access, bulk actions, search/category filters, strict input validation, unknown ids,
preferences, and actual plan/quiz destination routes passed. The computed plan was identical before and after notification
actions; the inactivity-cookie value stayed unchanged across passive notification requests.

`npm run test:notifications` passes fifteen cases, covering calendar boundaries, event keys,
curriculum filtering, category preferences, source immutability, validation, owner-filtered
actions, archive restore, bounded bulk requests, popup backlog/deduplication/preference rules,
and actionable client errors. Lint and production build passed. Playwright exercised archive,
restore and undo, bulk archive/restore, search/category filters, pagination, desktop/360px
layouts, both themes, bell/Escape, mobile sidebar/View all, preference persistence across reload,
offline/retry, actual popup arrival and placement, dismiss preserving unread state, popup Open
marking read and opening the specific plan, and the saved quiz-result page. Popup/API fixtures
are removed after testing; the ignored browser screenshots are under `output/playwright/`.
Local browser logs include pre-existing unavailable `/_vercel/*` telemetry assets, the expected
offline-test request error, and resource-limited prefetch failures for Chat/Doubts on this machine.

The delivery phases and rollout prerequisites are in [notifications-plan.md](notifications-plan.md).
This release syncs every 15 seconds while visible, on navigation/focus, and after successful
saved-plan or persisted-quiz actions. It has no closed-browser delivery, email, push,
Realtime subscription or scheduled worker. Expired rows are hidden; physical cleanup is deferred.
The hosted migration has **not** been applied, and this feature is not reported as deployed there.


## Presentation source review — 2026-10-11

The [hackathon technical guide](hackathon-technical-guide.md) maps the current code to the
presentation, demo, and judge questions. This review did not rerun live services. Older rows below
are historical in places: current source includes general streaming Chat, Chat transcription,
password/account-deletion routes, quiz drafts, dashboard statistics, mastery, and computed exam
plans. Code presence is not a new live verification of those flows. General Chat does not use
the grounded Doubts retrieval/gate/citation pipeline. The old evaluation route/question set and
`npm run eval` script are absent; no new retrieval-accuracy result is reported by this review.

## Teammate checkout audit — 2026-10-09

The checkout at `C:\Users\TAHA SOHAIL\Desktop\My_Projects\SabaqAI` is on
`docs/vscode-local-recovery-handoff`. The recovery setup prompt has been read. The requested
Google OAuth secret is saved in the ignored `.recovery/local-stack/.env`; this file did not
previously exist, so there was no old assignment to comment out. Node 24, npm, WSL 2, and Docker
Desktop are installed. The copied Desktop backup is restored in the separate local project
`sabaq-ai-taha-local`: 8,594 chunks and embeddings, 494 chapters, 8,491 sections, and all 24
original Auth users. One local test account was added; its credentials are in the ignored
`.recovery/demo-login.json`. All six local services are running, and `.env.local` points only
to `127.0.0.1:54321`, preserving the existing Jina/Gemini settings. The original backup and
hosted project were not modified. App login/session checks passed. A Physics 10 Ohm's law
question returned two citations matching stored rows (top score 0.622); an off-syllabus cooking
question refused (HTTP 200). No keyword fallback warning appeared.

All 498 source records now have local PDF bytes: 377 textbook chapter excerpts from 33
checksum-matched books, plus 121 past/model papers. The papers include 115 checksum-matched
originals, five upright 2024 subject excerpts from checksum-matched FBISE bundles, and the
documented legacy Chemistry model duplicate using the verified 2025 source. Five previously
null Storage paths were filled locally. Uploads were downloaded and hash-checked; PDF page
counts and rendered samples were checked. Scanned pages using CCITT/JBIG2 were converted to
JPEG-based copies for reader compatibility. This checkout has not been tested in an interactive
browser. OCR text and embeddings were unchanged; avatar bytes are still missing.

Actual Storage GET probes passed for all 498 records. The live `/api/ask/options` endpoint
returned all 498 PDF links across 34 curriculum scopes. Storage listings and HEAD responses
can report metadata even for missing files, so this route now probes a small PDF byte range
in recovery mode before offering links. Authenticated dashboard, doubts, and syllabus pages
returned HTTP 200. A generated Physics 10 quiz withheld answers before submission, graded
successfully, and saved its attempt in quiz history. Database counts remain 8,594 chunks,
494 chapters, and 8,491 sections. Recovery reports and source files are retained in ignored
`.recovery/obtained/` and `.recovery/prepared/`.
Start/stop helpers are in ignored `.recovery/start-local.cmd` and `.recovery/stop-local.cmd`.
Google's authorization redirect uses the configured callback, but interactive Google login
has not been tested here. `npm.cmd run lint` and `npm.cmd run build` passed. The first build
ran out of memory with Docker and the dev server running; retrying with them temporarily
stopped passed. The recovery results below describe the original recovery laptop, not this
checkout.

## Local disaster recovery snapshot — 2026-10-09

The D: drive PostgreSQL backup has been restored into a **separate local Supabase stack** on
`127.0.0.1:54321`; the hosted project and original backup were not changed. The local database
contains 8,594 content chunks, each with content and a 1,024-dimensional embedding, 494
chapters, 8,491 sections, 24 restored auth users, 41 restored quizzes, and 12 restored quiz
attempts. A separate local demo user and smoke-test quizzes/attempts were added after restore.
The app's `.env.local` points at the local stack. Retrieval, an on-syllabus answer with a
stored-row citation, an off-syllabus refusal, email/password login, quiz generation, grading,
and quiz history were exercised through the local app. `npm run lint` and `npm run build` pass.

The backup included Storage bucket and object metadata but **not the PDF or avatar file bytes**.
All 33 original textbook PDFs were downloaded and checked against their saved crawl SHA-256
checksums; 377 standalone chapter PDFs were uploaded to local Storage. The live options API
returns PDF URLs for all 377 textbook units. All 121 past-paper and model-paper rows now also
have verified local PDF links: 115 originals matched saved crawl checksums, five upright 2024
subject excerpts came from checksum-matched FBISE bundles, and one legacy duplicate Chemistry
model row uses the same verified 2025 source. The five previously null paper Storage paths were
filled locally; OCR and embeddings were unchanged. `SOURCE_PDF_BYTES_AVAILABLE=false` makes the
options API check which Storage objects exist before offering a PDF. Avatars are still missing.
All 28 2022 past papers now point to separate JPEG-based readable copies after a browser check
found that PDF.js painted a blank page from the original Class 9 CCITT-scanned PDF. The original
2022 PDF objects remain in local Storage; readable copies were browser-rendered across Classes
9–12. OCR and embeddings were unchanged.
The local Google OAuth client ID and user-provided secret are
configured, its authorization redirect was checked, and the user confirmed Google login works.
See
[local-recovery.md](local-recovery.md) for exact startup and remaining steps.

The historical status below records the earlier hosted project state; the local recovery
snapshot above describes the restored textbook PDFs and Google login.

**This is the most important doc in the repo for the next seven days.** The README describes the
target system. This file describes the system that actually exists today. Keep it honest, and
update it the moment a row changes — four people guessing at each other's progress is how a
hackathon week gets lost.

Legend: **Real** = works against live data · **Stub** = returns hardcoded or fake data ·
**Missing** = not implemented.

---

## Subsystems

| Subsystem | Status | Owner | Where |
| --- | --- | --- | --- |
| Database schema + RLS | **Real** ✅ v2 verified live (22/22 torture tests) | Dev C | `supabase/migrations/0001_init.sql` |
| Confidence guardrail | **Real** | Dev A | `src/lib/ai/guardrail.ts` |
| Citation validator | **Real** | Dev A | `src/lib/ai/citation.ts` |
| Eval scoring loop | **Removed** — replaced by the real Progress & Mastery module (`/dashboard/progress`, `/api/dashboard/progress`), computed from actual quiz attempts instead of a synthetic question set | Dev D | — |
| Grounded generation (Gemini) | **Real** ✅ fixed | Dev A | `src/lib/ai/generation.ts` |
| Nearest chapters | **Real** ✅ fixed | Dev A | `src/lib/ai/retrieval.ts` |
| Recursive chunker | **Real** ✅ new, tested | Dev C | `src/lib/ingest/chunker.ts` |
| Quiz citation validation | **Real** ✅ fixed | Dev B | `src/app/api/quiz/route.ts` |
| Quiz answer-key protection | **Real** ✅ new, tested | Dev B | `src/lib/quiz/answer-key.ts` |
| Server-side quiz grading | **Real** ✅ new | Dev B | `src/app/api/quiz/grade/` |
| UI metrics honesty | **Real** ✅ fixed | Dev D | `src/app/(app)/*/page.tsx` |
| App shell (sidebar/topbar/routed pages) | **Real** ✅ new | Dev D | `src/app/(app)/layout.tsx`, `src/components/app/` |
| Student dashboard (M8) | **Frontend only** — empty-state widgets, no invented numbers | Dev D | `src/app/(app)/dashboard/page.tsx` |
| Settings (M13) | **Partly real** — theme/scope/logout real; password/delete disabled | Dev D | `src/app/(app)/settings/page.tsx` |
| Eval set (single source) | **Removed** — `src/lib/evaluation/` no longer exists (see Eval scoring loop row) | Dev D | — |
| Near-miss evaluation | **Removed**, same commit | Dev D | — |
| Vector search RPC | **Real** ✅ v2 verified live | Dev C | `supabase/migrations/0002_*.sql` |
| Atomic ingestion RPC | **Real** ✅ verified live (atomicity + idempotency proven) | Dev C | `supabase/migrations/0003_*.sql` |
| Schema torture tests | **Real** ✅ verified (22/22 green against live DB) | Dev C | `supabase/tests/001_schema_torture.sql` |
| Retrieval (pgvector path) | **Real** ✅ verified live — real embedding-similarity scores against real ingested content across all 8 SSC textbooks (0.6-0.77 for on-syllabus questions, 0.3-0.4 for off-syllabus) | Dev A | `src/lib/ai/retrieval.ts` |
| Embeddings (Jina AI; provider-agnostic client) | **Real** ✅ verified live (1024-dim probe passed) | Dev D | `src/lib/ai/embeddings.ts` |
| Ingestion pipeline | **Real** ✅ v2 (transactional RPC), verified live — the crawler's ingest-adapter path (`ingestDocument`) has written real content for all 8 SSC textbooks plus past papers/marking schemes/model papers | Dev C | `scripts/ingest.ts`, `src/lib/crawler/ingest-adapter.ts` |
| `qa_log` writes | **Real** ✅ v2 junction rows, verified via live `/api/ask` calls this session | Dev A | `src/lib/qa-log.ts` |
| `student_profiles` creation | **Real** ✅ v2 (+ student_subjects), verified via throwaway test accounts created/deleted this session | Dev B | `src/app/api/auth/signup/` |
| Onboarding (real board/class/subjects) | **Real** ✅ new, verified against live Supabase sessions this session | Dev D | `src/app/onboarding/`, `src/app/api/auth/onboarding/` |
| Syllabus browser / Explorer | **Real** ✅ rebuilt — library layout: subject rail + Recent list (localStorage) + source-type segmented control + unit list (no question box) + continuous-scroll source-PDF reader (`SyllabusPdfReader`) with zoom, fullscreen modal, prev/next chapter; fed by `/api/ask/options`. `/api/syllabus` unchanged, still used only by `/quiz`. | Dev C | `src/app/(app)/syllabus/page.tsx`, `src/components/app/SyllabusPdfReader.tsx` |
| Syllabus corpus | **Stub** (10 hardcoded, dev only) | Dev C | `src/lib/syllabus-data.ts` |
| FBISE Syllabus Crawler | **Real** ✅ fully redesigned and verified live — thin orchestrator (`scripts/crawl.ts`) over single-responsibility modules under `src/lib/crawler/` (manifest loading, fetch, OCR, ToC/chapter/paper-boundary detection, noise filtering, PDF rebuild, ingest adapter). Manifest is `data/crawl-manifest/*.json` (Zod-validated; the old `data/crawl-sources.json` is kept only as a round-trip reference for `manifest-lint.ts`, no longer read by the crawler itself) | — | `scripts/crawl.ts`, `src/lib/crawler/`, `data/crawl-manifest/`, `.github/workflows/weekly-crawl.yml` |
| Quiz persistence | **Real** ✅ — `/api/quiz/grade` persists quiz + attempt on submit only | Dev B | `src/lib/quiz/persist.ts` |
| Quiz history + solved-paper view | **Real** ✅ new — `/quiz/history` (+ `[id]` detail): lists completed attempts (DB) **and** in-progress quizzes (client draft registry), replays the graded paper with a computed results summary (`src/lib/quiz/feedback.ts`); not in the sidebar, reached from a button on `/quiz` | — | `src/app/api/quiz/history/`, `src/app/(app)/quiz/history/` |
| Resumable in-progress quizzes | **Real** ✅ DB-backed — `quiz_drafts` table (migration 0015). `/api/quiz` parks the quiz on generation for logged-in users + returns `draftId`; `GET /api/quiz/drafts`, `GET/PATCH/DELETE /api/quiz/drafts/[id]`. `/quiz` autosaves answers (debounced), resume via `/quiz?draft=<id>&subject=&chapterNo=`. Survive logout **and device change**. Deleted on submit (`/api/quiz/grade` `draftId`). Client `src/lib/quiz/drafts-api.ts` (localStorage module removed). | — | `supabase/migrations/0015_quiz_drafts.sql`, `src/app/api/quiz/drafts/`, `src/lib/quiz/drafts-api.ts` |
| Quiz resume affordance | **Real** ✅ new — visible "Picked up your last quiz" banner + jump-to-first-unanswered on `/quiz` | — | `src/app/(app)/quiz/page.tsx` |
| Plan "Practice quiz" button | **Fixed** ✅ — the day-timeline drag-scroll captured the pointer on mousedown, swallowing link clicks; now only captures past a 5px drag threshold. The deep link also auto-generates (or resumes an existing draft) on arrival. | — | `src/app/(app)/dashboard/plan/page.tsx` |
| Plan-scoped quiz history | **Real** ✅ new — plan detail page "Quizzes for this plan": in-progress drafts (client, this device) with Resume/Discard, plus graded attempts on in-range chapters since the plan was created (`quizAttempts` on `/api/dashboard/plan/[id]`, attributed by scope, no schema change). Graded rows link to the shared solved-paper view. | — | `src/app/api/dashboard/plan/[id]/route.ts`, `src/app/(app)/dashboard/plan/page.tsx` |
| Auth (signup/login) | **Real**, with demo bypass | Dev B | `src/app/api/auth/*` |
| Urdu voice input (STT) | **Missing** | Dev B | planned Day 5 |

**Update (crawler redesign, 2026-09-04/05): the corpus is real now.** All 8 SSC textbooks (Physics,
Chemistry, Biology, Mathematics × Class 9 and 10) are ingested with real per-chapter PDFs, plus
past papers, marking schemes, and model papers across classes 9-12 for the subjects FBISE publishes
them for. `select count(*) from content_chunks` returns real rows; `/api/ask` returns real embedding
similarity scores (0.6-0.77 for genuinely on-syllabus questions, 0.3-0.4 for off-syllabus, verified
across all 8 textbook subject/class combinations plus a live off-syllabus refusal check). The
"nothing has run against a real service" state described below is history, not current status —
kept for context on how the RLS/search_path bugs below were actually found.

---

## Fixed

**✅ RPC functions hardened after live torture testing (0004, 0005).** The first run of
`supabase/tests/001_schema_torture.sql` against the live project caught two real defects:
(1) `revoke ... from anon/authenticated` was not enough to make the RPCs service-role only —
Postgres grants EXECUTE on new functions to PUBLIC by default and every role inherits it, so
`has_function_privilege('anon', ...)` returned true until 0004 revoked from PUBLIC. (2) pgvector
is installed in the `extensions` schema, but `ingest_document` pinned `search_path = public`
and `match_content_chunks` pinned nothing — so `vector`/`<=>` failed to resolve inside the
functions (and would have failed for service_role via PostgREST, whose search_path is `public`
only: a production outage disguised as a test failure). 0005 pins `search_path = public,
extensions` on both. The suite then went 22/22 green.

**✅ Schema v2 — BCNF-normalised, approved in `docs/schema-proposal.md`.** The v1 schema never
ran anywhere, so it was replaced in place rather than migrated. Arrays and JSONB repeating groups
are gone (`student_profiles.subjects text[]` → `student_subjects`; `qa_log` chunk-id arrays →
`qa_log_chunks` with per-chunk rank and score; quiz `options jsonb` → `quiz_options`; attempt
`answers jsonb` → `quiz_attempt_answers`). Chapter/section metadata is factored out of
`content_chunks` into `chapters` → `chapter_sources` → `sections`. Every enumerated domain is a
reference table. Quiz answers moved to `quiz_answer_keys`, which has **no** client RLS policy —
deny by default, service role only. Ingestion writes go through the `ingest_document` RPC, one
transaction per document. `/api/syllabus` reads the `content_chunks_expanded` view. The migrations
have now executed against a live Supabase project, and both RPCs were exercised by the torture
suite (22/22 green) — what remains unexercised is the app calling them with real embeddings.

**✅ `getNearestChapters()` now computes from real scores.** Takes the retrieved chunks, keeps the
best score per chapter, sorts, returns the top three. Returns an empty array when retrieval found
nothing, rather than inventing suggestions. This was the demo-breaking one.

**✅ Generation no longer fabricates.** The old fallback sliced the top chunk into sentences and
returned `answerable: true` — a paragraph dump that never read the question, rendered as a real
cited answer. It now returns `answerable: false`, which flows through `validateCitations` into an
honest refusal. **Consequence:** with no `GEMINI_API_KEY`, every question refuses. That is correct.

**✅ Quiz discards invalid citations instead of reassigning them.** A question citing an unknown
chunk id is dropped and logged, and the response reports a `discarded` count. Previously it was
silently re-pointed at `matchingChunks[0]`, giving hallucinated questions real provenance.

**✅ Quiz fallback is labelled honestly.** `note` now says "Fallback question bank — live
generation unavailable", with `isFallback: true`. It no longer calls itself "Verified".

**✅ UI metrics are computed.** The hardcoded "100% safe refusal" and "Off-syllabus answered: 0"
strings are gone; the cards derive from `/api/eval` and turn amber/red when the numbers are bad.
The hardcoded threshold prose was replaced with a description that can't drift.

**✅ Recursive chunking + real ingestion.** `src/lib/ingest/chunker.ts` splits on paragraph → line →
sentence → word → character boundaries, per section so chunks never cross a chapter. Deduplicated by
content hash. `scripts/ingest.ts` now actually chunks, embeds via Qwen, and writes to Supabase,
idempotently. Verified against synthetic input; **not yet run against real content or a real key.**

**✅ Retrieval now queries pgvector.** `retrieve()` embeds the question once and calls the
`match_content_chunks` RPC using the service-role client. Chunk vectors come from ingestion, so the
old eleven-API-calls-per-question problem is gone. Vector search errors now **throw** rather than
returning `[]` — an empty result was indistinguishable from "nothing matched", which meant a broken
database silently masqueraded as a working guardrail.

**✅ Quiz answers no longer reach the browser.** `/api/quiz` returns questions without
`correctIndex` or `explanation`, plus an AES-256-GCM encrypted `answerToken`. `/api/quiz/grade`
decrypts it and grades server-side. Verified: the token cannot be decoded, tampered with, or
replayed under a different secret.

**✅ Eval set consolidated.** One source of truth in `src/lib/evaluation/questions.ts`; the route
and the CLI both call `runEvaluation()`. It previously existed in three places with different
questions and different field names.

**✅ `qa_log` and `student_profiles` are written.** Logging never throws into a request.

## Still stubbed or missing

**1. The local corpus fallback is still there, by design.** Without Supabase credentials,
retrieval keyword-ranks the ten hardcoded chunks so the frontend is workable offline. It logs a
`[retrieval]` warning. Scores from that path are **not** embedding similarity — never calibrate
against them or quote them. (Confirmed absent from every live verification this session — the
`[retrieval]` fallback warning never appeared once real Supabase credentials + real content were
in place.)

**2. Near-miss evaluation tooling was removed** (see the Eval rows above), so there is no
automated near-miss-leakage regression check any more — the Progress & Mastery module replaced it
for user-facing metrics, but nothing currently re-runs a synthetic near-miss set against the live
corpus. If that class of check is wanted again, it needs rebuilding from scratch, not resurrecting
the deleted `src/lib/evaluation/`.

**3. Quiz results are persisted now** (see Quiz persistence / Quiz history rows above) —
this item from the original list is resolved, not stubbed.

**4. Urdu voice input is not built.**

---

## Traps

**~~Embedding dimensions do not match~~ — RESOLVED.** The embedding provider is Jina AI
`jina-embeddings-v3` (native 1024-dim), matching `vector(1024)` exactly. Verified against the live
API with `node scripts/verify-embeddings.mjs` (returned 1024 dims). The client is provider-agnostic
— DashScope/Qwen remains a drop-in env-var alternative, but switching models after ingestion means
re-embedding everything.

**RLS will silently refuse every question.** The `chunks_match_profile` policy requires a matching
`student_profiles` + `student_subjects` row, which signup now creates (unverified against a live
project). Point retrieval at Supabase with the anon key and every query returns zero rows → the
guardrail returns REFUSE → the app refuses everything, with no error anywhere to tell you why.

*Resolution:* run retrieval server-side with `service_role` and keep the explicit board/class/
subject filter already in the code. Keep RLS on for `qa_log`, `quizzes`, and `quiz_attempts`.

---

## Definition of done for the week

The demo is safe to run in front of judges when all of these are true:

- [x] `select count(*) from content_chunks` returns real ingested rows
- [x] Retrieval queries Supabase, not `INITIAL_SYLLABUS_CHUNKS`
- [x] A refusal shows chapters genuinely nearest to the asked question
- [x] One embedding call per question, not eleven
- [x] No metric anywhere in the UI is a hardcoded string
- [x] Gemini failure produces an honest refusal, never a fabricated answer
- [x] Quiz discards questions whose citation doesn't validate
- [ ] Thresholds calibrated against real score distributions on real content — informally
      confirmed (on-syllabus 0.6-0.77 vs. off-syllabus 0.3-0.4 across all 8 SSC textbooks), but
      no formal recalibration pass has been run since the near-miss eval tooling was removed
- [ ] The whole flow works on a phone, on conference wifi — not verified this session
