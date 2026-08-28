# AGENTS.md

Instructions for AI coding agents working in this repository. Read this before editing anything.

## What this project is

**Sabaq AI** — a syllabus-grounded tutor for Pakistani board students. It answers questions using
only ingested textbook content for the student's board, class and subject; it cites the exact
chapter and page; and when retrieval confidence is too low it **refuses to answer** rather than
guessing.

Single Next.js app. API routes are the backend. There is no separate service, and you should not
add one.

---

## Non-negotiable invariants

These are the product. Code that violates any of them is wrong even when it passes tests, makes a
demo smoother, or looks like an improvement. If a task appears to require breaking one, **stop and
say so** rather than working around it.

**1. On REFUSE, the LLM is never called.**
`evaluateConfidence()` decides before generation. When it returns `REFUSE`, no model call happens —
not with a shorter prompt, not with a "low confidence" warning, not for a fallback. This is the
single property that makes the product trustworthy. There is no config flag that disables it, and
you must not add one.

**2. The gate fails closed.**
Any error, any missing filter, any unexpected state resolves to `REFUSE`. Never to `PASS`. If you
add a code path that can throw between retrieval and generation, its failure mode must be refusal.

**3. Never fabricate an answer when generation is unavailable.**
If the model errors, is rate-limited, or has no API key, return `answerable: false` and let the
route refuse. **Do not** synthesise an answer from retrieved text as a "fallback" — it renders as a
real cited answer while ignoring the question. This bug existed once and was removed deliberately;
do not reintroduce it in any form.

**4. Nothing a student sees as fact may come from model output.**
The model chooses *which* chunk it used. Chapter, page, section and excerpt are always rebuilt from
the stored row (`validateCitations` in `src/lib/ai/citation.ts`). A citation the model wrote is not
a citation.

**5. Invalid citations are discarded, never reassigned.**
If the model cites a chunk id that wasn't retrieved, drop the statement or question. Substituting a
real chunk gives hallucinated content real-looking provenance — worse than dropping it.

**6. Retrieval is always filtered by board + class + subject.**
An unfiltered search is a bug: it pulls the wrong curriculum and silently breaks grounding.

**7. No hardcoded claims about the system's own accuracy.**
Every metric rendered anywhere must be computed from `/api/eval` against live retrieval. Never
write a literal like "100% refusal rate" into UI, docs, or a response payload. Hardcoded content
must never label itself "verified".

**8. "Nearest chapters" must be computed from the actual scores for that question.**
Never a fixed list. If retrieval found nothing, return an empty array — the honest answer.

---

## Commands

```bash
npm install
npm run dev                  # http://localhost:3000
npm run lint                 # tsc --noEmit — this IS the lint step
npm run build                # next build
npm run ingest               # data/source/*.json → chunks → embeddings → Supabase
npm run ingest -- --dry-run  # chunk and report; no API calls, no writes
npm run eval                 # retrieval + refusal metrics
```

Node 20+. npm, not pnpm or bun. CI runs install → lint → build on every push and PR.

**Always run `npm run lint` before declaring work done.** It type-checks the whole project.

---

## Where things live

```
src/app/api/ask/           THE core route: retrieve → gate → generate → validate
src/app/api/quiz/          chapter quiz generation (answers withheld from the browser)
src/app/api/quiz/grade/    server-side grading; returns answers only after submission
src/app/api/eval/          evaluation metrics (calls retrieval per question — slow)
src/app/api/syllabus/      corpus browser
src/app/api/auth/          signup / login / logout / user
src/app/page.tsx           the whole student UI (single client component)

src/lib/ai/retrieval.ts    pgvector search + nearest chapters
src/lib/ai/guardrail.ts    THE confidence gate — read before touching anything nearby
src/lib/ai/generation.ts   grounded generation (Gemini)
src/lib/ai/citation.ts     citation validation
src/lib/ai/embeddings.ts   Jina embeddings (provider-agnostic client)
src/lib/ingest/chunker.ts  recursive chunking (pure, no I/O, safe to unit test)
src/lib/evaluation/        THE labelled question set + the shared scoring run
src/lib/quiz/answer-key.ts AES-256-GCM sealing of quiz answers
src/lib/qa-log.ts          per-question logging; never throws into a request
src/lib/supabase/admin.ts  service-role client — SERVER ONLY
src/lib/types.ts           shared shapes; the app agrees on these
src/prompts/               THE prompts, kept out of route files

scripts/ingest.ts          ingestion pipeline
scripts/eval.ts            evaluation CLI
supabase/migrations/       0001 schema + RLS, 0002 match_content_chunks RPC
data/source/               your syllabus JSON (gitignored)
docs/                      see below
```

### Single sources of truth — do not create a second copy

| Thing | Lives in |
| --- | --- |
| Eval questions | `src/lib/evaluation/questions.ts` |
| Eval scoring | `src/lib/evaluation/run.ts` (both the route and the CLI call it) |
| Grounded-answer prompt | `src/prompts/grounded-answer.ts` |
| Chunk → DB row shape | `src/lib/ingest/chunker.ts` (`PreparedChunk`) |
| API response shapes | `src/lib/types.ts` |

Each of these was previously duplicated, and the copies drifted — the eval set existed in three
places with different questions *and* different field names, so the dashboard and CLI reported
different numbers for the same system. If you need the same data in two places, import it.

### Docs worth reading before you code

| Doc | When |
| --- | --- |
| `docs/project-status.md` | **First, always.** What is real vs. stubbed. |
| `docs/confidence-guardrails.md` | Before touching the gate or thresholds |
| `docs/rag-architecture.md` | Before touching retrieval, chunking, or citations |
| `docs/api-spec.md` | Before changing any route's contract |
| `docs/evaluation.md` | Before touching eval or quoting any metric |
| `docs/build-plan.md` | Day-by-day plan and ownership |

---

## Current state

`docs/project-status.md` is the authoritative tracker — read it before assuming a subsystem works.
When you make a stub real, **update that file in the same change.** A status file that drifts is
worse than none.

### Written but never run against real services

Retrieval, ingestion, embeddings, `qa_log`, and profile creation are all implemented and
type-check. A Supabase project and a Jina key are now provisioned and connectivity-verified
(`node scripts/verify-embeddings.mjs` passes — 1024 dims), but **no source documents have been
ingested** — the corpus is empty, and none of the request-path code has run against real content
even once.

Do not report these as working. The first task is to run them and fix what breaks.

### The remaining work, in order

1. **Provision and verify.** Supabase project + `0001_init.sql` + `0002_match_function.sql`.
   Jina key. Run `node scripts/verify-embeddings.mjs` — it confirms the configured model really
   returns 1024 dimensions before ingesting.
2. **Ingest real content.** Convert chapters into the `SourceDocument` JSON shape
   (`data/source/README.md`), run `npm run ingest -- --dry-run`, tune chunk size, then ingest.
   Verify with `select count(*) from content_chunks`.
3. **Verify retrieval end-to-end.** With Supabase configured, `retrieve()` takes the pgvector path.
   Confirm real scores come back and that the `[retrieval]` fallback warning does *not* appear.
4. **Recalibrate thresholds** against real scores (`docs/evaluation.md`). The current values are
   guesses made before any corpus existed.
5. **Fix near-miss leakage.** `nm-003` currently leaks through — see below.
6. **Persist quizzes** to `quizzes` / `quiz_questions` / `quiz_attempts`. Once quizzes have real
   ids, grading can look the answer key up by id and `src/lib/quiz/answer-key.ts` can be deleted.
7. **Urdu voice input** via Groq `whisper-large-v3`. Text input must remain visible at all times.

### A known, measured failure

The evaluation set includes four **near-miss** questions — same subject, wrong syllabus. On the
last run, `nm-003` (*"Derive Ohm's law from the Drude model"*) scored 0.709 and was **answered**.
That is an off-syllabus answer reaching a student: false acceptance 11.1%, near-miss refusal 75%.

The easy off-syllabus questions reported a clean 100% the whole time it was happening. Do not
delete or soften the near-miss questions to make the dashboard look better — they are the only
reason this is visible. Fix it by recalibrating against the real corpus (step 4).

---

## Workflow for a task

1. **Read `docs/project-status.md`** to learn whether the thing you're touching is real.
2. **Check the invariants above.** If the task conflicts with one, say so before writing code.
3. **Find the existing contract.** Types live in `src/lib/types.ts`; route shapes in
   `docs/api-spec.md`. Change the type file, not just one call site.
4. **Make the change.** Match surrounding style — no new dependencies, no new component library,
   no new CSS framework. Tailwind is already set up; use it.
5. **Run `npm run lint`.** Then `npm run build` if you touched anything under `src/app/`.
6. **Verify behaviour, don't assume it.** For retrieval or chunking changes, actually run them and
   read the output.
7. **Update the docs you invalidated** — `project-status.md` at minimum.
8. **Report honestly.** If something is partly done, say which part. If a test fails, show it.

---

## Conventions

- **TypeScript throughout.** No `any` in new code unless you explain why in a comment.
- **No new dependencies** without a clear reason. The embeddings client is plain `fetch` on purpose.
- **Comments explain *why*, not *what*.** The files enforcing invariants carry comments saying what
  breaks if the rule is removed — preserve those when editing nearby.
- **Refusals are HTTP 200.** Refusing is correct behaviour, not an error. Only genuine failures are
  4xx/5xx.
- **Errors say what went wrong and how to fix it**, and point at the relevant doc. See the
  dimension-mismatch error in `embeddings.ts` for the standard.
- **Server-only secrets never get a `NEXT_PUBLIC_` prefix.** `SUPABASE_SERVICE_ROLE_KEY` and
  `EMBEDDING_API_KEY` must never reach the browser.
- **UI:** mobile-first for a low-end Android. The citation is a primary element, not a footnote.
  Refusal is styled calm and neutral — never red, never an error icon. Confidence is icon + label,
  never colour alone. Urdu gets `dir="rtl"` at the block level.

---

## Traps that will cost you hours

**Embedding dimensions.** The migration declares `vector(1024)`; Jina `jina-embeddings-v3` returns
1024. If you change `EMBEDDING_MODEL`, you must change the migration, `EMBEDDING_DIM`, **and
re-embed everything.** A mismatch fails on insert with an error that never mentions the model.

**RLS silently refusing everything.** The `chunks_match_profile` policy needs a `student_profiles`
row that nothing currently creates. Query `content_chunks` with the anon key and you get zero rows
→ the gate correctly refuses → the app refuses every question with no error anywhere. Retrieval
must use the service-role client (`src/lib/supabase/admin.ts`).

**Auth demo mode.** With Supabase unconfigured, signup/login return a fabricated `demo-user-101`
with `success: true`. Auth appears to work when nothing is wired. Check `isDemo`.

**Thresholds are guesses.** `PASS_TOP1=0.62` and friends were set before any real corpus existed.
They are meaningless until calibrated against ingested content. Never quote them as tuned.

**`/api/eval` is slow and burns quota.** It runs retrieval once per question. Don't call it on
page load or in a hot path.

**Retrieval falls back silently-ish when Supabase is absent.** Without credentials it uses a
keyword ranking over the ten hardcoded chunks in `src/lib/syllabus-data.ts` and logs a
`[retrieval]` warning. Those scores are **not** embedding similarity. Never calibrate thresholds
or quote metrics from that path — check the warning is absent before believing any number.

**`next build` failing with `spawn UNKNOWN` on Windows** is a stale Turbopack cache, not your code.
`rm -rf .next` and rebuild. `npm run lint` still type-checks correctly while it's happening.

**Encoding is not encryption.** The quiz answer key is AES-256-GCM encrypted, not just signed. A
signed-but-base64 token can be decoded by anyone — which would leave the answer-leak bug in place
behind a longer string. If you touch `src/lib/quiz/answer-key.ts`, keep it encrypted.

---

## Definition of done

A change is complete when:

- [ ] `npm run lint` passes
- [ ] `npm run build` passes, if `src/app/` was touched
- [ ] No invariant above was weakened
- [ ] Behaviour was actually verified, not assumed
- [ ] `docs/project-status.md` reflects reality
- [ ] Nothing hardcoded claims a metric, a verification, or an accuracy figure
