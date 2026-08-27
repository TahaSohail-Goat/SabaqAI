# Screen spec — Ask

The core screen of the app. A student types a question; the app either answers it with a
citation, or refuses calmly with nearest chapters. Follow `.stitch/design-brief.md` for every
state below — mobile-first, citation as hero, refusal calm, confidence via icon+label, Urdu
block-level `dir="rtl"`.

This spec matches the real API contract in `src/lib/types.ts` (`AskResponse`) and
`src/app/api/ask/route.ts`, so it should be directly implementable without changing the backend.

## States

### 1. Idle

Before any question is asked.

- A single question input (multi-line capable, since Urdu/Roman Urdu questions can run long), with
  a clear placeholder example question.
- A visible send action, reachable with one thumb on a phone (bottom-anchored on small screens is
  fine).
- Optionally: 1–3 example question chips to tap instead of typing (helps first-time and demo use).
- No confidence meter, citation panel, or result content visible yet — keep this state minimal.
- Language selector (English / Urdu) visible but not intrusive — it sets both the query language
  and the expected response language.

### 2. Loading (two-stage)

After the student submits a question, before a response arrives. This is a single visual loading
state that changes its label in two stages — not two different screens.

- Stage 1 label: **"Searching your syllabus…"** — shown immediately on submit, while retrieval +
  the confidence gate run.
- Stage 2 label: **"Writing the answer…"** — shown once generation has started (i.e. the gate
  returned PASS or BORDERLINE). If the gate returns REFUSE, the screen should go straight from
  Stage 1 to the Refused state — it must never show "Writing the answer…" for a refusal, since the
  LLM is never called on REFUSE.
- Keep the loading indicator lightweight (a simple spinner or pulse, not a heavy animation) — this
  is a low-end Android target.
- The input becomes disabled/read-only while loading, so a student can't double-submit.

### 3. Answered

Maps to `AskResponse` with `status: 'answered'`.

- **Confidence indicator** (icon + label, never colour alone):
  - `confidence.band === 'high'` → e.g. a check icon + "Grounded in your syllabus".
  - `confidence.band === 'medium'` → e.g. a half-check/info icon + "Partly supported — check the
    source".
- **Answer body**: render `statements[]` in order. Each statement's text is followed inline by its
  citation chip(s), keyed by `statements[i].chunkIds`, resolved against `citations[]`.
- **Citation chip — the hero element**:
  - Shows at minimum: chapter number + page (from `citations[].chapterNo`, `pageFrom`/`pageTo`).
  - Tapping/expanding a chip reveals the source excerpt (`citations[].excerpt`) and section
    (`citations[].section`) — this is how the student verifies the answer against their own book.
  - Visually prominent — not small grey footnote text.
- If `notCovered` is non-null, show it as a short, clearly-separated note ("Not covered by this
  answer: …") — it is not a refusal, but it's telling the student the answer was partial.
- **Language / direction**: the whole answer block gets `dir="rtl"` when `language === 'ur'`,
  `dir="ltr"` otherwise. This includes the statement list and citation chips, not just the raw
  text.

### 4. Refused

Maps to `AskResponse` with `status: 'refused'`. Tone is neutral throughout — no red, no warning
iconography, no "error" framing. This is a normal, expected outcome, not a failure.

- **Message**: show `message` plainly, as the main content of the state (not a toast, not a small
  aside) — same visual weight as an answered response gets.
- **Nearest chapters**: show `nearestChapters[]` (chapter number + title) as tappable
  cards/chips — tapping one could pre-fill or suggest a question about that chapter (behaviour
  left to implementation; the spec requirement is that they're tappable, not just listed text).
- **Reformulation hint**: show `suggestion` as a distinct, clearly-labelled hint (e.g. "Try
  asking:"), calm styling — not styled as a warning.
- Do **not** show a confidence meter, citation panel, or any partial answer content in this state.
- `reason` (`no_candidates` / `low_similarity` / `ungrounded_output`) is not shown verbatim to the
  student — it's implementation detail. The `message` string is already student-facing copy.
- Language/direction: same `dir` rule as Answered, based on the question's language (the refusal
  copy from the API is already localized per `docs/confidence-guardrails.md`).

## Cross-state notes

- Only one of Idle / Loading / Answered / Refused is visible at a time — a fresh question resets
  the screen to Loading, replacing any prior Answered/Refused content (matches current
  `handleAsk` behavior of clearing `askResult` on submit).
- Every state must be usable on a ~360px-wide viewport without horizontal scrolling.
- None of these states should require a new component library — build with the existing Tailwind
  setup (see `.stitch/README.md`).
