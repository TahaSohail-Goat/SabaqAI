# API spec

## Concept Lab (Class 9 Kinematics)

`GET /api/lab` requires a real authenticated profile enrolled in FBISE Class 9 Physics. It
returns `LabBootstrap`: a signed two-hour temporary session and current pinned textbook
evidence, original chapter PDF/page mapping, per-family availability and stored-row citations.
No client scope override is accepted. Missing/changed reviewed evidence disables the affected
experiment; bootstrap scientific/configuration failures are operational errors.

`POST /api/lab` is a strict discriminated request with shared `sessionToken`, UUID `requestId`,
UUID `inputVersion`, and millisecond `issuedAt` (accepted within 90 seconds, plus 5 s clock skew).

- `action: 'propose'`, `question` (3–800 characters): returns `proposal` with approved input
  and explicitly `suggestedKeys`, `clarify`, `unsupported`, or `guidance_unavailable`.
- `action: 'run'`, `confirmed: true`, `input: { experimentId, parameters }`, `mode`, finite
  numeric `prediction` or null, `reasoning` (max 600), `question` (max 800), `baseRunToken` or
  null: validates units/bounds, requires a prediction for guided mode, recomputes results and
  returns an immutable signed `LabRun`. Every parameter is `{ value, unit }`; the registry
  specifies exactly which parameters/units belong to each family. Comparisons require one
  changed SI parameter against an owned, same-session signed baseline. No provider is called.
- `action: 'explain'`, `runToken`, `compareToken` or null: recomputes authoritative runs and
  returns `feedback` containing validated reviewed block IDs, actual run/result-field
  references and a permitted follow-up. AI supplies no displayed scientific prose or numbers.
  Provider failure/invalid output preserves the separately labelled deterministic explanation.

Response shapes are shared in `src/lib/types.ts`; runtime schemas live in `src/lib/lab/contracts.ts`.
HTTP 200 covers academic limitations, clarification and AI-unavailable teaching. Genuine
errors use 400 invalid input, 401 authentication, 403 curriculum, 409 expired/foreign/stale or
duplicate state, 429 quota, 503 configuration/evidence/DB, and 504 cancellation/deadline.
All responses are no-store; errors have request IDs. Body cap 32 KB, orchestration deadline 25 s.
Migration 0025 supplies service-only cross-instance receipts/rate coordination. See
[demo, provider policy and checks](../PHYSICS_LAB_DEMO.md) and [scientific evidence](lab-evidence.md).

## Sources-only availability fallback

`POST /api/ask` may return HTTP 200 with `status: "sources_only"` after both Gemini and Groq
have actually failed in that request. Fields: `requestId`, `originalQuestion`, `language`, exact
selected `scope` (including source UUID and chapter), `reason: "providers_unavailable"`, a fixed
honest `message`, and one to three stored-row `citations`. There are no answer statements,
coverage/confidence verdicts or support-review success labels. The strict response schema rejects
such extra fields. These are unassessed search results, not evidence that the question is answered.
The existing reader opens their original stored page references with chapter-PDF rebasing.

This student-question-only path reuses retrieved seeds or, if understanding failed first, searches
the unchanged full question once within the verified selected source/chapter. It makes no third
LLM call. It does not turn final refusals, invalid output, grounding/adequacy failures, expired
deadlines, clarification requests or missing/foreign evidence into success. Source-less legacy
requests retain their original error. Quiz review behavior is unchanged.

## Grounding and answer adequacy

The adequacy change preserved existing response variants; the later availability fallback adds
the distinct sources-only variant above. Reviewed answer coverage can be partial when
the requested mechanism or a subquestion is unsupported, with limitations rendered through existing
`boundary.missingRequestedAspects` / `notCovered`. An inadequate answer is withheld even if its facts
and citations are valid. The internal review contract requires adequacy, reasoning and example checks;
clients cannot supply these verdicts. At most one evidence-backed repair and fresh independent review
can run within the configured budget/deadline. See [implementation and checks](ask-evolution/ANSWER_ADEQUACY.md).

## Doubts exact source selection and hybrid retrieval

`POST /api/ask` adds optional `sourceId: UUID`, the actual selected `chapter_sources.id`, to its strict
existing request. The updated page always sends it with board/class/subject/sourceType/chapterNo.
The server verifies its curriculum/source/chapter membership; it cannot override profile permissions.
Source-less older requests are accepted only when the permitted source is unique, otherwise HTTP 400
asks for reselection. Existing answer/refusal/clarification/error variants are unchanged. Signed
clarification binds the source UUID too. Quiz's internal legacy chapter snapshots retain their existing
source selection behavior; a browser cannot enable this through Ask input.

`GET /api/ask/options` units add `sourceId` and `sourceLanguage`, with separate entries for each actual
source and its own PDF URL/page offset. `GET /api/ask/document` accepts the same sourceId and verifies
it before loading scoped OCR; ambiguous old requests fail rather than blend documents. Real PDF bytes
and citation page rebasing remain unchanged. Migration 0023 provides the hybrid RPC; absent migration
is an operational error, never a demo/keyword-only academic fallback.

See [hybrid implementation and actual checks](ask-evolution/HYBRID_RETRIEVAL.md).

## Grounded Quiz review

`POST /api/quiz/explain` requires the existing authenticated session and current curriculum profile.
Strict input: `{ attemptId: UUID, questionId: UUID, language?: 'en' | 'ur' }`. IDs refer to an owned
submitted attempt and its persisted question, never the temporary token question ID. Migration 0022
is required. `/api/quiz/grade` adds `attemptId` and `results[].persistedQuestionId` when saved;
history detail adds `questions[].questionId`. Normal token IDs and existing grading fields remain.

HTTP 200 distinguishes `explained`, `assessment_review`, `insufficient_support`, `not_eligible`.
Other outcomes: 400 invalid input, 401 authentication, 403 profile/scope, 404 unavailable membership,
429 rate/duplicate with Retry-After, 502 invalid provider output, 503 config/provider/DB failure,
504 deadline, 499 caller cancellation. All carry request IDs and no-store. Public shapes live in
`src/lib/types.ts`; [the developer handoff](ask-evolution/QUIZ_HANDOFF.md) documents full schemas,
examples, eligibility, durable duplicate handling, source/PDF rendering and actual validation.
Review never changes marks and does not treat a quiz key as textbook evidence.

## Notifications (M15)

All four endpoints require a real signed-in session and completed profile. Owner and curriculum
scope come from the server, never the request body. These passive requests do not refresh the
inactivity cookie. Apply migrations `0019_notifications.sql`, `0020_notification_popups.sql`,
and `0021_notification_deletion.sql`
before deploying the routes.

- `GET /api/notifications?offset=0&view=inbox`: read-only, 20-row pages; non-negative numeric
  offset below 100000. `view` accepts `inbox` (default), `unread`, or `archived`. Optional `kind`
  accepts one notification kind; `q` searches titles case-insensitively, up to 100 characters.
  Legacy `unread=true|false` is supported; archived + unread=true is rejected. Extra fields
  are rejected. Returns `NotificationInboxResponse`: `items`, `unreadCount`, `archivedCount`,
  `checkedAt`, `totalCount`, `hasMore`, `preferences`. `totalCount` follows all chosen filters;
  unreadCount covers enabled inbox categories, archivedCount covers all archived categories.
  Disabled categories remain accessible in Archived. All views exclude expired rows. No-store response.
- `POST /api/notifications/sync`: no body needed. Generates idempotent in-app receipts from
  current saved plans and recent completed attempts; returns `{ success: true }`.
- `PATCH /api/notifications`: body `{ action: 'read' | 'unread' | 'archive' | 'restore' | 'delete', id: '<uuid>' }`,
  `{ action: 'mark_all_read' }`, or `{ action: 'read_many' | 'archive_many' | 'restore_many' | 'delete_many', ids: ['<uuid>'] }`.
  Bulk requests accept 1–50 ids, deduplicate them, and update only owned, current-scope,
  unexpired rows in the expected archive state. Unavailable ids are skipped; if none match,
  returns 404. Returns `{ success: true }`. Restore preserves read/receipt timestamps;
  mark_all_read only affects enabled inbox categories. Unknown/extra fields are rejected.
  Delete works on both inbox and archived rows, clears title/body and sets a deletion tombstone.
  Deleted rows are excluded from all views/counts and authenticated direct reads, cannot be
  restored or changed, and retain their event key so later sync cannot recreate them. Source
  plans/attempts remain intact. Repeating an action on an already deleted id returns 404.
- `PATCH /api/notifications/preferences`: body contains all four boolean fields
  `{ examReminders, planUpdates, quizResults, popups }`; returns `{ preferences }`.

Each item contains `id`, `kind`, `title`, `body`, `href`, `createdAt`, `receivedAt`, and nullable
`readAt` and `archivedAt`. `createdAt` is the source event time; `receivedAt` is the receipt's
database insertion time. `checkedAt` is the server read time used to establish a popup baseline.
Kinds are `exam_reminder`, `plan_created`, `quiz_completed`; destinations are internal plan or
solved-quiz routes. Errors use `{ error: string }`: 400 invalid input, 401 missing/expired auth,
403 incomplete onboarding, 404 unavailable notification, 503 missing configuration/migration
or a database failure. No fabricated notifications or unread count are returned on failure.

See [notifications-plan.md](notifications-plan.md) for event/expiry rules and later phases.

---

Every route lives in `src/app/api/`. All requests and responses are JSON. Types are defined once
in `src/lib/types.ts` — the app and this doc agree on them, so change the type file, not just this
page.

Status labels match `docs/project-status.md`.

---

## `POST /api/ask` — grounded answer or refusal

**2026-10-20 contract update:** the evolved endpoint additionally returns `needs_clarification` and
typed `error` variants. See [Ask evolution](ask-evolution/IMPLEMENTATION.md) for the complete active
contract, signed resumption, limits and HTTP semantics. `answered` is retained for compatibility;
partial answers use `boundary.coverage: "partial"`, explicit `notCovered`, structured blocks and
validated canonical statements. Existing citation metadata remains rebuilt from stored rows.

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

`question`, `board`, numeric `classLevel`, and `subject` are required. Question input defaults to a
1600-character limit. The server validates offered scopes and signed-in profile authorization.
`language` is `"en"` (default) or `"ur"`; omitted sourceType defaults to `"textbook"`.

`sourceType` (`"textbook" | "past_paper" | "model_paper"`) and `chapterNo`
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

- `400` — invalid input or expired/forged clarification; `403` — unauthorized signed-in scope.
- `429` — rate/concurrency limit, with Retry-After.
- `502` — malformed provider output; `503` — missing configuration or unavailable provider/database.
- `504` — total request deadline reached.

These return `{status:"error", requestId, code, message, retryable}`, never a fabricated evidence refusal.
Clarification is HTTP 200 with `{status:"needs_clarification", requestId, originalQuestion, question,
options:[{id,label}], context, allowFreeText:true}`. Resume by resending the original question and
scope plus `clarification:{context, optionId}` or `clarification:{context, freeText}`. Choices are
scope/owner/language/expiry-bound; no unsigned interpretedQuestion override is accepted.

**The rule that must never break:** when the guardrail returns REFUSE, the LLM is not called. Not
with a shorter prompt, not with a warning. Not called. See `docs/confidence-guardrails.md`.
Understanding is a separate pre-gate interpretation stage; no model call occurs after final REFUSE.

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

## `POST /api/quiz/grade` ? submit and grade

**Request:** `{ "quizToken": "<opaque AES-GCM token>", "answers": { "<questionId>": 1, "<writtenQuestionId>": "student text" }, "draftId"?: "<UUID>" }`.
MCQs use zero-based option indexes; short/long questions use free text. Omitted questions are unanswered.
A valid token lasts two hours. Generation does not save a completed quiz; submission saves it for an authenticated student when the local database is available.

**Response** (`200`) includes `score`, `total`, `answered`, `saved`, `quizId`, `attemptId`, and `results[]`. Each result has `questionId`, `questionType`, `gradingState`, `correct`, `pointsAwarded`, `pointsPossible`, `feedback`, and `persistedQuestionId` (when saved). MCQs additionally return the selected/correct option and explanation after submission. Written results have `answerText` and `review`.

A graded written `review` has `correctAnswer` (exact textbook answer passages), `totalAwarded`, `totalPossible`, `totalDeducted`, and `criteria[]`. Each criterion has its one-mark expectation, `awarded`, `possible`, `deducted`, a specific reason, and a citation rebuilt from the stored textbook row (`chunkId`, chapter, section, page range, exact excerpt). The model can choose criterion grades and write reasons; it cannot supply citation metadata or excerpts. Source lookup uses the quiz chapter's board, class, subject, chapter number and textbook source type. Malformed results or missing source/criteria return `gradingState: "unavailable"`, `pointsAwarded: null`, and `review: null`; they are excluded from marked-summary calculations. Old two-hour quiz tokens without source-backed criteria are also unavailable for written grading.
Blank written answers are marked zero directly from the verified criteria without a Gemini call.

Migration `0024_quiz_grading_review.sql` adds nullable `quiz_attempt_answers.grading_review` for history replay. Apply it to the local database before expecting new attempts to save. Until then, graded responses can still be shown live with `saved: false`, and older history remains readable. No migration or deployment to the hosted project is performed automatically.

`400` means the token is missing, invalid or expired, or `answers` has the wrong top-level shape. `QUIZ_SECRET` must be configured consistently across instances.

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
