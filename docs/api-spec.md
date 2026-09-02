# API spec

Every route lives in `src/app/api/`. All requests and responses are JSON. Types are defined once
in `src/lib/types.ts` — the app and this doc agree on them, so change the type file, not just this
page.

Status labels match `docs/project-status.md`.

---

## `POST /api/ask` — grounded answer or refusal

The core route. Everything else is supporting cast.

**Request**

```json
{
  "question": "What is Ohm's law?",
  "board": "FBISE",
  "classLevel": 10,
  "subject": "physics",
  "language": "en",
  "sourceType": "textbook",
  "chapterNo": 14
}
```

`question` is required and must be non-empty. The rest default to
`FBISE / 10 / physics / en`. `language` is `"en"` or `"ur"` and controls the response language.

`sourceType` (`"textbook" | "past_paper" | "model_paper" | "marking_scheme"`) and `chapterNo`
are both optional but always sent together by the `/doubts` page once a student has picked a
source and a specific chapter/paper (see `GET /api/ask/options` below) — retrieval narrows to
exactly that one source instead of searching everything ingested for the subject. Board +
class + subject stay mandatory either way; these two only ever narrow further, never replace
that filter.

**Response — answered** (`200`)

```json
{
  "status": "answered",
  "confidence": { "band": "high", "top1": 0.71, "support": 3 },
  "language": "en",
  "statements": [
    { "text": "Ohm's law states that…", "chunkIds": ["pctb-10-phy-ch14-03"] }
  ],
  "citations": [
    {
      "chunkId": "pctb-10-phy-ch14-03",
      "chapterNo": 14,
      "chapterTitle": "Current Electricity",
      "section": "14.3 Ohm's Law and Resistance",
      "pageFrom": 95,
      "pageTo": 97,
      "sourceType": "textbook",
      "excerpt": "Ohm's Law states that the current…"
    }
  ],
  "notCovered": null
}
```

`band` is `"high"` when the gate returned PASS, `"medium"` when it returned BORDERLINE. Every
`chunkIds` entry resolves to an entry in `citations`. The citation's chapter, page, and excerpt are
built from the stored chunk — **never from the model's output**. The model chooses *which* chunk;
it never writes *what the citation says*.

**Response — refused** (`200`, not an error status)

```json
{
  "status": "refused",
  "reason": "low_similarity",
  "message": "This topic is outside your registered board syllabus…",
  "nearestChapters": [
    { "chapterNo": 14, "chapterTitle": "Current Electricity", "score": 0.41 }
  ],
  "suggestion": "Try asking about Class 10 Physics topics like 'Ohm's law'…"
}
```

`reason` is `no_candidates`, `low_similarity`, or `ungrounded_output`. It is diagnostic — show
`message` to the student, never the reason code.

A refusal is a **successful** response. It returns `200`, not `4xx`. Refusing is the product
working correctly, and the UI must not render it as an error.

**Errors**

- `400` — missing or empty `question`.
- `500` — unexpected failure. Returns a refusal-shaped body so the UI never has to special-case it.

**The rule that must never break:** when the guardrail returns REFUSE, the LLM is not called. Not
with a shorter prompt, not with a warning. Not called. See `docs/confidence-guardrails.md`.

---

## `GET /api/ask/options` — what a student can pick from before asking

No auth required (same reasoning as `/api/syllabus` — textbook/paper content isn't sensitive).

**Request** — query params: `board`, `classLevel`, `subject` (same defaults as `/api/ask`).

**Response** (`200`)

```json
{
  "board": "FBISE",
  "classLevel": 10,
  "subject": "physics",
  "sources": [
    { "sourceType": "textbook", "units": [] },
    { "sourceType": "past_paper", "units": [] },
    {
      "sourceType": "model_paper",
      "units": [{ "chapterNo": 2025, "chapterTitle": "Model Paper 2025 — physics" }]
    },
    { "sourceType": "marking_scheme", "units": [] }
  ]
}
```

Always returns all four source types, even with an empty `units` array — the `/doubts` page
shows that as an honest "nothing ingested yet" state per category rather than hiding it.
`chapterNo` is the real chapter number for `textbook` sources; for the others it's the exam
year the crawler tagged the document with (see `data/crawl-sources.json`'s `year` field and
`scripts/crawl.ts`) — there is no separate "paper session" concept in the schema, so a paper
is identified by (subject, class, year) same as a book chapter is identified by (subject,
class, chapter number).

---

## `POST /api/quiz` — chapter quiz

**Request**

```json
{ "chapterNo": 14, "subject": "physics" }
```

**Response** (`200`)

```json
{
  "questions": [
    {
      "id": "q-14-1",
      "position": 1,
      "stem": "What is the SI unit of electric current?",
      "options": ["Volt (V)", "Ampere (A)", "Ohm (Ω)", "Coulomb (C)"],
      "chunkId": "pctb-10-phy-ch14-01",
      "chapterNo": 14,
      "page": 91,
      "section": "14.1 Electric Current"
    }
  ],
  "answerToken": "8fJ2…opaque…",
  "chapterNo": 14,
  "subject": "physics",
  "discarded": 0
}
```

**No `correctIndex`, no `explanation`.** `docs/database.md` requires that the correct answer never
reaches the browser before submission. The answer key is AES-256-GCM encrypted into `answerToken`,
which the client cannot read or forge — it just hands it back when submitting.

`discarded` counts questions dropped because they cited a chunk that wasn't retrieved. Questions
with invalid citations are **discarded, never reassigned** to a real chunk: substituting one would
give hallucinated content real-looking provenance.

`isFallback: true` and a `note` appear when generation was unavailable and the hand-written bank
was served instead. Surface that in the UI — don't present fallback content as freshly generated.

`404` if the chapter has no chunks.

For a logged-in student the response also carries **`draftId`** — generation now parks the quiz
as a resumable `quiz_drafts` row (see below), so it survives logout / device change. This is the
one place generation writes a row; it's disposable scratch state, deleted on submit.

---

## In-progress quiz drafts

Generated-but-ungraded quizzes, parked server-side (`quiz_drafts`, migration 0015). One row per
`user + board + class + subject + chapter` — regenerating a chapter replaces its row. Deleted when
the quiz is submitted (`/api/quiz/grade` with `draftId`) or when the student discards it. Nothing
here feeds mastery / dashboard stats / completed history — those read `quiz_attempts`, which a
draft never creates.

- **`GET /api/quiz/drafts`** → `{ drafts: [{ id, subjectCode, chapterNo, chapterTitle,
  answeredCount, totalQuestions, generatedAt, updatedAt, expired }] }`, newest first. `expired` =
  the sealed token is past its 2h grading TTL (still resumable for review).
- **`GET /api/quiz/drafts/[id]`** → full draft for resuming: `{ id, subject, chapterNo,
  chapterTitle, questions, answers, quizToken, isPartial, effectiveCounts, generatedAt, expired }`.
  `questions` is the same browser-safe shape `/api/quiz` returns (no answer key). Ownership
  mismatch → `404`.
- **`PATCH /api/quiz/drafts/[id]`** — autosave. Body `{ answers }` (`{ "<questionIndex>":
  <optionIndex | text> }`), replaces the stored answers. `404` if not yours.
- **`DELETE /api/quiz/drafts/[id]`** — discard. `404` if not yours.

---

## `POST /api/quiz/grade` — submit and grade

**Request**

```json
{
  "answerToken": "8fJ2…opaque…",
  "answers": { "q-14-1": 1, "q-14-2": 0 }
}
```

`answers` maps question id to the selected option index. Omitted questions count as unanswered.

**Response** (`200`)

```json
{
  "score": 1,
  "total": 2,
  "answered": 2,
  "results": [
    {
      "questionId": "q-14-1",
      "selectedIndex": 1,
      "correctIndex": 1,
      "correct": true,
      "explanation": "Current is the rate of flow of charge…"
    }
  ]
}
```

Correct answers and explanations are returned **only here**, after submission.

`400` if `answerToken` is missing, tampered with, or expired (tokens live 2 hours). Requires
`QUIZ_SECRET` to be set in production — without it each server instance generates its own
ephemeral key and grading fails intermittently across instances.

---

## `GET /api/eval` — evaluation metrics

No request body. Runs every question in the labelled set through live retrieval and the guardrail,
then computes the summary. See `docs/evaluation.md` for what the numbers mean.

**Response** (`200`)

```json
{
  "summary": {
    "totalEvaluated": 15,
    "inSyllabusTotal": 6,
    "outSyllabusTotal": 9,
    "nearMissTotal": 4,
    "retrievalAccuracy": 100.0,
    "offSyllabusRefusalRate": 88.9,
    "nearMissRefusalRate": 75.0,
    "falseAcceptanceRate": 11.1,
    "falseRefusalRate": 0.0,
    "thresholds": { "PASS_TOP1": 0.62, "BORDERLINE_TOP1": 0.52, "SUPPORT_SCORE": 0.5 }
  },
  "results": [
    {
      "id": "is-001",
      "question": "What is Ohm's law?",
      "lang": "en",
      "label": "in_syllabus",
      "nearMiss": false,
      "expectedChapter": [14],
      "retrievedChapters": [14, 15],
      "top1Score": 0.71,
      "supportCount": 3,
      "decision": "PASS",
      "passedVerification": true,
      "reason": null
    }
  ]
}
```

`nearMissRefusalRate` covers only the hard cases — same subject, wrong syllabus. Report it
separately; averaging it into the overall number hides exactly what it exists to reveal. The
figures above are real output, not aspirational: near-miss testing surfaced an 11.1% leak that the
easy questions reported as a clean 100%.

This route calls retrieval once per question, so it is slow and it consumes embedding quota. Don't
put it on a page that loads automatically during the demo.

---

## `GET /api/syllabus` — corpus browser

No request body. Returns the ingested corpus as a flat chunk list.

> **Note:** the `/syllabus` Explorer page no longer calls this — it uses `GET /api/ask/options`
> (source types + units + PDF URLs), the same endpoint `/ask` uses. `/api/syllabus` is still
> live and now only backs the `/quiz` page's chapter dropdown, so its response shape must not
> change.

```json
{
  "board": "PCTB",
  "classLevel": 10,
  "subject": "Physics",
  "totalChunks": 10,
  "chapters": [{ "chapterNo": 14, "chapterTitle": "Current Electricity", "subject": "physics" }],
  "chunks": [
    {
      "id": "pctb-10-phy-ch14-01",
      "chapterNo": 14,
      "chapterTitle": "Current Electricity",
      "section": "14.1 Electric Current",
      "pageFrom": 91,
      "pageTo": 92,
      "sourceType": "textbook",
      "language": "en",
      "excerpt": "Electric current is defined as…",
      "contentLength": 512
    }
  ]
}
```

Reads the hardcoded array today; must read `content_chunks` once ingestion is real.

---

## Auth

| Route | Method | Body | Returns |
| --- | --- | --- | --- |
| `/api/auth/signup` | POST | `{ email, password, full_name?, class_level?, board? }` | `{ success, user, session }` |
| `/api/auth/login` | POST | `{ email, password }` | `{ success, user, session }` |
| `/api/auth/logout` | POST | — | `{ success }` |
| `/api/auth/user` | GET | — | `{ user }` or `{ user: null }` |

**Demo mode:** when Supabase env vars are absent, signup and login return a fabricated
`demo-user-101` with `isDemo: true` and `success: true`. Useful locally, dangerous on stage — it
means auth appears to work when nothing is configured. Check for `isDemo` before you believe a
successful login during rehearsal.

**Missing:** none of these create a `student_profiles` row. Until one does, the RLS policy on
`content_chunks` matches nothing. See the RLS trap in `docs/project-status.md`.

---

## Conventions

- Refusals are `200`. Only genuine failures are `4xx`/`5xx`.
- The server never trusts model output for anything a student sees as fact. Citations are
  reconstructed from stored rows.
- Retrieval is always filtered by board + class + subject. An unfiltered search is a bug — it
  pulls the wrong curriculum and breaks grounding.
- Nothing in a response should be a hardcoded claim about the system's own accuracy.
