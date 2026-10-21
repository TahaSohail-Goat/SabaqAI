# Ask/Doubts evolution: continuation record

## Feature checkpoint preparation — 2026-10-21

The user authorized a selective commit and non-force push of existing Ask work before any Quiz
integration. Verified branch `evolved/asks-doubts`, remote `origin`, no existing upstream feature
ref after fetch. Main advanced remotely; no main pull/merge/rebase is needed for this checkpoint.
Lint, all 58 offline tests and a fresh local-overlay production build passed. The build retains
the existing PDF.js Node legacy-build warning. No browser or additional provider tests were run
for this checkpoint. Literal local-secret/account and credential-pattern scans found no matches
in the selected feature files. The local PDF recovery catalog, recovery data, account/config files,
backups and unrelated user files are excluded. PDF recovery details are in PDF_RECOVERY.md.
Commit/push results are recorded in the handoff, not inferred from this preparation note.

## Original implementation record

Updated 2026-10-20. Branch `evolved/asks-doubts`, base `fe49875` after fast-forwarding main.
No commit, merge, push or deployment. Existing user files were preserved.

## Implementation

Phases 1?5 are connected in the actual `/api/ask` and `/doubts` flow: validated contracts/config,
conservative understanding, protected spans, signed owner/scope/language-bound clarification,
full-question retrieval, real stored hierarchy hydration, bounded same-section neighbors,
measured context selection, final scored gate, teaching blocks/examples, citation rebuilds,
default support review, optional one structural repair, safe errors, cancellation and limits.
No model is called after final REFUSE. Thresholds were not lowered. General Chat/quizzes unchanged.
`src/lib/types.ts`, `src/lib/ask/*`, `src/prompts/*`, `AskResultView.tsx` and Doubts page are the main paths.

Phase 6 automated checks passed: 58 offline tests, lint, production build, diff whitespace check.
CI now runs the offline suite. 44 unreviewed development/held-out scenarios are in evaluation-cases.json.
Full browser/mobile/click verification is still open: inventory was empty and creating an IAB tab failed.
SSR UI tests and actual HTTP page/API checks were run; never describe them as browser verification.

## Local Docker state

The user explicitly requested local testing and supplied `data/db_cluster-03-10-2026@10-33-39.backup.gz`.
Created isolated Supabase project `sabaq-ask-review` under ignored `.recovery/ask-stack`, official CLI
2.121.0 in `.recovery/cli`. Original `.env.local` and existing CivicPulse volumes were untouched.
Fresh bootstrap hit the existing unsupported CREATE POLICY IF NOT EXISTS statements in
0010_avatar_url.sql. Only the ignored combined migration copy had those three clauses adapted;
source migrations are unchanged. Stack started: db, kong, auth, rest, storage. Self-rolling-back
schema torture suite passed all 22 assertions before corpus restore.

Restored ONLY curriculum chapters/chapter_sources/sections/content_chunks, in one transaction with
an empty-target guard. Counts: 494 chapters, 498 sources, 8491 sections, 8594 chunks. Existing vectors
were reused; no chapter re-embedding/upload occurred. Backup SHA-256:
49cfeb7745d6918335e214fdbc2aedba9d73a68347259541fb5c2e265ad58880.
Auth/student backup tables were not restored. A separate approved local test account was created;
credentials remain only in ignored `.recovery/ask-demo-login.json`. Its profile is now FBISE/Class 10.
Original signed clarification/profile checks were also exercised while it was Class 9.

Local app is running at http://localhost:3100 with the private overlay `.recovery/ask-local.env`.
Use the parent/child start command in EVALUATION.md (direct Next --env-file inheritance fails workers).
Current app exec session: 49344. Supabase containers and restored volume are retained for review.
No browser surface is available to automate sign-in, but real HTTP login and /doubts returned 200.
Source PDFs are not restored: options correctly offer OCR readers instead of nonexistent PDF links.

## Provider approvals and actual checks

Automatic approval review initially rejected full-chapter embedding/account creation, and later
bounded restored passages to Gemini. The user explicitly approved chapter embedding/test account
and real question/evidence provider tests. The backup made full-chapter embedding unnecessary.
Do not repeat an approval request for these authorized actions. No credential/account data may be sent.

Hosted Supabase settings were stale (ENOTFOUND); local overrides resolve that testing blocker.
Real Gemini ambiguity returned clarification with one generation. Two live synthetic-evidence attempts
failed with HTTP 400/schema complexity. Simplifying only the decoder wire schema fixed it: full runtime
Zod limits remain enforced. Synthetic three-call pipeline then answered/partial in 84660ms.
Based on observed latency the default shared timeout is 110s within the route's 120s ceiling.

Actual restored DB adapter tests: six scoped seeds hydrated; wrong board excluded; actual multi-chunk
Math 9 section yielded two context neighbors with null scores. These were known stored-vector self-match
checks using loopback embeddings, NOT student-query semantic accuracy. Local reader/options endpoints
returned real source units (Physics 10 has 12 chapters), and real chapter content.

Approved real-question checks so far (see EVALUATION.md for the final consolidated record):
- Typo evaporation cooling, Physics 10 ch2: answered/sufficient, three model calls, 73658ms. Original
  preserved, normalized/retrieval question complete, four statements and book sweating example cited
  to stored page 57. Reader chunk IDs/pages/excerpts matched actual stored content.
- Ohm plus Drude derivation: final gate REFUSE, one normalization call, no explanation (22023ms).
- Football World Cup question in selected Physics ch7: final gate REFUSE, one call (26563ms).
- Actual authenticated `current ka effect`: useful heating/magnetic/chemical choices; changed chapter
  and forged option returned 400; wrong class 403. Choosing magnetic resumed without repeat ambiguity,
  preserved original wording, and honestly refused at the final evidence gate.
- Magnetic-poles explanation ch8: final low-similarity refusal (top score about .462), no explanation.
  Thresholds remain unchanged; record this false-refusal candidate rather than forcing acceptance.
- Clear Ohm with example: first attempt upstream Gemini 503 after retrieval; one recorded retry refused
  after generation/validation, without support review. Narrower cause not established in that attempt.
- Authenticated API evaporation request later timed out (HTTP 504); input/error handling remained honest.
- Extra cooling + exact molecular energy request: needs clarification (missing data), one call, 24975ms.

The final clear-question diagnostic timed out during explanation at 110017ms, two generations;
understanding took 56826ms. Optional repair was enabled only for that test and was never reached.
No output was available to narrow the earlier generation refusal. EVALUATION.md records every outcome.
Real source-reader citation IDs, page 57 and excerpt prefixes matched for the successful cooling answer.
All 8594 restored embeddings have dimension 1024.
Other live/HTTP artifacts are in ignored `.recovery/ask-live-*`, ask-http-*. No teacher review occurred.

## Commands

- `npm.cmd run lint`
- `npm.cmd run test:ask` (offline; no provider quota)
- Local production build/start parent/child commands: EVALUATION.md.
- Approved live: `node --env-file=.env.local --env-file=.recovery/ask-local.env --import tsx scripts/ask-live-smoke.ts --live --class=10 --chapter=7`
- Fully local adapter probes: `.recovery/adapter-local-check.ts`, `.recovery/adapter-neighbor-check.ts`.
- Private helpers: prepare-ask-local.ts, ask-http-review.mjs, ask-http-clarification.mjs, ask-live-cases.ts.

Local outcomes have been consolidated in EVALUATION.md and project-status.md. Final source checks:
58 offline tests, lint and local-configured production build passed. No later application-source edit
has occurred; later changes are documentation and the narrow backup ignore rule. Final whitespace/status inspection and a secret-pattern scan of changed source/docs completed; no
private-key/JWT/provider-key patterns were found in those changed artifacts. Handoff includes the app
URL, private credential-file location and five-case review guide.
Browser/mobile interaction, teacher review, provider latency/reliability and conservative false-refusal
candidates remain explicit limitations. No additional provider retries are pending.
