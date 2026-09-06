# Contributing to Sabaq AI

Thanks for looking at the code. This is a fast-moving hackathon project (Bano Qabil AI Hackathon
2026), so this guide favors the few rules that actually matter over process for its own sake.

If you're an AI coding agent, read [AGENTS.md](AGENTS.md) first — it's the fuller, load-bearing
version of this document and takes precedence if the two ever disagree.

## Before you start

1. Read `docs/project-status.md` to see what's real versus stubbed right now.
2. Skim the **non-negotiable invariants** below. If what you're about to build conflicts with
   one of them, stop and raise it before writing code — don't work around it quietly.

## Setup

```bash
git clone https://github.com/TahaSohail-Goat/SabaqAI.git
cd SabaqAI
npm install
cp .env.example .env       # fill in your keys — see docs/setup.md
npm run dev                # http://localhost:3000
```

Node 20+, npm (not pnpm or bun — the lockfile is npm's).

## The non-negotiable invariants

These are the product, not implementation detail. A change that violates one of them is wrong
even if it passes every check and makes a demo smoother:

- **On REFUSE, the LLM is never called.** `evaluateConfidence()` decides before generation runs.
  There is no flag that disables this, and none should be added.
- **The gate fails closed.** Any error, any missing filter, any unexpected state resolves to
  refusal — never to a pass.
- **Never fabricate an answer when generation is unavailable.** If the model errors or has no
  key, the route refuses. Do not synthesize an answer from retrieved text as a "fallback" — it
  renders as a real cited answer while ignoring the question.
- **Nothing a student sees as fact comes from model output.** The model picks *which* retrieved
  chunk to cite; chapter, page, section, and excerpt are always rebuilt server-side from the
  stored row, never taken from what the model wrote.
- **Invalid citations are discarded, never reassigned.** If the model cites a chunk id that
  wasn't actually retrieved, drop the statement — don't substitute a real chunk in its place.
- **Retrieval is always filtered by board + class + subject.** An unfiltered search silently
  pulls the wrong curriculum.
- **No hardcoded claims about the system's own accuracy**, anywhere — UI, docs, or a response
  payload. Every metric shown must come from `/api/eval` run against live retrieval.
- **"Nearest chapters" is always computed from real scores for that question**, never a fixed
  list.

The full detail behind each of these — including a documented, real near-miss failure we
deliberately keep visible instead of quietly fixing the demo — is in `AGENTS.md`.

## Making a change

1. Branch off `main`. Branch names are free-form but descriptive (`feature/...`, `fix/...`,
   `docs/...` are the common prefixes in this repo's history).
2. Match the surrounding style. No new component library, no new CSS framework — Tailwind is
   already set up. Don't add a new dependency to solve something the existing stack already
   covers.
3. Comment only the non-obvious *why* (a constraint, an invariant, a workaround for a specific
   bug) — not what the code already says through naming.
4. If you touch a shared type or a route's response shape, update `src/lib/types.ts` and
   `docs/api-spec.md` together, not just one call site.
5. If you make a stubbed subsystem real, update `docs/project-status.md` in the same change — a
   status doc that drifts from reality is worse than no status doc.

## Before opening a PR

```bash
npm run lint     # tsc --noEmit — this IS the lint step
npm run build    # required if you touched anything under src/app/
```

Both also run in CI on every push and PR (`.github/workflows/ci.yml`) — a red check blocks
merge, so run them locally first.

**Type-checking is not verification.** It catches typos, not a broken flow. If you touched
anything user-facing, run it for real against a dev server before calling it done — this project
was built end-to-end with real accounts against a real Supabase instance, not assumed-correct
from reading the diff.

Fill out the PR template's checklist honestly, in particular:

- [ ] This was run against real data/services, not just read and assumed correct
- [ ] None of the invariants above were weakened

## Commit messages

Plain, imperative, present tense (`Add`, `Fix`, `Remove`, not `Added`/`Fixes`). State what
changed and, if it isn't obvious from the diff, why — not a changelog of every file touched.

## Questions

Open an issue, or check `docs/` — `docs/setup.md`, `docs/api-spec.md`, `docs/rag-architecture.md`,
and `docs/confidence-guardrails.md` cover most "how does X work" questions already.
