# Sabaq AI

**A syllabus-grounded AI tutor for Pakistani board students.**

Answers only from the actual textbook and past papers of your board, class and subject. Shows the
page. Refuses honestly when your syllabus doesn't cover the question, instead of guessing.

Built for the **Bano Qabil AI Hackathon 2026** (Education category) — one Next.js app, npm, hosted
Supabase. No monorepo, no Docker, no separate backend.

> ⚠️ **Read `docs/project-status.md` before writing code.** Parts of this README describe the
> target system, not the current one. The database schema is live and torture-tested, and the
> embedding key is verified — but the corpus is empty, so retrieval has never served a real
> answer and generation still needs a Gemini key. That file tracks exactly what is real.

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
| Embeddings | Jina AI `jina-embeddings-v3` | 1024-dim, matches the migration; OpenAI-compatible client — DashScope/Qwen remains a drop-in env-var alternative |
| Generation | Gemini | Grounded answers and quiz generation |
| Voice | Whisper via Groq | Urdu speech-to-text |
| Language | TypeScript | Type safety without ceremony |

## Run it

```bash
npm install
cp .env.example .env.local     # fill in your keys — see docs/setup.md
npm run crawl                  # download + OCR FBISE PDFs → data/source/ → Supabase
npm run dev                    # http://localhost:3000
npm run eval                   # retrieval + refusal metrics
```

To populate the database manually with your own content:

```bash
npm run ingest                 # ingest data/source/*.json → embed → Supabase
```

Requires Node 20+. `npm run lint` type-checks; CI runs install → lint → build on every push and PR
(`docs/ci-cd.md`).

## The one rule that matters

Retrieval runs before generation, and when the confidence gate says REFUSE, **the LLM is not called
at all.** That single property is why the product is trustworthy. See
`docs/confidence-guardrails.md`. Don't add a way around it.

The corollary: nothing a student sees as fact may come from model output. Citations are rebuilt
from the stored database row — the model picks *which* chunk, never *what the citation says*.

## Syllabus Crawler

FBISE model papers, past papers, and (where available) textbooks are automatically downloaded,
parsed, and ingested on a **weekly schedule via GitHub Actions**.

### How it works

```
crawl-sources.json → download PDFs → pdf-parse (text) or Tesseract OCR (scanned)
  → SourceDocument JSON → data/source/ → npm run ingest → Supabase
```

- **Checksum dedup** — only re-processes PDFs whose SHA-256 has changed since the last run.
  Unchanged papers cost zero API calls.
- **Dual extraction** — tries direct text extraction first; falls back to OCR automatically for
  scanned image PDFs.
- **Manifest-driven** — add a new URL to `data/crawl-sources.json` and it's picked up on the
  next run.

### Commands

```bash
npm run crawl              # full crawl + ingest (production)
npm run crawl:dry          # download + parse only; inspect data/source/ before spending API quota
npm run crawl -- --force   # reprocess all PDFs even if checksums match
npm run crawl -- --limit 2 # process at most 2 sources (for quick testing)
```

### Adding a new source

Append an entry to [`data/crawl-sources.json`](data/crawl-sources.json):

```json
{
  "url": "https://www.fbise.edu.pk/model-paper/SSC-I/Economics.pdf",
  "board": "FBISE",
  "classLevel": 9,
  "subject": "economics",
  "sourceType": "model_paper",
  "language": "en",
  "year": null,
  "checksum": null
}
```

### Manual trigger

Go to **Actions → Weekly FBISE Syllabus Crawl → Run workflow** in the GitHub UI.
You can pass `dry_run=true` to test without spending embedding quota.

### Required GitHub Secrets

| Secret | Purpose |
|---|---|
| `SUPABASE_URL` | Same as `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | Same as `.env.local` |
| `EMBEDDING_API_KEY` | Same as `.env.local` |

## Folder map

```
src/app/          pages + API routes (api/ask, api/quiz, api/eval, api/syllabus, api/auth)
src/lib/ai/       retrieval, guardrail, generation, citation
src/prompts/      the LLM prompts (kept out of route files)
scripts/          ingest.ts, eval.ts, dev-db-sql.mjs (direct DB runner), verify-embeddings.mjs
data/source/      your textbook/past-paper text (never committed)
src/lib/evaluation/  the labelled question set (single source of truth)
supabase/         database migrations (0001–0005) + schema torture tests
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
