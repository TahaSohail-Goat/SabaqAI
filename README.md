# Sabaq AI (MVP)

**A syllabus-grounded AI tutor for Pakistani board students.**

Answers only from the actual textbook and past papers of your board, class and subject. Shows the
page. Refuses honestly when your syllabus doesn't cover the question, instead of guessing.

This is the **simplified single-app build** — one Next.js app, npm, hosted Supabase, one AI
provider. No monorepo, no Docker. Built to be shippable by one person in a week.

## Start here

1. Read `docs/build-plan.md` — your day-by-day guide.
2. Read `docs/setup.md` — Docker-free setup, step by step.
3. Read `docs/ai-studio-prompt.md` — exactly what to paste into Google AI Studio.

## What it does (MVP)

- **Grounded Ask** — question in (Urdu / Roman Urdu / English), answer from your syllabus, with a citation.
- **Confidence gate** — below threshold, it refuses and shows the nearest chapters. The LLM is never called on a refusal.
- **Adaptive quiz** — MCQs generated from a chapter, graded, with explanations.
- **Evaluation** — a labelled question set that measures retrieval and refusal quality.

## Stack

| Part | Choice | Why |
| --- | --- | --- |
| App | Next.js (App Router) + Tailwind | One app for UI and API routes |
| Database | Supabase (hosted) + pgvector | No local Docker; vectors + tables in one place |
| AI | One provider for embeddings + chat | Half the setup of two providers |
| Language | TypeScript | Type safety without ceremony |

## Run it

```bash
npm install
cp .env.example .env.local     # fill in your keys
npm run ingest                 # load a chapter into the database
npm run dev                    # http://localhost:3000
npm run eval                   # retrieval + refusal metrics
```

## The one rule that matters

Retrieval runs before generation, and when the confidence gate says REFUSE, the LLM is not called
at all. That single property is why the product is trustworthy. See
`docs/confidence-guardrails.md`. Don't add a way around it.

## Folder map

```
src/app/          pages + API routes (api/ask, api/quiz, api/health)
src/lib/ai/       language, retrieval, guardrail, generation, citation
src/prompts/      the LLM prompts (kept out of route files)
scripts/          ingest.ts, eval.ts
data/source/      your textbook/past-paper text (never committed)
data/evaluation/  your labelled question set
supabase/         the database migration
docs/             build plan, setup, PRD, guardrail + RAG design
```
