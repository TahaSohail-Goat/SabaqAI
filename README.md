<div align="center">

<img src="src/app/icon.svg" width="84" height="84" alt="Sabaq AI logo" />

# Sabaq AI

**A syllabus-grounded AI study companion for Pakistani board students.**

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=500&size=20&pause=1200&color=1BB56B&center=true&vCenter=true&width=680&lines=Answers+strictly+from+the+student's+own+syllabus;Cites+the+exact+chapter+and+page%2C+every+time;Refuses+honestly+instead+of+guessing;English%2C+Urdu%2C+and+Roman+Urdu" alt="What Sabaq AI does, animated" />

[![Live demo](https://img.shields.io/badge/demo-live-1BB56B?style=flat-square&logo=vercel&logoColor=white)](https://sabaq-ai-three.vercel.app)
[![CI](https://img.shields.io/github/actions/workflow/status/TahaSohail-Goat/SabaqAI/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/TahaSohail-Goat/SabaqAI/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-1BB56B?style=flat-square)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js&logoColor=white)](package.json)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square&logo=node.js&logoColor=white)](package.json)
[![Last commit](https://img.shields.io/github/last-commit/TahaSohail-Goat/SabaqAI?style=flat-square&color=1BB56B)](https://github.com/TahaSohail-Goat/SabaqAI/commits/main)

Built for the **Bano Qabil AI Hackathon 2026** (Education category).

</div>

---

### Contents

[Why](#why) · [What it does](#what-it-does) · [Content scope](#content-scope) ·
[How grounding works](#how-grounding-works) · [Stack](#stack) · [Run it locally](#run-it-locally) ·
[Folder map](#folder-map) · [Syllabus crawler](#syllabus-crawler) · [Docs](#docs) ·
[Contributing](#contributing) · [Changelog](#changelog) · [License](#license)

## Why

Board exams are marked against one specific textbook. General AI chatbots answer from a global
corpus — often right in general, wrong for the exam, and occasionally invented outright. A student
has no way to tell a correct-for-exam answer from a merely plausible one, and gets no signal about
what they're actually weak on. Sabaq AI grounds every answer in the real syllabus, cites the page,
and refuses honestly instead of guessing.

## What it does

| Feature | What it is |
| --- | --- |
| **Doubts (Ask)** | Grounded Q&A over the real textbook/past-paper corpus, with a page citation the student can check in their own book. A confidence gate blocks the LLM call entirely when retrieval similarity is too low — the app says the topic isn't covered rather than answering anyway. |
| **Chat** | Open-ended tutoring conversation with history, including Urdu voice input (speech-to-text via Whisper/Groq). |
| **Quiz** | Chapter-scoped MCQ/short/long-answer quizzes generated from real content, graded server-side with explanations tied back to source chunks. Resumable drafts and full history. |
| **Progress** | Per-chapter mastery, computed live from actual quiz attempts — not a hardcoded number. |
| **Plan** | A day-by-day revision schedule built around an exam date. Deterministic, not LLM-generated — recomputed fresh on every load from current mastery, so it reprioritizes automatically as a student improves. |
| **Syllabus** | Every ingested chapter, past paper, and model paper, with an embedded reader showing the real source PDF (not a reconstruction). |
| **Explore** | A 3D subject picker (three.js) — a discovery layer on top of Ask. |

Auth supports email/password (with OTP email verification) and Google OAuth.

## Content scope

FBISE board, classes 9–12. Past papers and model papers are ingested across all nine subjects at
every class level; full textbooks are verified live for Physics, Chemistry, Biology, and
Mathematics (classes 9–10), with additional subjects and the HSSC (11–12) textbooks ingested in
code and expanding. The board/class/subject schema is curriculum-agnostic — adding another board
or class is a content-ingestion exercise, not a rebuild. `docs/project-status.md` has the current
verified-vs-in-progress breakdown.

## How grounding works

```
question
  → normalise (Roman Urdu → Urdu script where needed)
  → embed (Jina AI, jina-embeddings-v3)
  → vector search over the corpus, filtered by board + class + subject  (Supabase pgvector)
  → score
  → GUARDRAIL ── REFUSE → refusal + nearest chapters shown   [LLM never called]
             └── PASS / BORDERLINE
                   → prompt built only from retrieved chunks
                   → Gemini returns an answer with chunk-ID citations
                   → citations validated server-side against the retrieved set
                   → answer + citation shown to the student
```

The rule that matters: **when the guardrail says refuse, the LLM is not called at all.** Nothing a
student sees as fact comes from unconstrained model output — the model picks *which* retrieved
chunk to cite, never *what the citation says*. Detail in `docs/rag-architecture.md` and
`docs/confidence-guardrails.md`.

## Stack

| Part | Choice |
| --- | --- |
| App | Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind |
| Database | Supabase — Postgres + pgvector + Auth + Storage |
| Embeddings | Jina AI `jina-embeddings-v3` (1024-dim), through an OpenAI-compatible client |
| Generation | Google Gemini |
| Voice | Whisper via Groq |
| 3D | three.js + react-three-fiber + gsap |
| Hosting | Vercel |

One Next.js app end to end — API routes are the backend, no separate service, no monorepo.

## Run it locally

```bash
npm install
cp .env.example .env       # fill in your keys — see docs/setup.md
npm run dev                # http://localhost:3000
```

Requires Node 20+. `npm run lint` type-checks; CI runs install → lint → build on every push and PR.

To ingest your own content into an empty database:

```bash
npm run crawl               # download + parse/OCR source PDFs → data/source/
npm run ingest               # embed data/source/*.json → Supabase
```

A weekly GitHub Action (`.github/workflows/weekly-crawl.yml`) keeps the FBISE corpus current
automatically — see [Syllabus crawler](#syllabus-crawler) below.

## Folder map

<details>
<summary>Expand</summary>

```
src/app/(app)/     the app shell: dashboard, doubts, chat, quiz, syllabus, explore, settings
src/app/api/        every backend route (ask, quiz, dashboard, chat, explore, auth)
src/lib/ai/          retrieval, guardrail, generation, embeddings
src/lib/mastery.ts   shared mastery computation (used by Progress and Plan)
src/prompts/         the LLM prompts, kept out of route files
scripts/             ingest.ts, crawl.ts
data/                crawl manifest + source docs (never committed)
supabase/migrations/ full schema history
docs/                architecture, setup, and submission docs
```

</details>

## Syllabus crawler

FBISE model papers, past papers, and (where available) textbooks are downloaded, parsed, and
ingested automatically on a weekly schedule via GitHub Actions.

```
data/crawl-sources.json → download PDFs → pdf-parse (text) or Tesseract OCR (scanned)
  → SourceDocument JSON → data/source/ → npm run ingest → Supabase
```

- **Checksum dedup** — only re-processes PDFs whose SHA-256 changed since the last run.
- **Dual extraction** — direct text extraction first, OCR fallback for scanned pages.
- **Manifest-driven** — add a URL to `data/crawl-sources.json` and it's picked up automatically.

```bash
npm run crawl              # full crawl + ingest
npm run crawl:dry          # download + parse only, no ingestion
npm run crawl -- --force   # reprocess everything regardless of checksum
npm run crawl -- --limit 2 # process at most 2 sources, for quick testing
```

Manual trigger: **Actions → Weekly FBISE Syllabus Crawl → Run workflow** (supports `dry_run=true`).
Requires the `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `EMBEDDING_API_KEY` repo secrets.

## Docs

<details>
<summary>Expand</summary>

| File | What's in it |
| --- | --- |
| `docs/setup.md` | Accounts, keys, first run |
| `docs/api-spec.md` | Endpoint reference |
| `docs/rag-architecture.md` | How retrieval and grounding work |
| `docs/confidence-guardrails.md` | The refusal gate |
| `docs/database.md` | Schema, indexes, RLS |
| `docs/submission.md` | Hackathon submission brief |

Some docs under `docs/` (`project-status.md`, `build-plan.md`) are working notes from early
development and describe an earlier, mostly-stubbed state of the project — the feature list above
reflects what's actually live today.

</details>

## Contributing

Bug reports and PRs are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first — it covers setup,
the non-negotiable product invariants (things like "the LLM is never called on refuse"), and what
CI checks before a PR can merge. AI coding agents should read [AGENTS.md](AGENTS.md) instead — the
fuller version this guide is derived from.

## Changelog

Every notable change, grouped by day and drawn directly from merged PRs, lives in
[CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) © 2026 Taha Sohail
