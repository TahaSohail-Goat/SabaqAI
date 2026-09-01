# Sabaq AI — Module & Feature Specification

The finalised list of what Sabaq AI is made of: every module, what it does, what it is allowed to
show, the data it stands on, and what blocks it today.

**Read this with three other files.** This doc says *what to build*. It does not override:

| File | Authority over |
| --- | --- |
| `AGENTS.md` | The eight non-negotiable invariants. Nothing here may weaken one. |
| `docs/project-status.md` | What is actually real today. This doc describes the target. |
| `supabase/migrations/0001_init.sql` | Every field a module may show. The UI invents nothing. |
| `docs/api-spec.md` | Route contracts. |

**Scope note — this supersedes the hackathon cut list.** `docs/PRD.md` and `docs/build-plan.md`
deliberately cut the dashboard, revision planner and progress reports as *non-goals for the demo
week*. That was the right call for seven days. This document is the **post-hackathon product
spec**: it re-admits those modules with real data models behind them. Until the Phase 0 blockers
below are cleared, the cut list still governs what ships.

---

## 0. The rules every module inherits

These come from `AGENTS.md`. They are repeated here because they constrain *feature design*, not
just code, and most bad feature ideas die on one of them.

1. **A module may not display a number it did not compute.** No hardcoded accuracy, streak,
   mastery percentage, or "verified" label. If there is no data, the module shows an empty state —
   never a plausible placeholder. This kills the usual dashboard pattern of seeding fake stats.
2. **Refusal is a first-class result, not an error.** Every surface that can trigger retrieval must
   design its refusal state with the same care as its success state: calm, neutral, never red,
   never an error icon, always showing genuinely nearest chapters.
3. **Citations are rebuilt from stored rows.** Any module that renders an excerpt, page or chapter
   reads it from the database, never from model output.
4. **Retrieval is always filtered by board + class + subject.** Any module that searches inherits
   the student's scope. There is no global search.
5. **On REFUSE the LLM is never called.** No module may add a "just try anyway" affordance.
6. **Server-only secrets stay server-side.** Any module needing the service role runs in an API
   route, never in a client component.

**Design consequence.** Sabaq AI's differentiator is that it says "I don't know" honestly. Every
module below is therefore designed to look *good when empty and good when refusing* — that is the
hard case, and the one competitors get wrong.

---

## 1. Module map

Status reflects `docs/project-status.md` as of this writing.

| ID | Module | Status | Depends on |
| --- | --- | --- | --- |
| **M0** | Foundation: auth, profile, scope, shell | Partly real | — |
| **M1** | Ask — grounded Q&A | Real, unverified | M0, corpus |
| **M2** | Citation Inspector | Real | M1 |
| **M3** | Refusal & Nearest Chapters | Real | M1 |
| **M4** | Voice Input (Urdu/Roman Urdu) | Missing | M1 |
| **M5** | Quiz — generate, sit, grade | Real, not persisted | M0, corpus |
| **M6** | Quiz persistence & attempt history | Missing | M5, DB |
| **M7** | Syllabus Explorer | Real, unverified | corpus |
| **M8** | Student Dashboard | **Frontend built, empty-state-first** — no real widget data until M6/M11 | M6, M11 |
| **M9** | Progress & Mastery | **Missing — spec'd here** | M6 |
| **M10** | Revision Planner | **Missing — spec'd here** | M9, exam_date |
| **M11** | Ask History & Saved Answers | **Missing — needs schema** | M1, DB change |
| **M12** | Evaluation Dashboard (internal) | Real | eval set |
| **M13** | Settings & Account | **Frontend built** — theme/scope/logout real; password/delete disabled | M0 |
| **M14** | Teacher / Parent view | Deferred — Phase 4 | M9 |

---

## 2. M0 — Foundation

The layer every other module stands on. Nothing else works correctly until scope resolution does.

### 2.1 Authentication

**Surfaces:** `/login`, `/signup`, `/auth/callback`
**Routes:** `POST /api/auth/signup`, `/login`, `/logout`, `GET /api/auth/user`

| Feature | Status | Note |
| --- | --- | --- |
| Email + password | Real | Supabase Auth |
| Google OAuth | Code real | Needs provider enabled in Supabase dashboard |
| Facebook OAuth | Code real | Same |
| Session cookie via SSR client | Real | `@supabase/ssr` |
| Password reset | **Missing** | "Forgot password?" currently links nowhere |
| Email verification | **Missing** | Decide: required or optional |

**Known trap — demo mode.** With Supabase unconfigured, signup/login return a fabricated
`demo-user-101` with `success: true`. Auth *appears* to work when nothing is wired. Any module
reading the user must check `isDemo` and must not write dashboard data against a demo user.

**Acceptance:** a real account can be created, signed out, signed back in, and its session survives
a page reload and a server restart.

### 2.2 Student profile & scope

The single most important object in the product. Scope = `{ board_code, class_level, subject_code }`
and it filters **every** retrieval (invariant 6).

**Tables:** `users`, `student_profiles` (board, class, `exam_date`), `student_subjects`

| Feature | Status |
| --- | --- |
| Profile row created at signup | Real, unverified |
| `student_subjects` row created at signup | Real, unverified |
| Board / class / subject switcher in shell | Real (UI), wiring unverified |
| `exam_date` capture | **Column exists, never collected** — M10 needs it |
| Preferred language (`en` / `ur`) | Column exists, not surfaced |

**Critical:** the `chunks_match_profile` RLS policy needs a matching profile + subject row. An
account without them gets zero rows from `content_chunks` → the gate refuses → **the app refuses
every question with no error anywhere.** Signup must create both rows, and onboarding must not be
skippable.

**Onboarding ✅ done.** `src/app/onboarding/page.tsx` — board → class → subjects → optional exam
date, required for the first three steps. `POST /api/auth/onboarding` writes real
`student_profiles` + `student_subjects`, replacing the `class_level=10/board='PCTB'` defaults
`signup/route.ts` writes at account creation. `ScopeContext` hydrates from this real profile on
load for a signed-in student (`GET /api/auth/user` now returns it), so Ask/Quiz/Syllabus actually
use it — not just onboarding for its own sake. Signup redirects here on success (demo mode skips
straight to `/dashboard`, since there's nothing real to persist).
**Not done:** retroactive onboarding for accounts created before this existed — they keep the old
defaults until they change them in Settings.

### 2.3 App shell ✅ done

Sidebar (grouped nav, active-state pills, user chip, theme toggle) + per-page topbar (title,
scope pill) — `src/app/(app)/layout.tsx`, `src/components/app/{Sidebar,Topbar,NavItem,
ScopeContext,EmptyState}.tsx`.

The old `src/app/page.tsx` — a 1,125-line single client component switching four `useState` tabs
— is gone. `/` is now a one-line server redirect to `/dashboard`; Ask/Quiz/Syllabus/Eval moved to
routed pages under `(app)/` with their fetch logic untouched. Board/class/subject/language moved
from closed-over `useState` to `ScopeContext` (localStorage-backed) since routed pages can't share
a closure. This was Phase 1 item 6 below — done ahead of the rest of that phase, frontend only, no
new API routes.

---

## 3. M1 — Ask (the core loop)

**Surface:** `/ask` · **Route:** `POST /api/ask`
**Pipeline:** retrieve → gate → generate → validate citations → log

| Feature | Status | Note |
| --- | --- | --- |
| Question input (EN / Roman Urdu / Urdu) | Real | Urdu blocks need `dir="rtl"` |
| pgvector retrieval, scope-filtered | Real, **never run on real content** | |
| Confidence gate (PASS/BORDERLINE/REFUSE) | Real | `src/lib/ai/guardrail.ts` |
| Grounded generation (Gemini) | Real | **Blocked: no `GEMINI_API_KEY`** |
| Inline citation chips | Real | Rebuilt from DB rows |
| BORDERLINE hedge label | Real | Must be visually distinct from PASS |
| `qa_log` write | Real, unverified | Never throws into the request |
| Streaming responses | **Missing** | Phase 2 — perceived latency |
| Follow-up / multi-turn | **Missing** | Phase 3 — needs a grounding story per turn |

**States to design (all four are required):**
1. **Empty** — sample questions as pills; no fake chat history.
2. **Loading** — retrieval and generation are distinct phases; show which.
3. **Answered** — answer + confidence badge + citation chips.
4. **Refused** — M3. Note it is *faster* than answering (nothing is generated) — surface that as a
   feature, not a failure.

**Acceptance:** ask a question whose answer is in the corpus → answer cites a page a human can open
the book to and verify.

---

## 4. M2 — Citation Inspector

**Surface:** right column of `/ask`, sticky.

Clicking a citation chip opens the exact stored chunk: chapter, section, page range, excerpt.
All fields read from `content_chunks_expanded`. This is the trust surface — it is the reason a
student can believe the answer, so it is a primary element, not a footnote.

| Feature | Status |
| --- | --- |
| Render chunk excerpt from DB | Real |
| Chapter / section / page metadata | Real |
| Chip → inspector focus | Real |
| "Open in Syllabus Explorer" jump | **Missing** — links M2 → M7 |
| Copy citation | **Missing** |

**Empty state:** a calm illustration + "Ask something and the source will appear here." Never
pre-filled with an example citation — a fake citation in the trust panel is the worst possible bug.

---

## 5. M3 — Refusal & Nearest Chapters

The feature that differentiates the product. **Never red. Never an error icon.**

- Amber `HelpCircle`, navy heading, white card.
- Explains *why*: off-syllabus, or in-syllabus but weak support.
- **Nearest chapters computed from the actual scores for that question** (invariant 8). If
  retrieval found nothing, the array is empty and the UI says so — never a fixed fallback list.
- Each suggestion is a card that navigates into M7.

**Known unfixed defect (`docs/project-status.md` §3):** near-miss leakage. `nm-003` ("Derive Ohm's
law from the Drude model") scores 0.709 and is **answered** — an off-syllabus answer reaching a
student. False acceptance 11.1%. Fixed by threshold recalibration against a real corpus, not by
softening the eval set.

---

## 6. M4 — Voice Input

**Status:** Missing. Planned Groq `whisper-large-v3`.

Urdu and Roman Urdu speech → text into the Ask box. Accessibility for students who type slowly in
English, and it demos memorably.

**Hard requirement:** the text input stays visible and usable at all times. Voice is an addition,
never a mode switch. Transcription is editable before submit — never auto-submitted.

---

## 7. M5 / M6 — Quiz

### M5 — Generation & grading (real)

**Routes:** `POST /api/quiz`, `POST /api/quiz/grade`

- Questions generated per chapter from retrieved chunks; each carries a validated `chunk_id`.
- Questions whose citation doesn't validate are **discarded, never reassigned** (invariant 5); the
  response reports a `discarded` count.
- **Answers never reach the browser.** `/api/quiz` omits `correctIndex` and `explanation` and
  returns an AES-256-GCM `answerToken`; `/api/quiz/grade` decrypts and grades server-side.
- Fallback bank is labelled `isFallback: true` — never "Verified".

### M6 — Persistence (missing; blocks the dashboard)

Tables `quizzes`, `quiz_questions`, `quiz_options`, `quiz_answer_keys`, `quiz_attempts`,
`quiz_attempt_answers` **all exist and are unused**.

**Work:** on generation, write the quiz + questions + options, and the key into `quiz_answer_keys`
(service-role only, no client RLS policy). On submit, write `quiz_attempts` +
`quiz_attempt_answers`. Grading then looks the key up **by quiz id** — at which point
`src/lib/quiz/answer-key.ts` can be deleted entirely.

**This is the highest-value unblocking task in the whole document.** M8, M9 and M10 have no data
until it lands.

---

## 8. M7 — Syllabus Explorer

**Surface:** `/syllabus` · **Data:** `GET /api/ask/options`

Browse exactly what the system has ingested for the student's class and a chosen subject, and
**read the real source PDF** in place. Doubles as an honesty surface — a student can see
coverage before trusting a refusal.

- **Picker** — a library layout, deliberately *not* `/ask`'s dropdown cascade: a left rail of
  the 9 subjects (subject-colour dot per row) with a **Recent** list under it (last 6 opened
  documents, `localStorage`, click to jump back — cross-subject too); a **segmented control**
  for source type (only the types that have ingested content are shown); and the
  chapters/papers as a **visible list**. No question box. Class + board come from the profile.
- **Reader** — `src/components/app/SyllabusPdfReader.tsx`. Selecting a unit swaps the list for
  the reader (heading leads with the unit number, e.g. "Chapter 3 · Dynamics"; back link and
  prev/next-chapter controls above it). Renders every page of the
  source PDF stacked in one scroll column (read top-to-bottom, no paging — unlike `/ask`'s
  `AskDocumentReader`, which pages so a clicked citation can jump to an exact page). Has zoom
  in/out and an "expand" to a fullscreen modal (portalled to `document.body`, above the app
  shell; dismissed by close ✕, Esc, or a backdrop click).

| Feature | Status |
| --- | --- |
| Subject rail + Recent list + source-type segmented control + unit list (no question box) | Real |
| Continuous-scroll source-PDF reader — number-prefixed heading, zoom + fullscreen modal, prev/next chapter | Real |
| Deep link from a citation (M2) / nearest-chapters (M3) | **Deferred** |

> Textbook PDFs currently exist only for FBISE C9 physics/chemistry/biology/mathematics and C10
> mathematics; other class+subject combinations have model papers only — a source type with
> nothing ingested simply doesn't appear in the segmented control.
>
> `GET /api/syllabus` is unchanged and still backs the `/quiz` chapter list — the Explorer page
> itself no longer calls it.

---

## 9. M8 — Student Dashboard `NEW`

**Surface:** `/dashboard` — the post-login landing page.

The module the current MVP most visibly lacks. Its purpose is to answer, in one screen:
*where am I, what's weak, what do I do next?*

**Every widget below is derived from stored rows. There are no invented metrics.**

| Widget | Data source | Blocked by |
| --- | --- | --- |
| Greeting + scope chip (board/class/subject) | `student_profiles`, `student_subjects` | — |
| Days to exam | `student_profiles.exam_date` | Never collected (M0 onboarding) |
| Questions asked (7d / all) | `count(qa_log)` by `user_id` | qa_log unverified |
| Answered vs refused ratio | `qa_log.gate_decision` | qa_log unverified |
| Quizzes taken, average score | `quiz_attempts` | **M6** |
| Weakest chapters (top 3) | `quiz_attempt_answers` → `quiz_questions.chunk_id` → `sections` → `chapters` | **M6** |
| Chapter coverage progress | `chapters` vs chapters attempted | **M6** |
| Recent activity feed | `qa_log` + `quiz_attempts` by `created_at` | **M11 for question text** |
| Continue where you left off | Last chapter touched | **M6** |

**Schema finding — `qa_log` does not store the question text.** Its columns are `user_id`,
`subject_code`, `question_language`, `support_count`, `gate_decision`, `refusal_reason`,
`latency_total_ms`, `created_at`. A recent-activity feed can therefore say *"You asked a Physics
question — answered"* but **cannot show what was asked** until M11 adds storage. Do not fake it.

**Empty state is the default state.** A brand-new account has no quizzes and no questions. The
dashboard must be genuinely useful at zero data: show the scope, the syllabus coverage, and one
clear CTA ("Ask your first question"). It must never show a zeroed-out chart grid.

**Acceptance:** with a fresh account the dashboard renders no numbers and one obvious next action;
after one quiz and three questions, every number on screen can be traced to a row.

---

## 10. M9 — Progress & Mastery `NEW`

**Surface:** `/dashboard/progress`

Per-chapter mastery derived from real attempts — the diagnosis layer the PRD names as the gap
general chatbots leave ("no diagnosis of what they're weak on").

**Mastery model (v1, deliberately simple and explainable):**

```
chapter_accuracy = correct answers / answered questions, over that chapter's quiz questions
```

Joined via `quiz_attempt_answers` → `quiz_questions.chunk_id` → `content_chunks.section_id` →
`sections.source_id` → `chapter_sources.chapter_id`.

Bands: **Not started** (no attempts) · **Needs work** (<50%) · **Getting there** (50–79%) ·
**Strong** (≥80%). Minimum 5 answered questions before a chapter is banded at all — below that it
shows "not enough data", because a 1-of-1 correct answer is not 100% mastery.

**Explicitly not in v1:** spaced-repetition decay, confidence-weighted scoring, per-topic
sub-mastery. They need more data than the product will have at launch, and an unexplainable score
undermines the trust story.

**Charts:** follow `dataviz` conventions. Mastery is a bounded 0–100% ordinal — use bands, not a
continuous rainbow. Never colour alone: band label + icon (this mirrors the confidence-badge rule).

---

## 11. M10 — Revision Planner `NEW`

**Surface:** `/dashboard/plan`

Previously cut for a good reason: *"LLM output with no grounding story."* It is re-admitted here
**only in a deterministic form** — the plan is computed, not generated.

**Algorithm (no LLM):** take chapters in the student's scope → rank by (mastery band ascending,
chapter_no ascending) → distribute across the days remaining until `exam_date` → emit a per-day
list of chapters with a suggested action (read / quiz / re-quiz).

**Why deterministic:** a generated study plan is unverifiable prose in a product whose entire
pitch is verifiability. A computed plan can be explained line by line: *"Chapter 7 first, because
you scored 40% on it and the exam is in 12 days."*

**Blocked by:** `exam_date` collection (M0) and mastery (M9).

---

## 12. M11 — Ask History & Saved Answers `NEW` ⚠ schema change

**Surface:** `/dashboard/history`

Students re-ask the same thing repeatedly before an exam. History makes past answers reusable and
makes the dashboard's activity feed meaningful.

**Requires a migration.** Today nothing stores question or answer text. Proposed:

```sql
-- 0006_ask_history.sql  (draft — not yet written)
alter table qa_log add column question_text text;      -- nullable: existing rows have none
create table if not exists saved_answers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  qa_log_id   uuid not null references qa_log(id) on delete cascade,
  answer_text text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, qa_log_id)
);
```

**Decisions required before writing it** (do not implement unilaterally):
- **Privacy.** Storing question text is a real change in data sensitivity for minors. Needs a
  retention policy and a delete-my-history control before it ships.
- **RLS.** `saved_answers` must be owner-only, both read and write.
- **Answer text provenance.** A saved answer is a *snapshot*. If the corpus is re-ingested, its
  citations may no longer resolve — saved answers must re-validate citations on read and mark
  stale ones, rather than showing a dead page reference.

---

## 13. M12 — Evaluation Dashboard (internal)

**Surface:** `/eval` — marked **Internal**. Not student-facing.
**Route:** `GET /api/eval`

Retrieval accuracy and refusal metrics computed live from `src/lib/evaluation/questions.ts` via
the shared `runEvaluation()`. Both the route and the CLI call the same function — this was
previously duplicated in three places that reported different numbers for the same system.

**Rules:** no metric is ever hardcoded (invariant 7). Cards turn amber/red when numbers are bad —
including the near-miss leak, which must stay visible. `/api/eval` runs retrieval per question:
it is slow and burns quota, so **never call it on page load** — it is behind an explicit button.

**Must keep showing:** near-miss refusal rate and false-acceptance rate, separately from the easy
off-syllabus set. The easy set reported a clean 100% for the entire time `nm-003` was leaking.

---

## 14. M13 — Settings & Account

**Surface:** `/settings`

| Feature | Status |
| --- | --- |
| Change board / class / subjects | Partly (shell selectors) |
| Set / change exam date | **Missing** — M10 needs it |
| Interface language EN ⇄ UR | Column exists, not surfaced |
| Theme light / dark / system | **Real** (`ThemeToggle`) |
| Change password | **Missing** |
| Delete account & data | **Missing** — required if M11 ships |

---

## 15. M14 — Teacher / Parent view (deferred)

Explicitly **Phase 4**. Read-only class or child view over M9 mastery.

Not specified in detail here on purpose: it needs a consent and privacy model for minors'
performance data that does not exist yet, and it was cut from the demo for being the highest
effort with the least airtime. Do not start it before M9 is real.

---

## 16. Cross-cutting requirements

**Localisation.** Urdu at block level with `dir="rtl"`. Roman Urdu is an *input* mode, not a UI
language. Interface strings are not yet externalised — required before UR ships.

**Performance target — a low-end Android on conference wifi.** Ship route-split pages (the current
single 1,125-line component is the opposite of this), lazy-load charts, and keep the ask path
free of blocking calls. `/api/eval` never runs on load.

**Accessibility.** Confidence and mastery are **icon + label, never colour alone**. Live regions
announce answers and refusals (`role="status"` / `role="alert"`). Full keyboard path through ask
→ citation → syllabus. Visible focus rings everywhere.

**Theming.** Both light and dark are supported via `[data-theme]` on `<html>`; every surface uses
semantic tokens from `globals.css`, never raw hex. Anything on the always-dark auth backdrop uses
fixed colours deliberately.

**Error handling.** Errors say what went wrong *and how to fix it*, and point at the relevant doc.
Refusals are HTTP 200 — only genuine failures are 4xx/5xx.

---

## 17. Phasing

Ordered by dependency, not by appeal. Each phase is blocked by the one above.

### Phase 0 — Make the existing system real *(nothing below matters until this is done)*
1. Ingest real content → `select count(*) from content_chunks` returns rows.
2. Verify retrieval end-to-end; confirm the `[retrieval]` fallback warning is **absent**.
3. Add `GEMINI_API_KEY`; run the full `/api/ask` flow once.
4. **Recalibrate thresholds** against real score distributions.
5. Re-run eval; confirm `nm-003` now refuses.

### Phase 1 — Structural repair + persistence
6. ✅ **Done.** `page.tsx` refactored into routed pages under `(app)/` with a shared sidebar shell.
7. **M6 quiz persistence** — then delete `answer-key.ts`.
8. ✅ **Done.** M0 onboarding, including `exam_date`.
9. Password reset.

### Phase 2 — The dashboard layer
10. **M8** dashboard shell ✅ done (empty-state); wire real widget data once M6/M9 land. **M9** mastery.
11. M2↔M7 deep links; M7 coverage indicators.
12. Streaming answers (M1).

### Phase 3 — Depth
13. M10 planner (deterministic).
14. M11 history + saved answers — **after** the privacy decisions in §12.
15. M4 voice input.

### Phase 4 — Beyond the student
16. Second subject; second board.
17. M14 teacher/parent view.

---

## 18. Open decisions

Flagged rather than silently decided — each changes the data model or the privacy posture.

1. **Do we store question text?** (M11) Required for history; raises retention duties for minors'
   data. Needs an explicit yes plus a deletion control.
2. **Is email verification required to ask questions?** Affects the signup funnel.
3. **Mastery formula.** Is plain accuracy enough for v1, or is recency weighting needed? Simple and
   explainable is the current recommendation.
4. **Multi-subject at once, or one active subject?** Retrieval is single-subject-filtered today;
   a multi-subject dashboard implies a scope switcher on every widget.
5. **Does a saved answer re-validate on read?** Recommended yes — otherwise re-ingestion silently
   turns saved citations into dead references, which breaks the core trust promise.
6. **Offline behaviour.** The local corpus fallback exists for dev. Do students ever see it? The
   current answer should be **no** — its scores are not embedding similarity.

---

## 19. Definition of done for a module

A module ships when:

- [ ] `npm run lint` and `npm run build` pass
- [ ] No invariant in `AGENTS.md` was weakened
- [ ] Every number on screen traces to a stored row — nothing hardcoded, nothing labelled
      "verified" that wasn't
- [ ] Empty, loading, error **and refusal** states are all designed and reachable
- [ ] Works at 360 px on a low-end Android, in light and dark
- [ ] Urdu content renders `dir="rtl"`
- [ ] `docs/project-status.md` updated in the same change
