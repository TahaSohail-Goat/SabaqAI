# Grounded Quiz review handoff

2026-10-23: the shared review contract now requires separate adequacy, reasoning and concrete-example
checks in the SAME review call. An evidence-backed inadequacy repair can run once with budget for a
new independent review, preserving assessment verdict and comparison references. The configurable
default ceiling is six; lower explicit caps and the original total deadline still apply. This
supersedes older repair/call-budget notes below. See [current behavior and checks](ANSWER_ADEQUACY.md).

Implemented on `doubt-finalize`, based on integration commit
`a896a4846babeef51785b4c1ab12a28ea9744e0b`. PR target: `triage-branch`, not main.
This adds requested backend review after grading. It does not change Quiz generation, build a
Quiz help UI, implement Practice or implement the future triage system.

## Shared service and trust boundary

`src/lib/ask/service.ts` exports:

```ts
runAskService(
  input: GroundedAskInput,
  authorization: AskAuthorization,
  deps: AskDependencies,
): Promise<GroundedAskResult>
```

`GroundedAskInput` is a server-only union:

- `{ mode: 'student_question', request: unknown }`: strict existing Ask HTTP schema, conservative
  understanding, preservation checks and signed clarification. `/api/ask` uses this mode.
- `{ mode: 'quiz_review', review: QuizReviewContext, language: Language }`: validated server-loaded
  question/submission context. This preserves the exact stem, values, negation, units, options and
  response, skips free-form correction, and requires support review. There is no Quiz clarification
  token or browser-selectable bypass. Unusable assessment context returns `not_eligible`.

`AskAuthorization` contains server-authenticated `userId` and server-loaded
`profile: { board, classLevel, subjects } | null`. The service checks scope again and requires the
Quiz context owner to match that principal. Anonymous normal Ask retains its previous policy.
`AskDependencies` supplies the provider, scoped retrieval, validated config, cancellation signal,
requestId, hashed owner, trace and optional logging callback (defined in `ask/orchestrator.ts`).
Do not call `runAsk` directly from new routes: it is the shared orchestration implementation, not an
authorization boundary. Do not import service/provider/admin modules into browser code. Node crypto
and service-role access remain server-side, following the repository's existing conventions.

The Quiz adapter (`src/lib/quiz/explain.ts`) authorizes ownership and loads context before the
service. Its HTTP handler (`explain-http.ts`) handles the session, bounded JSON, rate slot, provider
construction, response statuses and overall deadline. The route delegates to that handler. There
is no internal HTTP call to `/api/ask` and no second retrieval/generation pipeline.

Academic evidence comes only from the existing scoped live embedding/retrieval adapter. Stored
Quiz chunk hints are deliberately not promoted into evidence. The key is an assessment claim to
check, never academic evidence. Private rubrics, grading feedback, numeric marks and account records
are not sent to the provider. Only the stem, options, relevant response, expected answer, incorrect/
partial label, curriculum scope and bounded evidence are supplied. Identity IDs are not supplied.

## Database prerequisite and assessment identity

Apply `supabase/migrations/0022_quiz_explanation_review.sql` through the normal reviewed migration
process before using the new grading persistence/endpoint. It was applied **only to local Supabase**
for development checks. No hosted migration, corpus rewrite or embedding operation was performed.

The existing model persists a new quiz/questions/key set only after submission and grading.
Attempts have `submitted_at`, not a draft/submission status machine. A before-insert trigger now
captures `review_snapshot` and `review_version` on each `quiz_attempt_answers` row. It verifies
question membership and records the submitted question/options/expected answer, curriculum,
response and grading values. The snapshot/version cannot be updated. Later question/key edits do
not change it. Numeric points and submission values must still match the snapshot when reviewing.

`grading_state` is explicitly `graded` or `unavailable`. Failed, missing, malformed or absent-key
written grading is unavailable, not an established zero-credit academic judgment. This work does
not regrade old marks or change their display. Legacy rows are **not backfilled**: without an
original submission snapshot, they return `snapshot_unavailable`. A future grading/release model
needs an explicit adapter extension; unknown/non-graded states fail closed.

Eligible: owned persisted submitted answers with supported context, recorded grading, a nonblank
response and less than full credit. Partially correct written answers remain eligible even when
the old half-credit `is_correct` flag is true. Full credit, unanswered, missing grading, modified
grading and unsupported contexts have explicit reasons. Wrong and missing IDs both return 404.

Identifier discovery:

- `/api/quiz/grade` retains token `results[].questionId` for existing UI compatibility and adds
  `attemptId` plus `results[].persistedQuestionId`. Use the latter UUID for review, only when
  `saved === true` and the ID is non-null. `saved` now reflects successful answer persistence.
- `/api/quiz/history` already returns attempt IDs. `/api/quiz/history/[id]` additionally includes
  `questions[].questionId`, the persisted UUID.
- Unsaved/anonymous token-only submissions cannot use this endpoint. Generate no help requests
  automatically during grading. Request help only on a deliberate student action.

## HTTP contract

`POST /api/quiz/explain`, same-origin authenticated session cookies including the existing activity
cookie. A completed curriculum profile is required. Strict JSON permits only:

```json
{
  "attemptId": "22222222-2222-4222-8222-222222222222",
  "questionId": "33333333-3333-4333-8333-333333333333",
  "language": "en"
}
```

Those UUIDs are invented examples; replace them with persisted IDs above. Language is `en` or `ur`,
default `en`. No scope, answer key, correctness, grading, prompt, mode or normalized flag is accepted.
Public TypeScript shapes live in `src/lib/types.ts`: `QuizExplainRequest`, `QuizExplainResponse`,
`QuizExplainIneligible`. Runtime validators are in `src/lib/quiz/explain-contracts.ts`.

[Complete synthetic supported-response example](quiz-review-example.json) wraps the inspected live
synthetic service result in the endpoint envelope. Its fixture UUIDs/chunk IDs are examples only;
the evidence and score are controlled test data, not real curriculum retrieval results.

| HTTP | `status` / code | Meaning |
| --- | --- | --- |
| 200 | `explained` | Supported explanation and assessment comparison |
| 200 | `assessment_review` | Evidence affirmatively conflicts with the assessment; marks unchanged |
| 200 | `insufficient_support` | Gate, citation, relevance, comparison or support checks could not establish a review |
| 200 | `not_eligible` | `not_submitted`, `snapshot_unavailable`, `grading_unavailable`, `grading_changed`, `unanswered`, `correct`, `unsupported_context` |
| 400 | `error / invalid_request` | Invalid/extra fields, malformed/oversized JSON |
| 401 | `error / unauthenticated` | Missing/expired session |
| 403 | `error / forbidden` | Missing profile or unauthorized current curriculum |
| 404 | `error / not_found` | Attempt unavailable/not owned, question not in attempt |
| 429 | `error / duplicate_request` or `rate_limited` | Duplicate/cooldown/concurrency or process rate limit |
| 502 | `error / invalid_output` | Invalid provider protocol |
| 503 | `error / configuration` or `unavailable` | Missing config/migration, database or provider failure |
| 504 | `error / timeout` | Work deadline expired |
| 499 | `error / cancelled` | Caller disconnected/cancelled; response may not reach that caller |

All responses carry `requestId`, `X-Request-Id` and `Cache-Control: no-store`. Rate responses also
carry `Retry-After`; duplicate errors include `retryAfterSeconds`. Operational failures never become
academic success. Representative envelopes (the explanation uses the unchanged full Ask contract):

```ts
// Successful supported review:
{ status: 'explained', requestId, attemptId, questionId,
  explanation: { status: 'answered', requestId, language: 'en',
    statements, blocks, citations, confidence, interpretation, boundary,
    notCovered: null, supportReview: 'model_reviewed' } }
// Proven conflict has exactly the same supported explanation shape:
{ status: 'assessment_review', requestId, attemptId, questionId, explanation }
// Academic refusal:
{ status: 'insufficient_support', requestId,
  refusal: { status: 'refused', requestId, reason: 'low_similarity',
    message, suggestion, nearestChapters, interpretation } }
// Ineligible (does not call providers):
{ status: 'not_eligible', requestId, reason: 'snapshot_unavailable' }
// A duplicate does not return someone else's or a cached answer:
{ status: 'error', requestId, code: 'duplicate_request', retryable: true,
  message: 'A review is running or was recently requested. Keep its result and wait before retrying.',
  retryAfterSeconds: 150 }
```

## Teaching, conflicts and rendering

The Quiz-only schema requires statement references for response comparison and expected-answer
reasoning. A mandatory independent support review must support both and agree with the assessment
verdict; valid chunk identity alone is insufficient. The teaching prompt distinguishes a possible
misunderstanding from an established written misconception. A key conflict requires affirmative
textbook contradiction; missing support or reviewer disagreement returns insufficient support.
Every academic statement remains canonical, cited, checked and rendered through existing blocks.
No private rubric, raw prompts, reviewer reasoning, stack trace or hidden reasoning is returned.

Render `result.explanation` with `AskResultView`. For `assessment_review`, also show a cautious
assessment-review notice; do not update marks. Refusal can render through the same view. Maintain
student answers and any prior help result during retries/errors. This branch adds no Quiz UI.

On citation click, use the validated `chunkId`, `chapterNo`, `sourceType` and page fields, together
with `explanation.boundary.scope`. Fetch `/api/ask/options` for that scope and select the matching
unit as Doubts already does. Pass that unit and citation to `AskDocumentReader`. It uses the actual
`pdfUrl` and rebases book page to chapter-PDF page:
`localPage = citation.pageFrom - unit.pageFrom + 1`. Never construct a URL or offset from model
text. When `pdfUrl` is absent, retain the labeled OCR fallback through `/api/ask/document`.
No PDF metadata or storage path was changed by this task. Actual browser clicks were not tested.

## Small frontend call example

```ts
import { quizExplainResponseSchema } from '@/lib/quiz/explain-contracts';

async function requestQuizHelp(
  attemptId: string, persistedQuestionId: string, language: 'en' | 'ur', signal: AbortSignal,
) {
  const response = await fetch('/api/quiz/explain', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attemptId, questionId: persistedQuestionId, language }),
  });
  const result = quizExplainResponseSchema.parse(await response.json());
  if (result.status === 'explained' || result.status === 'assessment_review') {
    // Store result.explanation and render AskResultView; retain the conflict status separately.
  } else if (result.status === 'insufficient_support') {
    // Render result.refusal calmly; do not substitute a generic answer.
  } else if (result.status === 'not_eligible') {
    // Display a suitable message for result.reason. Do not retry an unsupported old snapshot.
  } else {
    // Display result.message. On 429 honor Retry-After; on 503/504 offer a deliberate retry.
  }
  return result;
}
// Call from the help button only after grading; disable it while pending. AbortController.abort()
// cancels this caller. Handle browser AbortError without clearing its question/previous result.
```

## Deadlines, duplicate requests and cache limitations

The existing shared per-process limiter allows one active request/six requests per minute per
hashed owner, four active/thirty per minute per instance. Anonymous normal Ask behavior is unchanged.
Those counters are not advertised as distributed. Quiz additionally claims a database lease under
an advisory transaction lock: one active Quiz review per user and four globally, across instances.
Provider work runs outside that transaction. Missing RPC/migration fails operationally before any
retrieval/model work; there is no process-map substitute.

Lease identity hashes owner, attempt, question, immutable snapshot version, language, pipeline/
prompt versions, model and config. A duplicate receives 429 immediately, not a shared waiter.
Only the winner owns its abort signal. Rejecting/cancelling a duplicate cannot abort the winner.
There is **no explanation cache** and no result endpoint. Success/academic refusal suppresses
duplicates for five minutes; operational failure/cancellation for sixty seconds. A crashed worker's
lease expires after 150 seconds. Cleanup is token-checked, independently bounded to five seconds,
and cannot release a successor's lease. Old coordination rows are pruned on subsequent claims.

Work timeout follows Ask configuration capped at 110 seconds; up to five additional seconds are
reserved for cleanup within the 120-second route budget. Provider calls are bounded by the existing
call cap, with understanding and repair skipped in Quiz mode: normally one embedding retrieval,
token count, one explanation and one support review. One token recount may occur after evidence
reduction. Refusal at the final gate makes no later model call. Cancellation cannot undo provider
work already accepted/billed. A lost successful response cannot be recovered from a cache; retain
the client result and honor the cooldown before requesting again. A future persistent result cache
would need an evidence revision and per-request reauthorization, not just this coordination key.

## Actual validation and limitations

- Node 24 type check and offline Ask/Quiz suite: 83 tests passed, none skipped. Notification suite:
  16 passed. HTTP handler tests cover auth, input bounds, status/headers, rate errors and cancellation.
  A credential-free Linux Node 24 copy also passed npm ci, lint, both suites and the normal
  Turbopack production build. The existing PDF.js legacy-build warning remains.
- Local migration SQL: 13 assertions, rolled back fixtures; snapshot immutability/membership,
  written partial credit, private-rubric exclusion, grants/RLS, lease/token/cooldown and unchanged marks.
  Migration 0022 itself remains applied locally. Existing chunk IDs/content-hash fingerprint and
  assessment row counts were unchanged after the integration smoke's cleanup.
- Real local database adapter plus **synthetic evidence/provider**: 404 ms, two generation-stage
  fixture calls, one retrieval. Load 109 ms; controlled explanation wait 202 ms. Two independent
  Supabase clients demonstrated duplicate rejection. A different owner was denied. Fixtures were
  deleted; no account created. This is not live retrieval/teaching accuracy or a browser session test.
- Live Gemini with **synthetic** question/response/evidence: the first 3,844 ms result omitted the
  response comparison, prompting the stricter contract. The updated supported review took 4,327 ms
  (token count 643 ms, explanation 2,375 ms, support review 1,279 ms). The deliberately wrong key
  returned `assessment_review` in 4,333 ms (755/2,054/1,495 ms). Both used two generation calls;
  the returned canonical prose was inspected. No embedding/corpus/account data was sent in these
  synthetic provider checks. These few measurements do not solve or characterize Ask latency.
- Browser/mobile interaction, human teaching-quality acceptance and real-corpus Quiz review remain
  unverified. The older Ask latency/reliability limitations still apply. No deployment is claimed.
- Legacy grading failures retain old numeric marks, but are not eligible for explanation. This does
  not retrofit a grading job/status/release system or support arbitrary formulas beyond existing Ask
  validation. Production requires the reviewed migration and normal deployment/release checks.
- Existing grading persistence is still multi-step rather than transactional. Failed answer
  persistence can leave an incomplete attempt row; `saved` is false and review cannot invent its
  missing answer/snapshot. This work does not redesign that persistence workflow.

Opt-in local database smoke (never hosted):
`node --env-file=<private-local-overlay> --require tsx/cjs scripts/test-quiz-review-local.ts --local`.
The script rejects non-loopback URLs, reuses an existing account/chapter, creates/deletes only its own
assessment fixtures, and makes no live provider calls. SQL test:
`supabase/tests/002_quiz_explanation_review.sql` after applying migration 0022 to the chosen dev DB.

## Future Practice adapter

A Practice adapter must authenticate its caller, authorize curriculum/source access and load its
own immutable submission/question version and permitted grading/release state before invoking the
service. It must not reuse a Quiz attempt ID as Practice authorization. It needs its own validated
internal context contract and durable duplicate coordination appropriate to that data model.
The existing student-question mode can serve an authorized ordinary question; assessment review
must use a deliberately supported mode, not browser-supplied trusted flags. This work provides the
shared server boundary and teaching pipeline, not a Practice endpoint, schema or finished adapter.
