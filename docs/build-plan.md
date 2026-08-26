# Sabaq AI — 7-Day Solo Build Plan

Your daily map. Each day: the goal, exact steps, and a "done when" check. If a day's check
doesn't pass, do not move on — a broken foundation costs two days later. Every day ends with
something you can see working.

---

## Day 0 — Accounts (BEFORE Day 1, ~1 hour)

Three things, none involve Docker:

1. **Supabase** (free tier) → create a project → copy the Project URL, `anon` key, and
   `service_role` key from Project Settings → API. Enable the vector extension:
   Database → Extensions → search "vector" → enable.
2. **One AI provider** that gives both embeddings and chat (keeps setup simple). Copy the key.
3. **Node.js 20+** installed. Check: `node --version`.

**Done when:** you have the Supabase URL + two keys, one AI key, and Node 20+.

---

## Day 1 — Foundations

**Goal:** the app runs, you can log in, the database has tables.

1. `npx create-next-app@latest sabaq --typescript --app --tailwind` (decline the extras). Then
   `cd sabaq && npm install @supabase/supabase-js @supabase/ssr zod`.
2. Copy `.env.example` to `.env.local`, fill in your keys.
3. Run the migration: paste `supabase/migrations/0001_init.sql` into Supabase SQL Editor and run.
4. Wire Supabase Auth (email/password) with `@supabase/ssr`. One login page, one signup page.
5. `npm run dev`, log in.

**Done when:** you can sign up, log in, and see tables in the Supabase Table Editor.

> Auth is the fiddliest part of the week. If it eats the whole day, that's normal. Get it working
> before Day 2 — everything assumes a logged-in user.

---

## Day 2 — Ingest content + vector search

**Goal:** real chunks in the database, and search returns the right ones.

1. Put one or two chapters of plain text into `data/source/`. Start with past papers or openly
   available material if the textbook licence isn't cleared (see the licensing note in the PRD).
2. `npm run ingest` — splits text into chunks, embeds each, inserts into `content_chunks`.
3. Write a tiny query: embed "What is Ohm's law?", run the vector search, print top 5 + scores.

**Done when:** a known question returns the correct chapter near the top, with visible scores.
If not, your chunking or embedding is wrong — fix it here, not later.

---

## Day 3 — Confidence gate + grounded answer (THE CORE)

**Goal:** `POST /api/ask` returns a grounded answer OR a refusal. This is the whole product.

1. Build `src/lib/ai/`: `language → retrieval → guardrail → generation → citation`.
2. The guardrail returns PASS / BORDERLINE / REFUSE from the scores. **On REFUSE, do not call the
   LLM at all.**
3. On PASS, send only retrieved chunks + question to the LLM. Require chunk-ID citations.
4. Validate citations: drop any citing a chunk that wasn't retrieved.
5. Test both paths: an in-syllabus question (answer) and an off-syllabus one (refusal).

**Done when:** in-syllabus returns an answer + citation; off-syllabus returns a refusal + nearest
chapters. Prove the LLM wasn't called on refusal (a `console.log` in the generation function
should not fire).

> Give this day everything. If Day 3 works, you have a demo. If it doesn't, nothing else matters.

---

## Day 4 — Ask screen UI

**Goal:** a student can ask and see answer, citation, and refusal states.

1. Input, send, answer card, citation chip that expands to the excerpt.
2. Refusal state: neutral (not red), nearest chapters, a reformulation hint.
3. Confidence indicator: icon + label (not colour alone).
4. Loading: "Searching your syllabus…" then "Writing the answer…".
5. Works on a phone. Test Urdu `dir="rtl"` if you have Urdu content.

**Done when:** Demo 1 (answer) and Demo 2 (refusal) look good on your phone.

---

## Day 5 — Quiz generation

**Goal:** generate a short quiz from a chapter, grade, show explanations.

1. `POST /api/quiz`: retrieve a chapter's chunks, ask the LLM for N MCQs with correct answer,
   explanation, and the source chunk ID.
2. Discard any question whose answer isn't supported by its cited chunk.
3. Quiz UI: show questions, grade on submit, show explanations + citations.

**Done when:** you can take a 5-question quiz and see your score with explanations.

> **First cut point.** If Day 4 ran long, skip quiz, go to Day 6. Polished Ask + refusal beats a
> half-working quiz.

---

## Day 6 — Evaluation set

**Goal:** prove it works with numbers. This is what wins judging.

1. Write 20–30 questions in `data/evaluation/questions.jsonl`: in-syllabus (with expected
   chapter), off-syllabus (must refuse), a few Roman Urdu.
2. **Label them yourself against the actual book.** Do not have the AI write them.
3. `npm run eval` — reports retrieval accuracy, wrong-answers-on-off-syllabus, wrong-refusals.
4. Fix what the numbers reveal. Off-syllabus getting answered? Raise the threshold, re-run.

**Done when:** you have a metrics table to show a judge, and off-syllabus questions mostly refuse.

---

## Day 7 — Polish, rehearse, freeze

1. Fix the top 3 rough edges only. No new features.
2. Rehearse the full demo out loud, twice, on your presentation device.
3. Screenshot every step as backup.
4. **Freeze.** Only demo-breaking bug fixes after your last rehearsal.

**Done when:** two clean end-to-end runs, and you can explain your evaluation numbers.

---

## Cut list (decide now, not under pressure)

1. Revision plan (not in this plan — post-MVP for a solo week)
2. Parent/teacher dashboard (cut entirely if needed)
3. Quiz (Day 5) — cut to Ask-only
4. Second subject — demo one, say the second is "ingestion-ready"

**Never cut:** the confidence gate, citations, the evaluation set. Those three *are* Sabaq AI.

## One-sentence pitch (never lose this thread)

"Other AI tutors answer confidently from the wrong curriculum. Sabaq AI answers only from your
actual textbook, shows you the page, and honestly refuses when your syllabus doesn't cover it —
and here are the numbers that prove it."
