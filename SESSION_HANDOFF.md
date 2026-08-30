# Sabaq AI — Session Handoff

Written to let a fresh Claude session pick up exactly where this one left off, with no access
to prior conversation history. Read this fully before touching code.

## What Sabaq AI is

A RAG-based study assistant for Pakistani FBISE board students (classes 9–12). Students ask
questions grounded in ingested past-paper content (`/ask`), take auto-generated quizzes
(`/quiz`), browse ingested syllabus content (`/syllabus`), and use an open (ungrounded)
ChatGPT-style chat with voice input/output and file attachments (`/chat`). Next.js 16.3.3 App
Router + Turbopack, TypeScript, Tailwind v4, Supabase (Postgres + pgvector + auth), Gemini for
generation, Jina for embeddings, Groq for Whisper STT and fast text chat.

This is being built for a hackathon — favor working, verified features over polish on anything
not yet built. **Login and signup are considered done — do not touch them unless explicitly
asked.**

## Current state (as of this handoff)

- Branch: `feat/settings-quiz-chat-and-fbise-corpus`, pushed to origin, **not yet merged to
  `main`**, no PR opened yet. Working tree is clean (everything described below is committed).
- Full FBISE corpus is ingested: 33 source documents (grades 9–12 × up to 9 subjects), **1046
  content chunks** in Supabase, verified via direct row counts.
- `npx tsc --noEmit` is clean. This repo's `lint` script IS `tsc --noEmit` — there is no ESLint
  step. Always run this after any change before considering it done.
- Every feature below was verified live against the real dev server (not just type-checked) —
  see "How this session verified things" for the pattern to keep using.

## What's been built, by area

### Auth / account (settings work only — login/signup untouched)
- `src/app/(app)/settings/page.tsx` — editable profile (username/class/exam date), change
  password, **hard-delete account** (immediate, no soft-delete — this was an explicit user
  decision for the hackathon demo), active-subject picker.
- New routes: `/api/auth/profile`, `/api/auth/change-password`, `/api/auth/delete-account`.
- `src/lib/subjects.ts` — single source of truth for all 9 subjects (`physics`, `chemistry`,
  `biology`, `mathematics`, `english`, `urdu`, `computer_science`, `islamiyat`,
  `pakistan_studies`). This used to be duplicated across 5 files with only 6 subjects each
  (drifted from what the crawler actually covers) — now everything imports from here. If you add
  a subject, this is the only file to touch (plus a `subjects` table migration).

### Quiz
- `src/lib/quiz/persist.ts` + rewritten `src/app/api/quiz/route.ts` and
  `src/app/api/quiz/grade/route.ts` — quizzes and attempts are now real DB rows
  (`quizzes`/`quiz_questions`/`quiz_options`/`quiz_answer_keys`/`quiz_attempts`/
  `quiz_attempt_answers`), not just signed tokens. Falls back to the old signed-token approach
  only when persistence isn't possible (no logged-in user, no admin client).
- Live quiz generation is grounded against real ingested `content_chunks_expanded`, not a
  hardcoded stub corpus. `board` defaults to `'FBISE'` everywhere now (was `'PCTB'`, a leftover
  stub default that was actively wrong).

### Chat (`/chat`) — the most-changed area this session
- **Persistence**: `chat_conversations` / `chat_messages` tables (migration `0008`), multi-
  conversation history with a ChatGPT-style sidebar (`ChatConversationList.tsx`).
- **Streaming + interrupt**: `/api/chat` returns a raw streamed text body (conversation id via
  an `X-Conversation-Id` response header, not a JSON envelope) instead of one-shot JSON. A Stop
  button appears while Sabaq is replying; clicking it aborts client-side (`AbortController`) and
  the abort signal is wired through to the actual Gemini/Groq call server-side too.
  - **Known-fixed bug, worth remembering the shape of**: the first version of the interrupt
    persistence silently lost partial replies. Root cause: `controller.close()` throws once the
    client has disconnected, and that throw sat *before* the `appendMessages(...)` persistence
    call in the same `finally` block — so the throw skipped persistence entirely. Fixed by
    wrapping `controller.enqueue`/`controller.close` in try/catch so persistence always runs
    regardless of the stream controller's state. See `src/app/api/chat/route.ts`'s `safeEnqueue`
    and the comment above it. If you touch this file again, preserve that comment — it's there
    because the failure mode is easy to reintroduce by accident.
- **Model picker**: `src/lib/chat/models.ts` (`CHAT_MODELS` registry) +
  `src/components/app/ChatModelSelector.tsx` (custom rounded-pill dropdown, NOT a native
  `<select>` — was rebuilt to match the app's visual theme after explicit user feedback that the
  native select didn't look "curved and themed" enough).
  - Default: `gemini-3.5-flash-lite`. Also offered: `openai/gpt-oss-120b` (Groq, fastest, text-
    only — no image/PDF support) and `gemini-3.6-flash` (smarter, ~30s/reply, attachments OK).
  - **Why `-lite`, not the full model**: direct timing against the live Gemini API showed
    `gemini-3.6-flash` takes **30–36 seconds per reply** even at the lowest thinking level,
    versus **under 1–2.5 seconds** for `gemini-3.5-flash-lite`. This wasn't a config problem to
    tune away — the heavier model is just that much slower. `CHAT_MODEL` in `.env` (shared
    fallback default for Ask/Quiz/Chat) was switched to `gemini-3.5-flash-lite` for this reason.
    If a future "the AI is slow" complaint comes in, check which model is actually selected
    before assuming it's a code bug.
  - Attaching a file auto-switches away from Groq (text-only) client-side, and the server
    independently 400s the same combination if someone bypasses the client.
- **Profile awareness**: the system prompt (`src/prompts/chat.ts`) is now built from the
  student's real profile (name/board/class/subjects/exam date), fetched server-side via
  `getCurrentUserAndProfile()`. Chat can answer "what's my name" correctly without being told in
  the conversation. If a profile field is missing, the prompt degrades gracefully rather than
  producing an awkward sentence.
- **Math/physics notation**: the system prompt has an explicit carve-out so equations render as
  `(x + 7)(x − 3) = −7`, not spelled out in words ("x plus seven..."). This was a real UX
  complaint — the original "write as you'd speak" prose instruction was being over-applied to
  math. If you edit this prompt, keep both rules (plain prose for narration, real notation for
  math) — don't collapse them back into one instruction.
- **Voice input (STT)**: mic button records via `MediaRecorder`, uploads to
  `/api/chat/transcribe`, which calls Groq Whisper (`STT_MODEL=whisper-large-v3`) and — this was
  an explicit user correction — **auto-sends the transcribed text immediately** rather than just
  filling the input box. Any text already typed is prepended to the transcript first, not
  discarded.
- **Voice output (TTS)**: `src/lib/tts.ts`, browser-native `SpeechSynthesisUtterance`, no API
  key/server round-trip. Tuned to `pitch: 0.92, rate: 0.93` and prefers better-sounding voice
  names when the browser exposes them, in response to "the voice is too harsh" feedback.
  - **An EN/Urdu language toggle for TTS was built, then explicitly reverted** — the user asked
    for it, it was fully implemented and verified (pill toggle next to the model picker,
    localStorage-persisted), then in the very next message asked to remove it. It's gone now
    (`speak()` takes no language parameter, always picks an English voice). **Do not re-add this
    without being asked again** — it was tried and explicitly rejected, not abandoned half-built.
  - The Stop-generating button's icon was reported as "white icon blurred" — root cause was a
    Lucide `<Square>` icon with both `stroke` and `fill-current` layered at 16px, which
    anti-aliased into a fuzzy shape. Fixed by replacing it with a plain solid `<span>` (a 12px
    div with `rounded-[3px] bg-white`) instead of an SVG icon. If you add more small icon-only
    buttons, prefer plain shapes over stroke+fill combos at small sizes.

### Ingestion / crawler
- `scripts/ingest.ts` didn't load `.env` at all when run standalone via `tsx` (Next.js's
  automatic env loading only happens inside the Next.js runtime) — fixed via
  `process.loadEnvFile()`, added right after imports (safe because every env read in
  `admin.ts`/`embeddings.ts` happens lazily inside function bodies, not at module top-level).
- `data/crawl-sources.json` covers 9 subjects but `subjects` table only had 6 seeded — fixed via
  migration `0009_missing_subjects.sql`. If you ever reset the DB from scratch, migrations
  `0007`, `0008`, `0009` must all be (re-)applied, in order, before ingesting.
- Ingestion is idempotent (content-hash based) — safe to re-run `npm run ingest` any time; it
  skips chunks already stored. Jina's free-tier embedding quota is ~100K tokens/minute, so a
  full from-scratch ingest of all 33 sources needs to be run in 4–5 waves with ~75s waits between
  429s. This already happened once this session; the corpus is fully in place now, so this only
  matters again if new source documents are added.

## Non-obvious project conventions (violate these deliberately, not by accident)

- **RLS is deny-by-default** on internal tables (`content_chunks`, `chapters`, etc.) — no
  policies exist, service-role client only. `qa_log`, `quizzes`, `quiz_attempts` have real RLS
  protecting actual student records. See `src/lib/supabase/admin.ts`'s header comment for why.
- **`quizzes.chapter_id` deliberately has no `on delete cascade`** — quiz history should survive
  corpus/chapter changes. Every other FK in the schema does cascade.
- **Chat's `ChatTurn` history replays attachment bytes only for the CURRENT turn** — prior turns
  keep `attachmentName`/`attachmentMimeType` as metadata but never resend the base64 bytes, so a
  long conversation with several images doesn't compound into megabytes per request.
- **No markdown renderer is installed anywhere in this app.** Chat's system prompt explicitly
  tells Gemini/Groq to reply in plain prose (no `#`, no `**bold**`, no code fences, no LaTeX) —
  the one exception is real math/physics notation (see above). If you ever add markdown
  rendering, this prompt instruction becomes obsolete and should be revisited, not just left in
  place.
- **`CHAT_MODEL` in `.env` is a shared fallback** used by Ask, Quiz, and as Chat's *default*
  model id (Chat's per-message model choice from `CHAT_MODELS` in `src/lib/chat/models.ts`
  otherwise overrides it). Changing `.env`'s `CHAT_MODEL` affects Ask and Quiz directly, and only
  changes Chat's default (not the other two picker options).
- **Windows dev environment specifics**: shell is PowerShell primarily, but a Bash tool
  (Git Bash / POSIX sh) is also available and was used for most of this session's work — pick
  whichever fits the command's syntax. `dangerouslyDisableSandbox: true` is required for both
  running the dev server AND any tool call that needs to reach it (curl, Playwright, etc.),
  because the dev server runs outside the sandbox. The dev server is started manually (not via
  a tracked process) — check with `netstat -ano | grep ":3000"` and `taskkill //PID <pid> //F`
  before restarting it, then `npm run dev` with `run_in_background: true`.
- **A known Windows/Turbopack quirk**: after certain restarts the dev server can throw a stale
  HMR error on the very first compile ("export X was not found in module Y") even when the code
  is correct — this clears itself on the next successful compile and isn't a real bug. If it
  persists, `rm -rf .next` and restart.

## How this session verified things (keep doing this)

For every feature, a throwaway Supabase test account was created via the admin API
(`supabase.auth.admin.createUser`), used to verify the feature end-to-end (via `curl` for pure
API checks, or Playwright for anything requiring real browser behavior — MediaRecorder,
AbortController, speechSynthesis, DOM state), then the test account was deleted afterward
(`supabase.auth.admin.deleteUser`) along with any scratch scripts. Never claim a feature works
without this kind of live verification — type-checking alone was consistently not enough to
catch real bugs this session (e.g. the interrupt-persistence bug above was only caught by
querying the database after a Playwright-driven interrupt, not by reading the code).

Playwright itself isn't a project dependency — it's available via a global npx cache at
`AppData/Local/npm-cache/_npx/<hash>/node_modules/playwright`. Scratch test scripts need to be
copied into that directory (not run from the project directory) for Node's module resolution to
find the `playwright` package, since plain `node script.mjs` doesn't do npx-style resolution.

## Explicit user decisions already made (do not re-litigate)

- STT: Groq Whisper. TTS: browser Web Speech API. Both confirmed via AskUserQuestion earlier in
  this project's life.
- Chat history: persistent, multi-conversation (not session-only) — this was actually a
  **change of plan** mid-project; an earlier plan file explicitly said "session-only, no DB
  table" and was superseded by this decision. If you find old planning docs referencing
  session-only chat, they're stale.
- Account deletion: hard delete immediately, no soft-delete/grace period — chosen for hackathon
  demo simplicity.
- Voice input auto-sends on transcription completion (not just filling the input box) —
  explicit user correction after the first implementation only filled the box.
- The EN/Urdu TTS language toggle: built, then explicitly removed. See above — don't rebuild
  without being asked.
- Subject count: expanded from 6 to 9 — user explicitly said "yes, good to have 9 subjects."

## Known-open items / not yet done

- **No PR opened yet** for `feat/settings-quiz-chat-and-fbise-corpus` → `main`. Branch is pushed.
- Syllabus page's fuller filter/search/chapter-grouping UI was explicitly deferred to "its own
  checkpoint" early in this project — only the hardcoded-scope bug (PCTB stub defaults) was
  fixed. The richer UI was never built.
- No formal accuracy/confidence-gate calibration has been done against the now-complete real
  corpus (`docs/evaluation.md` mentions this as a Day 6 task — the `PASS_TOP1`/`BORDERLINE_TOP1`
  values in `.env` are still starting guesses, not calibrated against real ingested content).
- Ask and Quiz's live generation now use `gemini-3.5-flash-lite` by inheriting `CHAT_MODEL`, but
  neither has its own model picker the way Chat does — if that's wanted, it doesn't exist yet.
- Deployment was explicitly out of scope for this whole project per the original request.

## Environment

`.env` (not `.env.local` — this repo deliberately uses `.env`, unlike the placeholder text in
`.env.example`'s header comment, which is stale) is fully populated with working keys for:
Supabase (URL/anon/service-role), Jina embeddings, Gemini (`GEMINI_API_KEY`,
`CHAT_MODEL=gemini-3.5-flash-lite`), Groq (`GROQ_API_KEY`, `STT_MODEL=whisper-large-v3`),
`QUIZ_SECRET`, SMTP (Gmail app password, for OTP email). Do not print or paste actual key values
into chat, logs, or committed files — reference them by name only, as this document does.

## If you're picking this up fresh

1. Read this file fully (done, if you're here).
2. `git status` and `git log -1` to confirm you're still on
   `feat/settings-quiz-chat-and-fbise-corpus` with a clean tree matching commit `f96fcd7` (or
   later, if more work has landed since this was written).
3. Check whether the dev server is already running (`netstat -ano | grep ":3000"`) before
   starting a new one.
4. Ask the user what's next rather than assuming — the most likely next asks are: open the PR to
   `main`, build the syllabus filter UI, calibrate the confidence gate, or something new.
