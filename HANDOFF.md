# Start here

You're picking up **Sabaq AI** — read this first, whether you're a teammate joining the project or
an agent (Qoder or otherwise) about to start work on it. It's a briefing, not a rulebook: for the
actual coding rules and invariants, this hands off to **`AGENTS.md`** — if anything here and
`AGENTS.md` ever disagree, `AGENTS.md` wins, since it's the one enforced during coding.

## Before you do anything else

**Check `git status`.** As of this handoff, a large batch of fixes and new docs exist in the
working tree and may not be committed yet. If you're opening this in a different environment (a
fresh clone, a different machine, Qoder's own workspace), uncommitted work won't be there —
confirm the commit landed before you start building on top of it.

## What this is

Sabaq AI is a syllabus-grounded AI tutor for Pakistani board students. It answers questions only
from the ingested textbook content for a student's board/class/subject, cites the exact chapter and
page, and **refuses instead of guessing** when retrieval confidence is too low — the LLM is never
even called on a refusal. Built for the **Bano Qabil AI Hackathon 2026** (Education category);
Alibaba Cloud is the title sponsor, which is why embeddings run on Qwen via DashScope rather than a
second Gemini call.

One Next.js app. No monorepo, no separate backend, no Docker. `npm run dev` and it runs.

## The state of the repo, honestly

Everything is now **real code that type-checks and builds** — no more `console.log` theater, no
more hardcoded scores, no more answers fabricated on failure. But most of the backend has **never
executed against a live Supabase or DashScope service**, because nobody has provisioned either yet.
Written and correct is not the same as verified. `docs/project-status.md` is the authoritative,
row-by-row tracker of what's real, what's stubbed, and what's untested — read it before assuming
anything works, and update it the moment you make something true.

One thing worth knowing up front: the evaluation set includes **near-miss** questions (same
subject, wrong syllabus — e.g. Class 9/11 physics against a Class 10 corpus), and they already
caught a real leak. `nm-003` scores 0.709 on the keyword fallback and gets **answered** when it
should refuse. That's not a bug to silently fix by deleting the question — it's the guardrail
doing its job by surfacing exactly the failure mode this product exists to prevent. Fix it by
recalibrating thresholds against the real corpus, not by softening the test.

## What you're being asked to do next

In order — each step unblocks the next, so don't skip ahead:

1. **Provision.** Supabase project, run `supabase/migrations/0001_init.sql` then
   `0002_match_function.sql`. DashScope API key. Confirm `text-embedding-v3` actually returns 1024
   dimensions before ingesting anything — a mismatch fails inserts with an error that never
   mentions the model.
2. **Ingest real content.** Convert chapters into the `SourceDocument` JSON shape described in
   `data/source/README.md`, dry-run the chunker (`npm run ingest -- --dry-run`), then ingest for
   real. Verify with `select count(*) from content_chunks` — don't trust the script's own success
   message.
3. **Verify retrieval end-to-end.** With Supabase configured, `retrieve()` in
   `src/lib/ai/retrieval.ts` takes the pgvector path automatically. Confirm real scores come back
   and the `[retrieval]` fallback warning does **not** appear in the logs.
4. **Recalibrate the confidence thresholds** against real scores — `docs/evaluation.md` has the
   procedure. The current `.env.example` values are guesses made before any real corpus existed.
5. **Fix the near-miss leak** described above, using real calibration, not by touching the test set.
6. **Persist quizzes** to `quizzes` / `quiz_questions` / `quiz_attempts` (currently unused tables).
   Once a quiz has a real id, grading can look the answer key up by id and
   `src/lib/quiz/answer-key.ts` becomes unnecessary.
7. **Urdu voice input** via Groq `whisper-large-v3` — the text input must stay visible and usable at
   all times; voice is an accelerator, never the only path in.

The full version of this list, with file paths and the traps specific to each step, is in
`AGENTS.md` under "The remaining work, in order."

## Non-negotiables (do not touch these without stopping to think)

The full list of eight is in `AGENTS.md`. The three that matter most:

- **On REFUSE, the LLM is never called.** Not with a shorter prompt, not with a warning. There is
  no config flag for this and there must never be one.
- **Never fabricate an answer when generation is unavailable.** Return `answerable: false` and let
  the route refuse. This exact bug existed once this session and was deliberately removed — see
  `docs/project-status.md`'s "Fixed" section for what it looked like and why it was dangerous.
- **Nothing a student sees as fact comes from model output.** Citations are always rebuilt from the
  stored database row. The model picks *which* chunk; it never writes *what the citation says*.

## Map of the docs

| Doc | Read it when |
| --- | --- |
| `AGENTS.md` | Before writing any code. The actual rules, file map, and traps. |
| `docs/project-status.md` | Before assuming any subsystem works. |
| `docs/setup.md` | Setting up Supabase, DashScope, Gemini, Groq keys. |
| `docs/api-spec.md` | Before touching any route's request/response shape. |
| `docs/rag-architecture.md` | Before touching retrieval, chunking, or citation logic. |
| `docs/confidence-guardrails.md` | Before touching the gate or thresholds. |
| `docs/database.md` | Schema, indexes, RLS — what each table is for. |
| `docs/evaluation.md` | Before touching eval or quoting any metric. |
| `docs/build-plan.md` | The 7-day plan and who's meant to own what. |
| `docs/demo-script.md` | Preparing the live pitch. |
| `docs/submission.md` | The hackathon brief and judge Q&A. |
| `docs/ci-cd.md` | Reading a failed GitHub Actions run in plain language. |

## If you're a human teammate rather than an agent

`docs/build-plan.md` has the day-by-day plan and the four-way ownership split (retrieval/guardrail,
UI/voice, ingestion/content, eval/deploy/pitch). `docs/demo-script.md` and `docs/submission.md` are
what you'll actually stand up and say — read them well before the deadline, not the night before.

## Environment

```bash
npm install
cp .env.example .env.local   # fill in keys — see docs/setup.md
npm run ingest                # after Supabase + DashScope are configured
npm run dev
npm run lint                  # tsc --noEmit — run this before considering anything done
npm run eval                  # retrieval + refusal metrics, once content is ingested
```

## Definition of done for whatever you pick up first

- `npm run lint` passes.
- `npm run build` passes (a Windows `spawn UNKNOWN` on first try is a stale `.next` cache — `rm -rf
  .next` and rebuild, not a code problem).
- No non-negotiable above was weakened.
- You ran the thing and looked at the output — not just read the code and assumed.
- `docs/project-status.md` reflects what's now true.
