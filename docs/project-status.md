# Project status — what is real and what is a stub

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
| Eval scoring loop | **Real** | Dev D | `src/app/api/eval/route.ts` |
| Grounded generation (Gemini) | **Real** ✅ fixed | Dev A | `src/lib/ai/generation.ts` |
| Nearest chapters | **Real** ✅ fixed | Dev A | `src/lib/ai/retrieval.ts` |
| Recursive chunker | **Real** ✅ new, tested | Dev C | `src/lib/ingest/chunker.ts` |
| Quiz citation validation | **Real** ✅ fixed | Dev B | `src/app/api/quiz/route.ts` |
| Quiz answer-key protection | **Real** ✅ new, tested | Dev B | `src/lib/quiz/answer-key.ts` |
| Server-side quiz grading | **Real** ✅ new | Dev B | `src/app/api/quiz/grade/` |
| UI metrics honesty | **Real** ✅ fixed | Dev D | `src/app/page.tsx` |
| Eval set (single source) | **Real** ✅ fixed | Dev D | `src/lib/evaluation/` |
| Near-miss evaluation | **Real** ✅ new | Dev D | `src/lib/evaluation/questions.ts` |
| Vector search RPC | **Real** ✅ v2 verified live | Dev C | `supabase/migrations/0002_*.sql` |
| Atomic ingestion RPC | **Real** ✅ verified live (atomicity + idempotency proven) | Dev C | `supabase/migrations/0003_*.sql` |
| Schema torture tests | **Real** ✅ verified (22/22 green against live DB) | Dev C | `supabase/tests/001_schema_torture.sql` |
| Retrieval (pgvector path) | **Real** ✅ new, **unverified** | Dev A | `src/lib/ai/retrieval.ts` |
| Embeddings (Jina AI; provider-agnostic client) | **Real** ✅ verified live (1024-dim probe passed) | Dev D | `src/lib/ai/embeddings.ts` |
| Ingestion pipeline | **Real** ✅ v2 (transactional RPC), **unverified** | Dev C | `scripts/ingest.ts` |
| `qa_log` writes | **Real** ✅ v2 junction rows, **unverified** | Dev A | `src/lib/qa-log.ts` |
| `student_profiles` creation | **Real** ✅ v2 (+ student_subjects), **unverified** | Dev B | `src/app/api/auth/signup/` |
| Syllabus browser | **Real** ✅ new, **unverified** | Dev C | `src/app/api/syllabus/` |
| Syllabus corpus | **Stub** (10 hardcoded, dev only) | Dev C | `src/lib/syllabus-data.ts` |
| Quiz persistence | **Missing** | Dev B | tables exist, unused |
| Auth (signup/login) | **Real**, with demo bypass | Dev B | `src/app/api/auth/*` |
| Urdu voice input (STT) | **Missing** | Dev B | planned Day 5 |

**"Unverified" means it has never run once against a real service.** A Supabase project is now
connected (the v2 migrations have executed; `/api/syllabus` reads the live — empty — database;
the schema and both RPCs passed a 22-assertion torture suite with synthetic vectors, and the Jina
embedding key returned a verified 1024-dim vector), but nobody has supplied source documents, so no
real content has ever been embedded or stored. Do not report the retrieval path as working until
`npm run ingest` has actually stored rows and a question has come back with a real embedding score.

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

**1. Nothing has run against a real service.** See the note above the table. This is the top
priority — provision, ingest, verify, then recalibrate.

**2. The local corpus fallback is still there, by design.** Without Supabase credentials,
retrieval keyword-ranks the ten hardcoded chunks so the frontend is workable offline. It logs a
`[retrieval]` warning. Scores from that path are **not** embedding similarity — never calibrate
against them or quote them.

**3. Near-miss leakage — measured, real, unfixed.** `nm-003` ("Derive Ohm's law from the Drude
model") scores 0.709 and is **answered**. False acceptance 11.1%, near-miss refusal 75%. The easy
off-syllabus questions reported 100% the whole time. Fix by recalibrating against the real corpus.

**4. Quiz results are not persisted.** `quizzes`, `quiz_questions`, `quiz_attempts` are unused.
Once quizzes have real ids, grading can look the key up by id and `answer-key.ts` can be deleted.

**5. Urdu voice input is not built.**

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

- [ ] `select count(*) from content_chunks` returns real ingested rows
- [ ] Retrieval queries Supabase, not `INITIAL_SYLLABUS_CHUNKS`
- [ ] A refusal shows chapters genuinely nearest to the asked question
- [ ] One embedding call per question, not eleven
- [ ] No metric anywhere in the UI is a hardcoded string
- [ ] Gemini failure produces an honest refusal, never a fabricated answer
- [ ] Quiz discards questions whose citation doesn't validate
- [ ] Thresholds calibrated against real score distributions on real content
- [ ] The whole flow works on a phone, on conference wifi
