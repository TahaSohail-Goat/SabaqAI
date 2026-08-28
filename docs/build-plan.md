# Sabaq AI — 7-Day Hackathon Build Plan (Team of 4)

> Supersedes the earlier solo build plan. Bano Qabil AI Hackathon 2026, Education category.

---

## Part 0 — Current sprint, real names (2026-08-27)

Everything below Part 1 was the plan for a green-field build. It's not green-field anymore: one
person (Taha) has already written the retrieval/guardrail/generation/quiz/eval code solo, per
`docs/project-status.md`. It type-checks and looks right, but **nothing has run against a real
Supabase project, a real DashScope key, or real textbook content.** That's the actual state of the
repo today, and it's the entire remaining scope for the four of us.

**Division is by development layer** — three people each own one build layer end-to-end so file
ownership doesn't overlap; **DevOps & QA is not a fourth lane, it's a shared final phase everyone
does together** once the three layers land.

| Development area | Owner(s) | GitHub |
| --- | --- | --- |
| **Database & infrastructure** | Abdullah Adnan | `Abdullah-SE-bit` |
| **AI / backend** (retrieval, guardrail, generation) | Taha Sohail | `TahaSohail-Goat` |
| **Frontend** (UI, quiz, voice) | Artfever + Muhammad Hasnain | `Artfever`, `voidloop-dev` |
| **DevOps & QA** (eval, deploy, pitch) | **All four, at the end** | — |

Dependency order: Database work unblocks AI/backend verification and the frontend's quiz-persistence
piece. The rest of frontend does not depend on live data and can proceed in parallel from day one.
DevOps & QA starts only once the three build layers are actually working together.

### 1. Database & infrastructure development — Abdullah

Nobody can verify anything until this lands. Do it first, ideally today.

1. Create the real Supabase project, enable the `vector` extension.
2. Get a DashScope API key. Confirm `text-embedding-v3` actually returns 1024 dims before running
   anything else — this is Trap A below, and it silently breaks every insert if wrong.
3. Run `supabase/migrations/0001_init.sql` then `0002_match_function.sql` against the real project.
4. Fill real values into `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `EMBEDDING_API_KEY`.
5. Run `npm run ingest` against real chapter text (coordinate with whoever sources the PCTB Class
   10 Physics PDF/text — see Part 4, Day 1 scope lock) and confirm
   `select count(*) from content_chunks` returns real rows, not 0.
6. Verify the `match_content_chunks` RPC returns sane results for a real question — this is marked
   "unverified" in `project-status.md` and is the single riskiest unverified piece in the repo.
7. Confirm RLS behaves as documented (Trap B below): retrieval must run with `service_role`, not
   anon — the anon key + RLS combination will silently return zero rows and make the guardrail
   refuse every question with no visible error.
8. Wire up the currently-unused `quizzes` / `quiz_questions` / `quiz_attempts` tables so quiz
   results persist (see `project-status.md` → "Quiz persistence — Missing"). Coordinate the request
   shape with Artfever, who owns the frontend side of this.

*Done when:* `content_chunks` has real ingested rows, a real question returns a real similarity
score (not the local-corpus keyword fallback), and quiz attempts are stored instead of discarded.

### 2. AI / backend development — Taha

Blocked on Abdullah's step 5–7 for anything that needs live data; until then, review/tighten the
existing code.

1. Once real data lands, confirm retrieval is actually hitting Supabase (`[retrieval]` warning in
   logs means it silently fell back to the 10-row local corpus — that must not happen in the demo).
2. Fix the known near-miss leakage: `nm-003` ("Derive Ohm's law from the Drude model") currently
   scores 0.709 and gets answered — false acceptance. Recalibrate `PASS_TOP1` /
   `BORDERLINE_TOP1` against the real score distribution, not the placeholder `0.62` / `0.52` in
   `.env.example`.
3. Re-verify the citation validator (`src/lib/ai/citation.ts`) against real chunk ids once ingestion
   is live.
4. Review Artfever's and Hasnain's PRs against `src/lib/ai/` and `src/lib/types.ts` — you wrote the
   contract, you're best placed to catch drift from it.

*Done when:* an in-syllabus question answers with a real citation, an off-syllabus one refuses, and
the near-miss questions in `src/lib/evaluation/questions.ts` refuse too.

### 3. Frontend development — Artfever + Hasnain

Split the screen surface so both can work without touching the same files.

**Artfever — Ask screen & voice:**

1. Wire the Ask screen's metric cards to confirm they render only computed numbers from `/api/eval`
   (already fixed per `project-status.md`, but verify on real data once Abdullah's ingestion runs —
   numbers looked plausible against zero rows, which is not the same as correct).
2. Build Urdu voice input — Groq `whisper-large-v3`: record → transcribe → drop into the question
   box as **editable** text. The text input must stay visible and usable at all times; voice is an
   accelerator, never the only path (see Part 5 demo-risk notes — this is the riskiest live demo
   moment).
3. Sanity-check the four Ask-screen states (idle / loading / answered / refused) on an actual phone,
   not just desktop Chrome.

**Hasnain — Quiz screen:**

1. Frontend side of quiz persistence: once Abdullah's tables are live, save attempts via
   `/api/quiz/grade` and show a results/history view instead of discarding them client-side.
2. Confirm the near-miss set in `src/lib/evaluation/questions.ts` still holds under real data;
   propose 2-3 more near-miss questions if the current ones are too easy — this feeds directly into
   the shared eval run below.

*Done when:* a quiz attempt survives a page refresh, and a spoken Urdu question reaches the input
box as editable text with the text box still usable if transcription fails.

### 4. DevOps & QA — everyone, at the end

Not one person's lane. Once Database, AI/backend, and Frontend are each working on their own, all
four regroup and close the sprint together:

1. **Everyone:** run `npm run eval` against the real ingested content and read the metrics table
   together — in-syllabus vs. off-syllabus vs. near-miss. Taha owns interpreting the numbers since he
   owns the thresholds, but everyone should see where it actually separates.
2. **Abdullah + Taha:** if the eval run exposes bad calibration or missing data, they're the two who
   can fix it fastest — database or threshold, respectively.
3. **Hasnain:** deploy to Vercel with the real env vars (get `QUIZ_SECRET` generated and set —
   without it, quiz grading fails intermittently across server instances, see `.env.example`).
4. **Everyone:** test the deployed build on the actual presentation device on conference wifi.
   Screenshot every demo step as an offline backup — split this by feature area (Ask / quiz / voice)
   so each person verifies the screen they built.
5. **Everyone:** rehearse the 5-minute pitch together at least twice (`docs/demo-script.md`,
   `docs/submission.md`) — whoever isn't presenting plays judge and asks the hard questions.

*Done when:* you have a metrics table computed from live data you'd be comfortable projecting to
judges, the deployed app has been rehearsed end-to-end on the demo device, and all four people have
seen the whole flow work at least once — not just their own piece.

### Layer dependency graph

```
Database & infra (Abdullah)  ──▶  AI / backend (Taha)             ──┐
                              └─▶  Frontend / quiz (Hasnain)         ├──▶  DevOps & QA (all four)
                                                                     │
Frontend / Ask screen + voice (Artfever)  ── independent, starts immediately ──┘
```

Abdullah's steps 1-7 block Taha's calibration and Hasnain's quiz-persistence wiring — that work
genuinely cannot start until real data exists. Artfever's voice input and Ask-screen polish don't
depend on live data and can start in parallel immediately. The three layers re-sync once
`content_chunks` has real rows, and only then does the whole team move into the shared DevOps & QA
phase together.

Everything from here down (Parts 1-5) is background: what's broken, why the architecture is what it
is, the two dimension/RLS traps in more detail, and the demo-risk notes. Worth reading once, not
re-planning — the plan above supersedes the original Day-1-through-7 schedule now that most of it is
already built.

---

**Architecture decision: we extend the existing single Next.js app. We do not split into an
Express backend + a separate Vite dashboard.**

Why: one deploy target, one auth context, no CORS, no cross-service debugging at 2am. With four
people on a seven-day clock, a "proper" service split costs more in coordination than it returns.
Next.js API routes already are the backend. The submission brief's architecture story stays true —
retrieval, guardrail, and generation are still cleanly separated in `src/lib/ai/`.

---

## Part 1 — Read this before you write any code

The repo does not currently do what its README claims. Four of these are demo-breaking. Fix them
before building anything new.

| # | What's broken | Where | Severity |
| --- | --- | --- | --- |
| 1 | **No database.** Retrieval reads a hardcoded 10-paragraph array. Nothing queries Supabase. | `src/lib/ai/retrieval.ts:103`, `src/lib/syllabus-data.ts` | Critical |
| 2 | **`getNearestChapters()` is fake.** Always returns chapters 10/11/12 with a hardcoded `score: 0.3`, whatever the question. | `src/lib/ai/retrieval.ts:194` | **Demo-breaking** |
| 3 | **Ingestion script is theater.** It `console.log`s the hardcoded chunks and writes nothing. | `scripts/ingest.ts` | Critical |
| 4 | **Re-embeds every chunk on every request** — 11 API calls per question, nothing cached. | `src/lib/ai/retrieval.ts:138` | High (rate limits + stage latency) |
| 5 | **UI hardcodes its own metrics.** "100% safe refusal" and "Off-syllabus answered: 0" are static text regardless of computed results. | `src/app/page.tsx:827` | **Credibility risk** |
| 6 | **Generation fallback fabricates answers.** On any Gemini failure it chops the top chunk into sentences and returns `answerable: true`. | `src/lib/ai/generation.ts:78` | High (silent stage failure) |
| 7 | **Eval off-syllabus set is trivially easy** — SN2, quicksort, kidneys, Black-Scholes. Proves little. | `src/app/api/eval/route.ts:65` | Medium |

**Finding #2 is the one that loses you the hackathon.** Your entire pitch (plan §16, §18) hangs on
the refusal moment. Right now, asking the SN2 chemistry question returns "nearest chapters: Simple
Harmonic Motion, Sound, Geometrical Optics." A judge who reads that card and asks *why* has exposed
the demo. Fix it Day 2.

What is genuinely good and should not be rewritten: `supabase/migrations/0001_init.sql` (real
schema, real RLS, HNSW index), the guardrail logic in `src/lib/ai/guardrail.ts`, the citation
validator, and `/api/eval`'s scoring loop — it honestly computes from live retrieval.

---

## Part 2 — Two traps that will cost you a day each

**Trap A — embedding dimensions.** The migration declares `vector(1024)`. Gemini
`text-embedding-004` outputs **768**. Ingest with Gemini against this schema and every insert
fails.

*Resolution (this is also your sponsor-tech answer):* use **Qwen `text-embedding-v3` via Alibaba
DashScope for embeddings** — it is 1024-dimensional, so the migration runs unchanged. Keep Gemini
for generation. This makes Alibaba Cloud **load-bearing infrastructure rather than a token API
call**, which is a far stronger answer when a judge asks how you used sponsor tech. Confirm the
model's actual dimension on Day 1 and set `EMBEDDING_DIM` to match before anyone runs the
migration.

**Trap B — RLS will silently refuse everything.** The `chunks_match_profile` policy requires a
matching `student_profiles` row. The app has a signup flow but never creates that row. Switch
retrieval to Supabase with the anon key and RLS on, and every query returns zero rows → the
guardrail correctly returns REFUSE → the entire app refuses every question, with no error message.

*Resolution:* run retrieval **server-side with the service_role key** and keep the explicit
`board / class_level / subject` filter that's already in the code. Content chunks are textbook
material, not sensitive data — the filter is a correctness concern, not a security one. RLS stays
on for `qa_log`, `quizzes`, and `quiz_attempts`, where it actually matters.

---

## Part 3 — Team split

Chosen so file ownership barely overlaps. Agree the shared contract on Day 1 (below), then work in
parallel.

- **Dev A — Retrieval & Guardrail.** Owns `src/lib/ai/`. Replaces the hardcoded array with real
  pgvector search, fixes `getNearestChapters()` to compute actual nearest chapters from scores,
  calibrates thresholds against real distributions.
- **Dev B — Student UI & Voice.** Owns `src/app/page.tsx` and screens. Builds the Ask screen's four
  states (idle, two-stage loading, answered, refused — see Day 4 below), the quiz UI, and Urdu
  voice input.
- **Dev C — Ingestion & Content.** Owns `scripts/ingest.ts` and `supabase/`. PDF → chunk → embed →
  Supabase. **This is the critical path** — nothing downstream is real until it lands.
- **Dev D — Eval, Deploy & Pitch.** Owns `src/app/api/eval/route.ts`, DashScope wiring, Vercel
  deploy, demo script, deck. Also owns deleting the hardcoded metric labels (finding #5).

### The Day-1 contract that unblocks everyone

A and C must agree the `RetrievedChunk` shape (already in `src/lib/types.ts`) and the Postgres
similarity-search function signature **before lunch on Day 1**. Once that's fixed, A codes against
the interface with the hardcoded array as a stub while C builds the real pipeline behind it. Swap
the implementation on Day 3. Neither blocks the other.

---

## Part 4 — Day by day

**Day 1 — Accounts, contract, scope lock.**
Supabase project + vector extension enabled. Alibaba Cloud DashScope key. Gemini key. Groq key (for
voice). Confirm Qwen embedding dimension, set it in the migration, run the migration. A+C lock the
retrieval contract. Lock scope to **PCTB, Class 10, Physics** — one board, one class, one subject,
fully done (per submission plan §11). C starts PDF text extraction.
*Done when:* migration is live in Supabase and `npm run dev` boots.

**Day 2 — Real ingestion + kill the fakes.**
C: real `ingest.ts` — chunk, embed via Qwen, insert with `content_hash` dedupe. A: fix
`getNearestChapters()` to return true nearest chapters from actual retrieval scores; delete the
hardcoded `0.3`. D: delete the hardcoded metric strings in `page.tsx` — the dashboard must only
ever render computed numbers.
*Done when:* `select count(*) from content_chunks` returns real rows, and a refusal shows chapters
that are genuinely closest to the question.

**Day 3 — Swap retrieval to pgvector. THE CORE.**
A: replace `INITIAL_SYLLABUS_CHUNKS` with a real vector query (service_role, explicit filter).
Embeddings are now precomputed — one API call per question, not eleven. Fix the generation fallback
(#6) to return an honest refusal instead of a fabricated answer.
*Done when:* an in-syllabus question answers with a citation, an off-syllabus one refuses with real
nearest chapters, and the LLM provably isn't called on refusal.

**Day 4 — Ask screen.**
B: build the four states — idle (input + example chips, nothing else), loading (single indicator,
label changes "Searching your syllabus…" → "Writing the answer…", never reaches stage two on a
refusal), answered (citation is the hero element — prominent and expandable, not a footnote),
refused (calm and neutral — no red, no warning icon; nearest chapters + one reformulation hint).
Mobile-first for a low-end Android, confidence shown as icon + label never colour alone, Urdu
renders `dir="rtl"` at the block level.
*Done when:* both demo moments look right on a real phone.

**Day 5 — Quiz + Urdu voice input.**
B: quiz UI wired to `/api/quiz`. B: voice input via **Groq `whisper-large-v3`** — record →
transcribe → drop into the question box as editable text. **The text input stays visible and usable
at all times**; voice is an accelerator, never the only path.
*Done when:* you can take a graded quiz, and an Urdu spoken question reaches the input box.

**Day 6 — Calibrate and prove.**
D: run the eval, read where in-syllabus and off-syllabus scores actually separate, set
`PASS_TOP1` just above the off-syllabus band. Re-run until off-syllabus reliably refuses.
*Optional, ~30 min, high value:* add 4–6 **near-miss** questions — Class 9 and Class 11 physics,
same subject, wrong syllabus. Refusing those is a much harder and more defensible claim than
refusing a quicksort question, and it directly answers plan §18's "how do you know it won't
hallucinate?"
*Done when:* you have a metrics table computed from live data that you'd be comfortable projecting.

**Day 7 — Deploy, rehearse, freeze.**
Vercel deploy. Test on the actual presentation device on conference wifi. Screenshot every demo
step as offline backup. Rehearse the 5-minute pitch three times. **Freeze** — demo-breaking fixes
only.

---

## Part 5 — Demo risk notes

- **Voice on stage is the riskiest thing you'll do.** Ambient noise, an unfamiliar mic, and live
  transcription of Urdu. Demo it *second*, never first, and always with the text box visible so a
  failed transcription is a shrug rather than a dead stop. Have a screen recording as backup.
- **Rate limits.** Precomputed embeddings (Day 3) take you from 11 API calls per question to 1.
  Test heavily on Day 6 and you'll still be fine.
- **The refusal is your strongest 20 seconds.** Don't narrate over it. Ask the off-syllabus
  question, let the refusal card render, pause, then point out it was *faster* because no answer
  was generated.

## Cut list (decide now, not under pressure)

1. Revision planner — cut. LLM output with no grounding story; it dilutes the pitch.
2. Parent/teacher dashboard — cut. Highest effort, least airtime in five minutes.
3. Weekly progress reports — cut with the dashboard.
4. Second subject — demo Physics, say the second is "ingestion-ready."

**Never cut:** the confidence gate, real citations, the evaluation numbers. Those three *are*
Sabaq AI.

## One-sentence pitch

"Other AI tutors answer confidently from the wrong curriculum. Sabaq AI answers only from your
actual textbook, shows you the page, and honestly refuses when your syllabus doesn't cover it —
and here are the numbers that prove it."
