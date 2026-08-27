# Sabaq AI — 7-Day Hackathon Build Plan (Team of 4)

> Supersedes the earlier solo build plan. Bano Qabil AI Hackathon 2026, Education category.

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
