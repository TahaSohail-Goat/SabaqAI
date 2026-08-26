# What to paste into Google AI Studio

Upload the whole repo (as a zip, or the key files below), then paste this prompt. Work **one day
at a time** — don't ask it to build everything at once, or you'll get a pile of code you can't
debug.

## Files to give it (minimum)

- `README.md`
- `docs/build-plan.md`
- `docs/confidence-guardrails.md`
- `docs/rag-architecture.md`
- `docs/database.md`
- `supabase/migrations/0001_init.sql`
- `.env.example`
- `src/lib/types.ts`
- `src/lib/ai/guardrail.ts` (the skeleton — it shows the intended shape)

## The prompt

> I'm building **Sabaq AI**, a syllabus-grounded RAG tutor, as a **single Next.js app** (App
> Router, TypeScript, Tailwind) with **hosted Supabase + pgvector** and **one AI provider** for
> both embeddings and chat. I am a beginner and I have one week. Keep it simple and runnable —
> no monorepo, no Docker, no extra libraries unless necessary.
>
> The attached files are the specification. Read `README.md`, `docs/build-plan.md`,
> `docs/confidence-guardrails.md`, and `docs/database.md` first.
>
> **The one rule that cannot be broken:** retrieval runs before generation, and when the
> confidence gate returns REFUSE, the LLM is NOT called at all. Citations are validated against
> retrieved chunks. No provider keys in browser code.
>
> **Build only Day 1 today** (from `docs/build-plan.md`): scaffold the app, wire Supabase Auth
> (email/password), and a login + signup page. Give me the exact files and where they go, plus
> the commands to run. Explain each step simply — assume I haven't used Supabase before. Don't
> build later days yet.

Then, once Day 1 runs, come back and say:

> Day 1 works. Now build **Day 2** from the build plan: the ingestion script (`scripts/ingest.ts`)
> that chunks text from `data/source/`, embeds each chunk, and inserts into `content_chunks`, plus
> a small test that embeds a question and prints the top 5 vector-search results with scores.

Continue day by day. After each day, tell it what worked and what broke before moving on.

## Rules to repeat to it if it drifts

- One app, one provider, npm. No pnpm, no Turborepo, no separate backend.
- No bypass around the confidence gate. Ever.
- Don't invent syllabus content — even in test data. Use only what's in `data/source/`.
- If something's stubbed or unfinished, say so plainly. Don't tell me it works when it doesn't.
