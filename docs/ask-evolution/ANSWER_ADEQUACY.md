# Answer adequacy and grounding — 2026-10-23

Implemented on `doubt-finalize`. The screenshot's definition-only answer was reproducibly valid
under structural/citation checks. The renderer displays every canonical statement and its block;
it was not hiding a longer explanation. The prior review contract had factual-support verdicts,
but no separate assessment of whether the answer actually taught what the student asked.

## Behavior

The existing independent review call now returns two separate decisions:

- Grounding: every statement's cited evidence, core support, conditions and factual coherence.
- Adequacy: complete, useful partial or inadequate; whether reasoning is addressed, unsupported,
  omitted or not requested; and whether a concrete example is used, available but omitted,
  unavailable or unnecessary. Missing aspects are explicit, bounded limitation labels.

A list of type/category names is not a concrete example. Teaching must connect a source-supported
relationship or example to the student's intent. A short definition can adequately answer a
definition request. How/why explanations cannot merely repeat a definition, even with a partial
label. A narrow consistency check enforces that rule for definition-only structured output, while
allowing genuine definition requests such as “How is X defined?” The semantic review remains
responsible for the full meaning, multipart coverage, comparisons, conditions and examples.

Missing-evidence reasoning cannot retain a complete label. Useful meaning/examples with a missing
mechanism are partial and show that limitation. Omitted answerable reasoning/examples are inadequate.
Nothing imposes arbitrary word, paragraph or example counts. Model labels alone cannot bypass
contradictory reasoning/example checks. New review fields are mandatory; old or malformed review
responses fail closed rather than defaulting to adequate. Disabling review cannot return a new
unchecked answer. Legacy saved answer shapes remain readable, but are not retroactively regraded.

## Bounded repair

An inadequate, factually grounded answer may get one repair only when the reviewer supplies exact
improvement excerpts from the SAME authorized final evidence. Unknown source IDs, rewritten excerpts
and missing evidence cannot authorize repair. Fluent unsupported claims are refused, not repaired
into apparent provenance. A repair never changes source/chapter, retrieval, OCR or embeddings.

Before starting, the orchestrator reserves BOTH repair generation and a NEW independent review.
Repair input is token-counted, structural and citation checks run again, original limitations survive,
and both grounding and adequacy must pass the new review. A failed repair cannot trigger another.
Provider errors, cancellation, oversized input and deadline exhaustion cannot return the draft.
The one-repair limit is shared with the existing optional structural-repair path.

The configurable default ceiling increases from four to six to accommodate four routine uncertain-
evidence calls plus at most two repair calls. This is a ceiling, not six routine calls. Explicit
lower `ASK_MAX_LLM_CALLS` values remain binding. A four-call uncertain-evidence request has no repair
slots; a five-call cap cannot start a two-call repair after four stages. The 110-second default
request deadline and 120-second route ceiling are unchanged. An adequate request uses the same
number of model calls as before. No extra routine adequacy call was added.

The shared Quiz service uses the same contract. Its server-owned question, submitted answer,
expected answer and comparison references must still pass independent review after repair. A repair
cannot change its assessment verdict, marks, snapshots, ownership, scope or answer keys. Sources,
PDF URLs and chapter-page rebasing are untouched. Final retrieval REFUSE remains terminal.

The earlier uncommitted excerpt-based false-refusal fix is included as a prerequisite in this
checkpoint. Its historical report is [FALSE_REFUSAL_FIX.md](FALSE_REFUSAL_FIX.md); current adequacy
behavior supersedes its claims about complete explanations and the former four-call ceiling.
No cosine thresholds were lowered or tuned in either change.

## Before and after evidence

The user-visible before draft was:

> A non-contact force is a force that acts at a distance without any physical contact between
> bodies, meaning it acts even if the objects involved are not touching.

It had one definition statement, a page-63 citation and `coverage:sufficient`. Structural validation
accepted it. A separate one-call live review of that draft against the actual OCR marked its facts
supported but still leniently called it partial (4,857 ms). The stricter current contract and
definition-only consistency check do not admit that historical review as an adequate explanation.
The exact recording is retained, not rewritten to invent a new live verdict.

The local source is FBISE Class 9 Physics, Chapter 3 Dynamics (English), source
`81855080-15fb-4971-b9da-5f1ddb616f74`. The relevant real chunk is
`2ba6fc9f-df86-450b-bb34-309f9b5b19f0`, stored section pages 63–64. It contains the
definition, Moon/Earth, charged-particle and magnetic-pole examples, followed by broader fundamental-
force material. The whole chunk is preserved. An adjacent general description is not automatically
a complete mechanism for every requested subtype; the output must preserve actual limitations.

Live probes use real local hybrid retrieval, Jina and Gemini with no account data, QA writes or
database mutation. Only named probes run; the full Class 9 catalogue was not sent to paid APIs.
Intermediate live outputs sometimes compressed examples into category names. Explicit reasoning and
concrete-example review fields were added to expose and reject that omission. An explicit omission
now overrides an optimistic partial/complete summary, retaining only exact validated repair evidence.

The final-schema probes observed:

| Probe | Actual outcome | Teaching | Review | Total | Model calls |
| --- | --- | ---: | ---: | ---: | ---: |
| Reported how question | Useful partial; concrete Moon/Earth example and missing mechanism disclosed | 2,107 ms | 2,149 ms | 31,358 ms | 4 |
| Definition question | Answered, complete | 2,376 ms | 1,793 ms | 10,492 ms | 4 |
| Definition/examples plus derivation | Operational `invalid_output` at exact-excerpt assessment; NOT an academic pass | not called | not called | 5,056 ms | 2 |
| Magnetic-disk keyword trap | Refused before teaching | not called | not called | 9,525 ms | 2 |

The original response now included:

> A non-contact force is a force that acts at a distance without any physical contact between bodies,
> so it acts even if the objects involved are not touching.
>
> Non-contact forces are also termed as action at a distance forces, such as the gravitational force
> experienced by the moon because of the earth.

It cited the actual 63–64 chunk and explicitly said the retrieved material did not establish the
detailed underlying mechanism. Coverage and adequacy were partial, not complete. It did not invent
an underlying explanation to fill that gap. The definition request was complete and did not require
extra causal teaching. The recorded outputs in the regression fixtures remain exact provider outputs,
including the failed multipart probe. They are not rewritten academic ground truth.

The multipart failure came from the provider changing a word inside an alleged exact OCR excerpt.
Strict validation rejected it without publishing any answer. Earlier probes also exposed an omitted
garbled OCR token and conflicting review labels; neither was counted as a successful answer. The
explicit-omission label inconsistency is now handled conservatively as inadequate, with exact repair
evidence still required. Exact-quote/provider variability remains an upstream operational limitation.

No extra routine model call was added for adequacy. A prior actual request's support review took
1,556 ms; the final how request's combined grounding/adequacy review took 2,149 ms. These are different
requests, not a controlled latency experiment. The final request also spent 13,124 ms in understanding
and 9,897 ms in token counting, which explains much of its total time. No speed claim is made. Successful
and failed optional repair/re-review sequences were exercised in fixtures; a paid live repair sequence
was not completed, so its extra latency is not measured.

## Regression coverage

Offline tests cover the original OCR/score case, grounded but inadequate definitions, short adequate
definitions, how/why consistency, supported reasoning/examples, missing mechanisms, multipart gaps,
fluent unsupported claims, exact repair evidence, one successful repair, failed repair, re-review
grounding failure, deadline/provider exhaustion, lower call budgets and shared Quiz comparison review.
Stored live recordings are replayed without providers. These are contract/control-flow regressions,
not a new live evaluation or a corpus accuracy estimate. The separate pending Class 9 catalogue is
deliberately excluded from this task's commit; its existing local files remain untouched.

Browser visual/citation-click verification is not claimed. HTTP availability, render tests, source
metadata checks, offline fixtures and paid-provider observations are reported separately. Generative
review can still err; these bounded probes cannot establish broad teaching quality or calibration.

## Final verification

Windows Node 24.18.0: the working tree passed lint and 150 offline Ask/Quiz/UI tests. An isolated
credential-free export of the actual staged files (only `.env.example`, no local env) completed
`npm ci`, `npm run lint`, 143 Ask/Quiz/UI tests, 16 notification tests and the normal Turbopack
production build. No tests were skipped. The seven-test difference is the deliberately uncommitted
Class 9 catalogue integrity suite. No paid APIs are used by these automated tests; recorded failures
assert safe rejection, not successful academic outcomes. The production build reported a nested-
workspace lockfile warning and the existing PDF Node legacy-build notice; it still completed.

No database/schema/storage changes, re-embedding, dependency changes or branch merges were made.
The local server is kept separate from the isolated build. Exact staged paths were inspected and
credential-pattern checks found no matches; backups, local accounts, recovery files, the unrelated
catalogue and other pre-existing untracked work are excluded from this checkpoint.

## Provider reliability follow-up

The next browser failures were operational, not semantic refusals. Requests
`6eaffaf8-edda-4283-8300-408019a1e495` and `46678f39-130f-47f3-b6a0-f143a1e61121`
failed at understanding after about 10.6 seconds, without an upstream HTTP status in the older
diagnostics. Request `6c632fa0-6736-47bf-85b1-bec62d0d0567` explicitly received Gemini HTTP 503
during explanation. A separate request hit the original 110-second deadline during slow provider
stages. Neither missing PDFs nor source/chapter selection caused those failures.

Safe provider diagnostics now record only whitelisted retry codes and existing boolean/status
metadata, never raw SDK errors, prompts, URLs or keys. Identified connection failures and HTTP
502/503/504 can retry ONCE across the entire request. Quota, auth, malformed output and schema errors
cannot trigger this retry. Each model attempt consumes a call slot; token counting shares the same
one-retry allowance without adding a model call. Deadline/cancellation and two-slot repair reservations
remain binding. Persistent upstream outage still returns a truthful operational failure.

Ten offline transport regressions cover recovery, repeated failures, cross-stage retry sharing,
explicit caps, HTTP quota/auth/service distinctions, abort/deadline handling and token counting.
The local server was restarted to load the new implementation; a successful HTTP login response
only establishes UI availability and is not counted as an Ask success.

After restart, a real `POST http://localhost:3100/api/ask` for the original question returned HTTP
200 and an answered result (`bc568f51-1c3b-47ec-8685-03ecc83e6f69`), three cited teaching statements,
the correct Dynamics source and partial coverage. Client time was 49,348 ms; server trace 49,167 ms.
Understanding took 16,386 ms, evidence assessment 11,867 ms, teaching 9,710 ms and review 7,708 ms.
That successful request did not need a retry. Retry recovery/failure paths were tested with controlled
fixtures, not by claiming an unobserved live retry. This is one successful HTTP check, not browser
visual verification or a guarantee of upstream availability. The model was not switched.
The updated commit-only export passed lint and 153 offline Ask/Quiz/UI tests (none skipped);
the working tree's 160 tests include the seven separately uncommitted catalogue checks.
The 16 notification tests passed. Production build was not repeated for this server-library-only
follow-up; the earlier adequacy checkpoint's isolated production build result remains historical.
