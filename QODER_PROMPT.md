# Qoder kickoff prompt

Paste everything below the line into Qoder as your first message when you open this repo. It's a
fixed sequence: read these files in this exact order, run these commands, then stop and summarize
before touching any code. Don't skip ahead to implementation — every later step assumes the
context from the ones before it.

If you're a teammate rather than pasting this into an agent: read it the same way, in the same
order. It works as a human onboarding path too.

---

You're working in the Sabaq AI repository — a syllabus-grounded AI tutor for Pakistani board
students, built for the Bano Qabil AI Hackathon 2026 (Education category). Before writing or
changing any code, build full context by working through this repo end to end, in this order:

**1. Orientation — read, don't skim:**
- `HANDOFF.md` — what this project is, why it exists, and the honest current state.
- `AGENTS.md` — the non-negotiable invariants and file map. These rules override anything that
  seems locally reasonable; if you're about to write code that conflicts with one of them, stop
  and say so instead of proceeding.

**2. Establish the baseline before assuming anything works:**
```bash
npm install
npm run lint     # tsc --noEmit
npm run build
```
Both must pass on a clean checkout. If `npm run build` fails with `spawn UNKNOWN` on Windows, that's
a stale `.next` cache, not a code problem — `rm -rf .next` and rebuild.

**3. Read the status tracker, not just the code:**
- `docs/project-status.md` — a row-by-row account of what's real, what's stubbed, and what's
  written-but-never-run-against-a-live-service. Trust this over your own read of the source; it's
  updated every time something changes state.

**4. Read the system design, in this order (each builds on the last):**
- `docs/database.md` — the schema: `users`, `student_profiles`, `content_chunks`, `qa_log`,
  `quizzes` / `quiz_questions` / `quiz_attempts`, and why RLS is on.
- `docs/rag-architecture.md` — how a question becomes an answer or a refusal: normalize → embed →
  retrieve → gate → generate → validate citations.
- `docs/confidence-guardrails.md` — the gate itself. This is the core of the product; read it
  slowly. The one rule that must never break: **on REFUSE, the LLM is never called.**
- `docs/api-spec.md` — every route's actual request/response shape, including the two that changed
  this session: `/api/quiz` no longer ships answers to the browser, and `/api/quiz/grade` grades
  server-side against an encrypted token.
- `docs/evaluation.md` — what the four metrics mean, and why the near-miss question set
  (`nm-001`…`nm-004` in `src/lib/evaluation/questions.ts`) matters more than the easy off-syllabus
  ones. It already caught a real leak — read what it found before you touch thresholds.

**5. Walk the actual code, cross-referencing against what you just read:**
- `src/lib/types.ts` — every shared shape the app agrees on.
- `src/lib/ai/guardrail.ts`, `src/lib/ai/retrieval.ts`, `src/lib/ai/generation.ts`,
  `src/lib/ai/citation.ts` — the core pipeline, in call order.
- `src/lib/ai/embeddings.ts` — the Qwen/DashScope client. Note the dimension-mismatch guard; that
  error message exists because it's the single most common silent failure in this kind of system.
- `src/lib/ingest/chunker.ts` and `scripts/ingest.ts` — recursive chunking and the ingestion
  pipeline. Neither has ever run against real content — that's your first real task, see step 7.
- `src/lib/supabase/admin.ts` — the service-role client, and *why* retrieval needs it (read the
  comment; it explains the RLS trap this avoids).
- `src/lib/quiz/answer-key.ts` — AES-256-GCM sealing so quiz answers never reach the browser
  unencrypted. If you ever touch this file, it must stay encrypted, not just signed — a
  signed-but-decodable token would silently reintroduce the exact bug it fixes.
- `src/app/api/ask/route.ts` — read this one closely; it's the composition of everything above,
  and it's the route every other route pattern-matches against.
- `src/app/page.tsx` — the current UI. Skim for structure; you don't need to memorize it.

**6. Read the environment contract:**
- `.env.example` — every variable, with a comment explaining what breaks if it's wrong. Note
  `EMBEDDING_DIM` and `vector(1024)` in `supabase/migrations/0001_init.sql` must always agree.
- `docs/setup.md` — how to actually provision Supabase, DashScope, Gemini, and Groq.

**7. Now, and only now, look at the work itself:**
- `AGENTS.md`'s "The remaining work, in order" section has the authoritative task list. In brief:
  provision Supabase + DashScope → ingest real content → verify retrieval actually takes the
  pgvector path (not the local keyword fallback) → recalibrate thresholds against real scores →
  fix the measured near-miss leak → persist quizzes to the database → Urdu voice input.
- Do not reorder these. Step 2 (real content) has to land before step 4 (recalibration) means
  anything, and step 5 can't be judged as fixed until step 4 is done with a real corpus.

**Before you write a single line of code**, summarize back in your own words: what's real, what's
stubbed, what the guardrail's one inviolable rule is, and which of the seven remaining steps you're
starting with. If that summary doesn't match what you just read, re-read rather than proceed —
this system's entire value proposition is not silently getting something wrong.
