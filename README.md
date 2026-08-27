# Sabaq AI

**A syllabus-grounded AI tutor for Pakistani board students.**

Answers only from the actual textbook and past papers of your board, class and subject. Shows the
page. Refuses honestly when your syllabus doesn't cover the question, instead of guessing.

Built for the **Bano Qabil AI Hackathon 2026** (Education category) — one Next.js app, npm, hosted
Supabase. No monorepo, no Docker, no separate backend.

> ⚠️ **Read `docs/project-status.md` before writing code.** Parts of this README describe the
> target system, not the current one. Retrieval, ingestion, and the nearest-chapters logic are
> still stubs. That file tracks exactly what is real and what is fake.

## Start here

| You are | Read |
| --- | --- |
| Joining the team | `docs/project-status.md`, then `docs/build-plan.md` |
| Setting up locally | `docs/setup.md` |
| Building a feature | `docs/api-spec.md` + `docs/rag-architecture.md` |
| Working on the gate | `docs/confidence-guardrails.md` |
| Preparing the pitch | `docs/demo-script.md` + `docs/submission.md` |

## What it does

- **Grounded Ask** — question in Urdu, Roman Urdu, or English; answer from your syllabus, with a
  page citation you can check in your own book.
- **Confidence gate** — below threshold it refuses and shows the nearest chapters. The LLM is never
  called on a refusal.
- **Chapter quiz** — MCQs generated from a chapter, graded, with explanations tied to source chunks.
- **Evaluation** — a hand-labelled question set that measures retrieval and refusal quality.
- **Urdu voice input** — speak your question instead of typing it *(planned, Day 5)*.

## Stack

| Part | Choice | Why |
| --- | --- | --- |
| App | Next.js (App Router) + Tailwind | One app for UI and API routes |
| Database | Supabase (hosted) + pgvector | No local Docker; vectors and tables in one place |
| Embeddings | Qwen `text-embedding-v3` via Alibaba Cloud DashScope | 1024-dim, matches the migration; sponsor tech that's load-bearing |
| Generation | Gemini | Grounded answers and quiz generation |
| Voice | Whisper via Groq | Urdu speech-to-text |
| Language | TypeScript | Type safety without ceremony |

## Run it

```bash
npm install
cp .env.example .env.local     # fill in your keys — see docs/setup.md
npm run ingest                 # load chapters into the database
npm run dev                    # http://localhost:3000
npm run eval                   # retrieval + refusal metrics
```

Requires Node 20+. `npm run lint` type-checks; CI runs install → lint → build on every push and PR
(`docs/ci-cd.md`).

## The one rule that matters

Retrieval runs before generation, and when the confidence gate says REFUSE, **the LLM is not called
at all.** That single property is why the product is trustworthy. See
`docs/confidence-guardrails.md`. Don't add a way around it.

The corollary: nothing a student sees as fact may come from model output. Citations are rebuilt
from the stored database row — the model picks *which* chunk, never *what the citation says*.

## Folder map

```
src/app/          pages + API routes (api/ask, api/quiz, api/eval, api/syllabus, api/auth)
src/lib/ai/       retrieval, guardrail, generation, citation
src/prompts/      the LLM prompts (kept out of route files)
scripts/          ingest.ts, eval.ts
data/source/      your textbook/past-paper text (never committed)
data/evaluation/  your labelled question set
supabase/         the database migration
.stitch/          design brief + screen specs (design handoff, not code)
docs/             everything below
```

## Docs

| File | What's in it |
| --- | --- |
| `project-status.md` | **What's real vs. stubbed.** Start here. |
| `build-plan.md` | The 7-day team plan and who owns what |
| `setup.md` | Accounts, keys, migration, first run |
| `api-spec.md` | Every endpoint's request and response |
| `rag-architecture.md` | How retrieval and grounding work |
| `confidence-guardrails.md` | The gate — the core feature |
| `database.md` | Schema, indexes, RLS |
| `evaluation.md` | The metrics and how to calibrate them |
| `demo-script.md` | The five-minute pitch runbook |
| `submission.md` | Submission brief and judge Q&A |
| `ci-cd.md` | The CI workflow, in plain language |
| `PRD.md` | Product brief and scope |
