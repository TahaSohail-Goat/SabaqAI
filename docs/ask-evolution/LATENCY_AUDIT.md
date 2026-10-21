# Ask/Doubts implementation and latency audit

Written 2026-10-21 (Asia/Karachi). Fresh measurements below were captured on 2026-10-20,
21:48–21:51 PKT. Branch: `evolved/asks-doubts`; comparison baseline: `fe49875`.

Subsequent local PDF recovery is documented in [PDF_RECOVERY.md](PDF_RECOVERY.md): 497 sources now
have checked local PDF links, with one unresolved year identity. The missing-PDF statements below
describe the audit snapshot. Browser clicking is still unverified; no latency optimization followed.

**Finding:** the evolved path is connected and has produced real, cited, model-reviewed answers,
but it is not ready to call complete. Three dependent Gemini generations dominate successful
requests. Upstream failures also occur before retrieval. Local database speed is not the main
problem in the measured runs. Concept coverage, live reliability, browser acceptance and human
review remain incomplete. No implementation, model, grounding threshold or feature flag was
changed for this audit.

## Evidence and measurement limits

This audit inspected current source, the baseline route/generator through `git show HEAD:...`,
the original master harness, tests, saved results, and fresh authenticated HTTP requests. It
did not infer runtime success from documentation alone.

The four fresh cases used the existing production build on an isolated audit server at
`localhost:3101`, with the private local Supabase overlay. A temporary Node preload under ignored
`.recovery/` observed outbound fetches and the route's existing operational trace. The app files
were untouched. The preload recorded operation names, timestamps, HTTP status, usage counts and
bounded evidence metadata; it did not print keys, prompts, account records or model reasoning.
Response-clone observation adds some unquantified instrumentation overhead. This is a diagnostic
sample, not a load test, latency percentile or academic accuracy measurement.

Private reproducibility artifacts:

- `.recovery/ask-audit-preload.mjs`: audit-only fetch/trace observer.
- `.recovery/ask-audit-client.mjs`: one authenticated, sequential request per case.
- `.recovery/ask-latency-audit-client.json`: client receipt timings and request IDs.
- `.recovery/ask-latency-audit-events.jsonl`: per-operation metadata and existing route traces.
- `.recovery/ask-latency-audit-*-result.json`: synthetic test results, including errors.

Only questions and bounded retrieved passages went to the already authorized Jina/Gemini
destinations. Stored chapter vectors were reused. No chapter was re-embedded; hosted data was
not modified. Ordinary endpoint analytics wrote only to the local test database.

The restored curriculum contains 8,594 embedded chunks (1,024 dimensions), 494 chapters, 498
sources and 8,491 sections, according to the completed restore checks. The fresh requests used
that corpus through actual Jina query embeddings and local PostgREST/pgvector, not the demo fallback.
The archive checksum and restore procedure are in [EVALUATION.md](EVALUATION.md).

Observed configuration: `gemini-3.5-flash-lite`, `jina-embeddings-v3`, `TOP_K=20`, retained seeds 6,
maximum context 10, neighbor window 1, context token limit 7,000, output limit 4,000 per generation,
total deadline 110,000ms, maximum four generations. Understanding, expansion and support review
are enabled; repair is disabled. Effective environment thresholds are PASS top1 .62,
BORDERLINE top1 .52 and support .50. These differ from the code fallbacks .55/.45/.50;
they were not changed or recalibrated here. Do not confuse either set with new calibration evidence.

Browser discovery was repeated and returned `apps:[]`, `browsers:[]`. Therefore all fresh results
are endpoint tests, not clicks through the page. Frontend event-to-fetch delay, browser paint,
mobile layout and disconnect propagation are unknown. On resuming the audit, port 3101 refused
connections; the timed run had already completed and its artifacts were intact. Do not assume
either app port is still running. A read-only Docker/config check earlier failed automatic
approval review because of a usage-limit error, not an unsafe-action determination. Nonsecret
configuration was subsequently read locally; Docker health was not freshly rechecked.

## What changed from the baseline

The previous route did permissive request parsing, optional scope defaults, deterministic Roman
Urdu substitutions, one embedding/search, the similarity gate, one unstructured-JSON answer call,
identity-based citation filtering and logging. Errors could be labeled as low-similarity refusals.
It had no LLM understanding, secure clarification, bounded neighbor evidence, structured teaching
blocks or semantic support review.

The current route delegates to a typed orchestrator, returns clarification and operational-error
variants, authorizes signed-in scope against the real profile, and caps request size, calls,
concurrency and total time. The existing `/doubts` page and reader consume the new response. General
Chat, quiz policy and the model factory were not replaced. The old generation helper remains in
the repository but is no longer called by `/api/ask`.

### Actual connected request path

| Stage and reason | Files/functions | Technology and when | Integration and limits |
| --- | --- | --- | --- |
| Submit selected curriculum and exact input; prevent duplicate/late results | `src/app/(app)/doubts/page.tsx`: `handleAsk`, `cancelRequest`, sequence/submit refs | Browser code; explicit submit/clarification/retry only | Integrated. No effect calls POST Ask. Options/reader effects make separate GETs. Browser interaction untested. |
| Validate body, identity, scope and budget before exporting the question | `src/app/api/ask/route.ts`: `POST`; `contracts.ts`: `askRequestSchema`, `scopeSchema`; `limits.ts`: `readBoundedJson`, `acquireAskSlot`, `withinDeadline` | Zod, auth/profile database reads, ordinary code; every request | 32KB body, default 1,600 characters, FBISE and offered class/subject; signed-in profile enforced. Anonymous API access retained. Limits are instance-local, not distributed. |
| Correct question and extract intent/concepts without answering | `orchestrator.ts`: `runAsk`; `provider.ts`: `createAskProvider().json`; `src/prompts/question-understanding.ts` | One structured Gemini generation for fresh input and free-text continuation | Integrated, default on. Distinct original, normalized and full retrieval questions. Typo live success; Urdu/Roman Urdu breadth mostly fixtures. Clear input still pays this call. |
| Preserve scientific meaning | `preservation.ts`: `protectedSpans`, `preservationFailures`, `optionPreservationFailures` | Regex/aliases, numeric equivalence, quantity-unit pairs and polarity checks; before/after understanding and on options | Integrated conservative checks for quantities, symbols, selected formulas/terms, chemical notation, negation and direction. Not a complete language/science parser; missing terms and equivalent translations remain risks. Unsafe ready rewrite becomes clarification. |
| Clarify without generating an answer; safely resume confirmed meaning | `clarification.ts`: `issueClarification`, `resumeClarification`; `runAsk`; `AskResultView.tsx` | HMAC context binds original, owner, scope, language, allowed choices and expiry; only ambiguous/preservation-failure requests | Integrated options/free text. Option selection skips normalization; free text is new untrusted input and is normalized once. One continuation, default 10-minute expiry. No durable state. Shared secret required across instances; process-random fallback invalidates on restart. |
| Retrieve the complete confirmed question | `evidence.ts`: `liveAskRetrieval.seeds`; `ai/retrieval.ts`: `retrieve`; `ai/embeddings.ts`: `embedText` | One Jina query embedding, one `match_content_chunks` RPC, one row-hydration query; ready requests only | Integrated. Mandatory board/class/subject plus selected source/chapter. Unrounded scores. `preserveQuery:true` avoids legacy second normalization. `requireLive:true` forbids demo fallback. No alternate search is implemented. |
| Remove overlapping/source duplicates and find nearby conditions/examples | `evidence.ts`: `independentSeeds`, `liveAskRetrieval.neighbors`, `assembleEvidence` | Ordinary code plus up to one sequential range query per seed; expansion enabled and seeds exist | Integrated but narrow: same source and same stored section, actual chunk index, neighbor score null. Body concept-word match or explicit qualification required. Strong word-set overlap removed. Highest-ranked source per chapter retained; no explicit edition/conflict resolver. |
| Assemble exact bounded evidence and boundary | `assembleEvidence`, `makeBoundary`; `runAsk` envelope/token reduction | Ordinary code plus Gemini `countTokens` endpoint; nonempty evidence | Scope/IDs/pages, roles, constraints and truncation are server-built. Whole chunks only; condition neighbors prioritized; max 10 chunks and byte ceiling. One measured count and at most one reduction/recount. **Requested-aspect coverage is not established before generation:** initial coverage is merely partial/insufficient and aspect lists empty. |
| Authorize explanation from genuine scored evidence | `ai/guardrail.ts`: `evaluateConfidence`; `scoredEvidence`; `runAsk` | Ordinary similarity gate; after final evidence selection | Integrated, finite-score/config validation, fail closed. Null-score neighbors never increase support. Final REFUSE starts no subsequent provider call. A pre-gate understanding/countTokens call can already have occurred, as explicitly allowed by the harness. |
| Teach and provide supported examples | `src/prompts/grounded-answer.ts`: `TEACHING_PROMPT`; `runAsk` explanation stage | One structured Gemini generation after PASS/BORDERLINE | Integrated canonical statements, direct-answer/explanation/example blocks, partial coverage and missing aspects. Book example versus original illustration distinguished. Numerical checker supports only three Ohm-law forms; general worked problems are incomplete. No invented fallback. |
| Validate structure, quantities/calculations and citation allowlist | `validation.ts`: `checkTeaching`, `citationsFor`; `ai/citation.ts`: `validateCitations` | Zod and ordinary code; generated answers | Exact final evidence IDs, unique statements/block membership, answerability, language, markup, restricted arithmetic/origins checked. Citation chapter/section/page/excerpt rebuilt from hydrated rows. No ID reassignment. New path refuses whole invalid explanation rather than filtering a causal chain. Identity alone does not prove support. |
| Check each academic statement semantically | `src/prompts/ask-support-review.ts`: `SUPPORT_PROMPT`; `runAsk`; `validation.ts`: `checkReview` | One Gemini generation after a valid answerable explanation; default on | Integrated. Full answer and all retained evidence resent. Exact statement-ID set; verdict citations must belong to that statement. Any unsupported/uncertain verdict, incoherence or unsupported core refuses the whole answer. Fallible model review, not teacher approval. |
| Repair an invalid structure/calculation without widening evidence | `runAsk` repair branch; `REPAIR_PROMPT`; `checkTeaching` | At most one Gemini generation, only if explicitly enabled and deterministic failures exist | Disabled by default; fixture-tested. Same evidence, then complete revalidation and normal review. Invalid JSON/schema errors do not enter this repair branch. Semantic-review failures are refused, not repaired/re-reviewed. |
| Persist metadata, rebuild coverage and send one validated response | `runAsk`; route log callback; `qa-log.ts`: `logQuestion` | Ordinary code and up to two sequential local writes; completed gate/answer paths | Integrated. Logging is awaited best effort. Operational failures/clarification use console traces, not ordinary qa_log rows. Usage tokens and detailed rejection reasons are missing from normal production traces. |
| Render prose with source connections and neutral refusal/error states | `AskResultView.tsx`; existing `AskDocumentReader`; `askResponseSchema` | React text rendering; schema-validated network/restored state | Integrated, interpretation edit, choices/free text, near-claim references, secondary excerpts, example labels and Urdu block direction. Original textarea retained. AbortController/sequence invalidation on edits/scope/language/unmount. Truthful general loading plus Cancel; no fictitious stage stream. Actual browser behavior unverified. |

All implementation paths above are under `src/lib/ask/` unless a longer path is given. Schema
simplification in `provider-schema.ts` removes decoder bounds/patterns from the wire grammar to
avoid an actually observed Gemini 400 complexity rejection; full runtime Zod bounds remain enforced.
That compatibility layer has evidence behind it. It is not semantic validation.

## Fresh four-case timing results

All scopes: FBISE / Class 10 / Physics / textbook / English. Clear and typo use chapter 2;
ambiguous and unsupported use chapter 7. Login succeeded with a real local account (HTTP 200,
231ms setup, outside request totals). Requests were sequential, with no manual retries and no
429 responses. Each generation and embedding attempt was observed once.

| Test question | HTTP / actual outcome | Generations | Client total | Server total | Client minus server |
| --- | --- | ---: | ---: | ---: | ---: |
| Why does evaporation make things cold? | 503 `unavailable`; upstream understanding HTTP 504 | 1 | 109,205ms | 109,142ms | 63ms |
| why evapration make thng cold | 200 answered / sufficient; 3 statements, 1 rebuilt citation | 3 | 71,814ms | 71,791ms | 23ms |
| current ka effect | 503 `unavailable`; upstream understanding HTTP 503 | 1 | 888ms | 866ms | 22ms |
| Who won the football World Cup in 2022? | 200 refused / low_similarity | 1 | 14,660ms | 14,628ms | 32ms |

The first is a clear, source-supported *intent* test, not a successful clear-answer test: its
provider failure prevented retrieval. The typo normalized to the same complete question, retained
the exact original and produced two explanation statements plus a labeled textbook example.
Its citation is the stored page-57 evaporation passage. Prior API inspection confirmed this passage
and example against the source reader; the fresh result retained that same ID. For this audit,
the six retained passage identities/topics were also inspected in the supplied curriculum COPY
records. A later source-endpoint recheck was blocked by the stopped audit server, so it is not
reported as a new successful API check.

### Timing conventions

The following tables use measured fetch-start through cloned JSON-body receipt for individual
HTTP operations. Existing orchestrator stage durations include SDK/parsing overhead and therefore
differ slightly. These nested measurements must not be summed with their enclosing stages.
Tokens are provider-reported prompt/candidate counts, not estimates. A dash means not applicable;
unknown means not measured/reported. Jina reports total input tokens, not generated output.
All recorded attempts have **zero retries**; 0 calls means the stage did not execute.
Server deterministic boundary/gate/validation and React-render timings were not individually
instrumented and remain unknown rather than being assigned the residual.

### Clear supported-intent request

| Stage | Provider/model or operation | Calls | Input/output tokens | Duration | Retries | Outcome |
| --- | --- | ---: | --- | --- | ---: | --- |
| Frontend/network | Node HTTP client to local Next | 1 | — | 63ms client minus server; browser unknown | 0 | JSON error received |
| Auth/profile | Local auth + users/profile/subjects | 4 | — | 8ms auth; 27/23/24ms reads, reads concurrent | 0 | Scope authorized |
| Understanding | Gemini 3.5 Flash Lite | 1 | unknown / unknown | 109,083ms fetch; 109,091ms stage | 0 | Upstream HTTP 504; route maps to 503 unavailable |
| Query embedding | Jina | 0 | — | — | 0 | Not reached |
| Retrieval query/hydration | Local pgvector/PostgREST | 0 | — | — | 0 | Not reached |
| Expansion/boundary | DB/ordinary code | 0 | — | — | 0 | Not reached |
| Token count/gate | Provider/ordinary code | 0 | — | — | 0 | Not reached |
| Explanation/support review | Gemini | 0 / 0 | — | — | 0 | Not reached |
| Repair/revalidation/citations | Model/ordinary code | 0 | — | — | 0 | Not reached |
| Logging/final rendering | Console/error JSON; browser | 0 DB writes | — | Console/serialization unknown; render unknown | 0 | Typed error, no claims |
| Total | Authenticated endpoint | 1 generation | unknown | **109,205ms client** | 0 | Operational failure |

The provider returned a real HTTP response with status 504 after 109,077ms to headers. This was
not a local inability to connect, and it arrived before the app's 110s abort. DNS/TCP/TLS versus
upstream queue/compute time was not separately measured. HTTP success on other calls does not
identify why this particular upstream request waited.

### Understandable typo request

| Stage | Provider/model or operation | Calls | Input/output tokens | Duration | Retries | Outcome |
| --- | --- | ---: | --- | --- | ---: | --- |
| Frontend/network | Node HTTP client to local Next | 1 | — | 23ms client minus server; browser unknown | 0 | Valid answer JSON received |
| Auth/profile | Local auth + users/profile/subjects | 4 | — | 19ms auth; 36/29/30ms concurrent reads | 0 | Scope authorized |
| Understanding | Gemini 3.5 Flash Lite | 1 | 430 / 152 | 26,546ms fetch; 26,559ms stage | 0 | Ready; full question retained |
| Query embedding | Jina embeddings v3, retrieval.query | 1 | 23 total / — | 1,681ms | 0 | 1,024-dimensional query vector |
| Retrieval query 1 | `match_content_chunks` RPC | 1 | — | 42ms | 0 | Real filtered scores; six retained seeds |
| Hydration | Scoped stored-row join | 1 | — | 14ms | 0 | Source identities loaded |
| Retrieval enclosing stage | Embed + RPC + hydration/parsing | — | — | 1,751ms | 0 | No alternate search |
| Neighbor query 1–6 | Scoped same-section chunk ranges | 6 | — | **41, 17, 12, 21, 11, 26ms**, respectively | 0 | No additional neighbor rows |
| Expansion enclosing stage | Neighbor loop | — | — | 137ms | 0 | Zero expanded chunks |
| Boundary/context assembly | Ordinary code | 1 | — | unknown separately | 0 | Six seeds; untruncated |
| Token count | Gemini countTokens | 1 | 5,470 counted; output — | 275ms fetch; 278ms stage | 0 | Below limit; no recount |
| Final gate | `evaluateConfidence` | 1 | — | unknown separately | 0 | BORDERLINE; top1 .543676240930671 |
| Explanation | Gemini 3.5 Flash Lite | 1 | 5,470 / 477 | 6,039ms fetch; 6,045ms stage | 0 | Answerable/sufficient; three statements |
| Deterministic validation | `checkTeaching`, later `citationsFor` | 1 each | — | unknown separately | 0 | No recorded rejection |
| Support review | Gemini 3.5 Flash Lite | 1 | 4,860 / 358 | 36,875ms fetch; 36,879ms stage | 0 | Exact three verdicts supported; core/coherence true |
| Repair/repeated validation | Optional repair path | 0 | — | — | 0 | Disabled; no repair loop |
| Logging | Local qa_log, qa_log_chunks | 2 | — | 29ms, 19ms fetch subsets | 0 | HTTP 201 each |
| Final rendering | JSON/React | — | — | Serialization unknown; browser render unknown | — | Endpoint success only |
| Total | Authenticated endpoint | 3 generations + 1 count + 1 embedding | Gemini prompt 10,760; output 987 | **71,814ms client** | 0 | Answered |

Provider-generation fetch durations total 69,460ms. The rest of the client request took 2,354ms
(derived subtraction, **not** a measurement of any single stage). The server's named stages sum
to 71,649ms, leaving 142ms collectively for auth, validation, assembly, gate, logging and other
unseparated work. These figures show where time went without inventing a CPU-stage breakdown.

### Ambiguous request

| Stage | Provider/model or operation | Calls | Input/output tokens | Duration | Retries | Outcome |
| --- | --- | ---: | --- | --- | ---: | --- |
| Frontend/network | Node HTTP client to local Next | 1 | — | 22ms client minus server; browser unknown | 0 | Error JSON received |
| Auth/profile | Local auth + users/profile/subjects | 4 | — | 18ms auth; 44/39/47ms concurrent reads | 0 | Scope authorized |
| Understanding | Gemini 3.5 Flash Lite | 1 | unknown / unknown | 779ms fetch; 785ms stage | 0 | Upstream HTTP 503 |
| Query embedding | Jina | 0 | — | — | 0 | Not reached |
| Retrieval/expansion/boundary | DB/ordinary code | 0 | — | — | 0 | Not reached |
| Token count/gate | Provider/ordinary code | 0 | — | — | 0 | Not reached |
| Explanation/support review | Gemini | 0 / 0 | — | — | 0 | Not reached |
| Repair/revalidation/citations | Model/ordinary code | 0 | — | — | 0 | Not reached |
| Logging/final rendering | Console/error JSON; browser | 0 DB writes | — | unknown separately / browser unknown | 0 | Operational error, not false clarification |
| Total | Authenticated endpoint | 1 generation | unknown | **888ms client** | 0 | Operational failure |

Earlier saved live evidence independently establishes clarification behavior: the same wording
produced Heating/Magnetic/Chemical choices, and signed option resumption retained the original
and selected interpretation without another normalizer call. Changed chapter/forged option were
400; unauthorized class was 403. That earlier resumption ended in an evidence refusal. It does
not turn this fresh upstream failure into a passed clarification test.

### Unsupported request

| Stage | Provider/model or operation | Calls | Input/output tokens | Duration | Retries | Outcome |
| --- | --- | ---: | --- | --- | ---: | --- |
| Frontend/network | Node HTTP client to local Next | 1 | — | 32ms client minus server; browser unknown | 0 | Refusal JSON received |
| Auth/profile | Local auth + users/profile/subjects | 4 | — | 5ms auth; 8/11/8ms concurrent reads | 0 | Scope authorized |
| Understanding | Gemini 3.5 Flash Lite | 1 | 452 / 75 | 13,599ms fetch; 13,603ms stage | 0 | Ready; no answer generated |
| Query embedding | Jina embeddings v3 | 1 | 23 total / — | 504ms | 0 | Query vector |
| Retrieval query 1 | `match_content_chunks` | 1 | — | 26ms | 0 | Six low-relevance retained candidates |
| Hydration | Scoped stored-row join | 1 | — | 16ms | 0 | Correct curriculum rows |
| Retrieval enclosing stage | Embed + RPC + hydration/parsing | — | — | 553ms | 0 | No alternate search |
| Neighbor query 1–6 | Same-section ranges | 6 | — | **18, 14, 11, 18, 6, 25ms**, respectively | 0 | Zero expansion |
| Expansion enclosing stage | Neighbor loop | — | — | 100ms | 0 | No new evidence |
| Boundary assembly | Ordinary code | 1 | — | unknown separately | 0 | Six candidates; untruncated |
| Token count | Gemini countTokens | 1 | 5,577 counted; output — | 270ms fetch; 273ms stage | 0 | Ran before final gate |
| Final gate | `evaluateConfidence` | 1 | — | unknown separately | 0 | REFUSE/low_similarity |
| Explanation/support review | Gemini | 0 / 0 | — | — | 0 | Correctly not called |
| Citation validation/repair | Ordinary code/model | 0 / 0 | — | — | 0 | No generated answer to validate |
| Logging | Local qa_log, qa_log_chunks | 2 | — | 31ms, 24ms fetch subsets | 0 | HTTP 201 each |
| Final rendering | JSON/React | — | — | Serialization unknown; browser unknown | — | Neutral refusal envelope |
| Total | Authenticated endpoint | 1 generation + 1 count + 1 embedding | Gemini 452 / 75; count not additional generation usage | **14,660ms client** | 0 | Correct final refusal |

## Is the earlier 85-second run representative?

The saved synthetic-evidence success took 84,660ms: understanding 31,977ms, explanation 26,277ms,
review 26,125ms and token count 271ms. It exercised Gemini on controlled evidence, not real
retrieval. The previous real typo success took 73,658ms: 23,245ms understanding, 24,526ms explanation
and 24,775ms review. The fresh endpoint success took 71,814ms with a very different split:
26,559ms understanding, 6,045ms explanation and 36,879ms review.

Thus 85 seconds is plausible for this architecture/provider, but not an established average or
upper bound. Earlier real Ohm-law checks include a 57,375ms provider failure, a 55,204ms held-back
answer and a 110,017ms timeout. A repeated authenticated typo also previously hit the total
deadline. The fresh clear failure waited 109 seconds for understanding alone. A small set cannot
provide p50/p95, capacity, accuracy or a reliable completion-time promise.

## Bottlenecks, suspected causes and counter-evidence

| Question investigated | Finding and evidence | Status / how to resolve unknowns |
| --- | --- | --- |
| Unnecessarily sequential independent work? | Profile reads already use Promise.all. Neighbor ranges are sequential (fresh typo 137ms enclosing stage). Main understanding → query embedding → retrieval → generation → review dependencies are real. | Neighbor batching is possible but cannot explain minute-long waits. Do not run review before an answer exists. |
| Repeated normalization? | One understanding fetch per fresh case. Evolved retrieval sets preserveQuery, bypassing legacy normaliseQueryText. | No duplicate normalization found. A manual full retry does repeat work by design. |
| Clarification repeats completed work? | Signed options create a ready interpretation directly; free text normalizes once; attempts bounded at two. Saved live option continuation skipped normalization. | Correct control flow; current fresh ambiguous case failed upstream before choices. |
| Alternate searches always run? | trace.retrievalQueries=1 when reached; actual RPC observed once. | None implemented. Optional alternate search cannot be today's bottleneck. |
| Duplicate React submits/effects? | Synchronous submit ref, disabled button, sequence checks; POST only in handleAsk. Effects GET options/reader. | No duplicate backend calls in audit client; actual React double-click/StrictMode interaction still untested. |
| Excess/irrelevant context? | Fresh answer used one of six seeds. Others include learning outcomes, freezing, condensation, wind/air-cooling and refrigerant material. Some can supply relevant context; not all are core cooling evidence. | Broad context and full resend confirmed. No claim that every uncited chunk is dispensable. Rank/aspect selection must be evaluated against conditions, cross-chapter comparisons and OCR ambiguity. |
| Duplicate context? | IDs/word overlap removed, but semantic/topic redundancy can survive. Six distinct chunks remained; 10,756 total text characters were sent in each explanation/review evidence set. | No exact duplicate in fresh set; semantic redundancy not quantified. Avoid calling overlap heuristic a complete deduplicator. |
| Output limit too large? | Every generation gets maxOutputTokens=4000; fresh outputs were 152/477/358 tokens. Long-understanding timeout did not report usage. | Wasteful shared ceiling is a tuning candidate, **not a confirmed cause**: a maximum does not force that many generated tokens. Benchmark stage-specific caps without truncating Urdu/options/review sets. |
| Unnecessary reasoning? | No thinkingConfig is sent. Successful responses reported prompt+candidate totals with no thoughtsTokenCount. | Provider defaults are not measured reasoning time. No evidence that a particular thinking setting caused these waits. Verify exact model support/defaults before a controlled same-model experiment. |
| Expensive support review? | Full answer plus all six evidence chunks is resent: 4,860 prompt tokens and 358 output tokens; 36.875s fetch. Explanation took 6.039s with a larger prompt and output. | Review call is the biggest successful-case stage, but prompt size alone does not explain the variation. Provider queue/network/compute split unknown. Keep relevant conflict/condition context. |
| Repair/review loops? | Repair false; trace.repairs=0 in all four; no extra generation fetches. Enabled branch permits only one deterministic repair, then review. | Not a current latency cause. Semantic failure repair is missing, rather than secretly looping. |
| SDK + app retry amplification? | SDK configuration attempts=1. Installed SDK explicitly converts attempts to p-retry retries=attempts-1. Query embeddings default to one attempt. Fetch observer confirms one attempt per stage. | No automatic retry amplification. Earlier separate retries were operator test attempts, not recursive application behavior. |
| Per-stage timeouts multiply total? | SDK timeout is 110s per operation, but shared route AbortController and withinDeadline also cap the whole request to 110s. Node route ceiling 120s. | No independent 110s budget per stage in route. An upstream 504 is currently mapped to generic unavailable if app signal has not fired. Diagnostic status is not retained in route trace. |
| Provider timeout despite a connection? | Fresh understanding received actual upstream HTTP 504 after ~109s. Other calls returned 200/503. | Upstream HTTP failure confirmed; socket establishment timing and provider queue/compute are unknown. Do not call this a missing key or DB outage. |
| Rate limiting? | No 429s; four sequential requests remained within instance limits. Provider 503 and 504, not quota errors, observed. | No quota evidence here. Larger concurrency/account-tier behavior not tested. |
| Cold start/hardware/DB? | Audit server reported Ready in 259ms before client tests; authenticated login 231ms. Local RPCs 42/26ms and hydration 14/16ms. Client-minus-route 22–63ms. | These measured local costs are small. No CPU/heap profiling or warmed-vs-cold provider experiment; cannot exclude all hardware/cold/network contributions. |
| Cancellation stops server work? | req.signal combines with global timeout; passed into Gemini, embedding and retrieval requests. withinDeadline races auth and logging, which do not receive that signal. Validation may finish after cancellation. | Caller loses no newer state per code/fixtures. Browser disconnect propagation and upstream compute/billing cancellation unverified. In-flight auth/log writes may complete after abort. |
| Truthful waiting UI? | General working label and Cancel, no fabricated progress percentages or unsupported live stage labels. Unvalidated text is not streamed. | Implemented/SSR checked, not browser observed. A truthful spinner still feels slow for 70–110s. |

Google's current [troubleshooting guide](https://ai.google.dev/gemini-api/docs/troubleshooting)
describes thinking as one possible latency contributor and recommends bounded backoff for transient
errors. Its [thinking guide](https://ai.google.dev/gemini-api/docs/thinking) is model-specific.
These are tuning references, not evidence that hidden reasoning or retries caused this run.
The installed SDK and observed requests take precedence over generic SDK-default descriptions.

## Harness compliance and incomplete work

| Requirement/phase | Actual status and deviation |
| --- | --- |
| Phase 0 baseline and repository conventions | Existing route/consumers inspected, main updated and feature branch created; user work preserved. No old/new live comparison on identical cases was completed. |
| Phase 1 contracts and deterministic core | Integrated and fixture-tested. Scientific preservation uses a limited heuristic vocabulary and regexes; not universal multilingual equivalence. Config permits 4,000 input chars but understanding/free-text text schemas and UI remain capped at 1,600, so raising only the env limit is inconsistent. |
| Phase 2 understanding/clarification | Real correction and real signed option continuation demonstrated previously. UI browser lifecycle, live Urdu/Roman Urdu breadth and free-text continuation remain insufficiently verified. Fresh ambiguity request failed upstream. |
| Phase 3 bounded evidence | Scoped retrieval/real metadata and null-score neighbors are connected. Section-only expansion is a deliberate conservative limit, but many restored sections have only one chunk; it found zero neighbors in both fresh retrieved cases. The database has section position metadata, so broader ordered, relevant context is possible future work rather than impossible. |
| Phase 3 concept coverage | **Partial implementation.** makeBoundary packages provenance and constraints, not an independently established aspect-to-evidence map. Coverage/aspect labels are filled from generated statements afterward and reviewed by a model. No robust pre-generation core/condition/comparison coverage assessment. One source per chapter prevents blending sources but does not detect conflicting editions or intelligently choose preferred source language. |
| Optional alternate query | Omitted; harness permits one justified alternate, it does not require always using one. Must not add speculative search calls just for checklist coverage. Full-query embedding can also suppress partial results when an unsupported subquestion lowers similarity. |
| Phase 4 teaching/examples | One real evaporation explanation/example passed model review and source identity checks. Book and illustration policies are implemented. Numerical calculation support deliberately restricted to V=IR/R=V/I/I=V/R; other subjects' worked examples are not complete. Clear Ohm-law behavior has not been made reliably successful; previous ungrounded refusal cause was not isolated. |
| Phase 4 support/repair | Default semantic review integrated, strict statement-set checks. Whole-answer refusal on any invalid/uncertain part is more conservative than salvaging a coherent partial answer. Repair is optional/off and handles only parsed deterministic failures; no semantic-failure repair/coherent partial salvage. This is a quality/availability limitation, not a missing secret automatic loop. |
| Phase 5 reliability/observability | Connected errors, cancellation, shared deadline, bounds, instance limiter and privacy-limited logs. Missing production usage counts, individual DB/embedding timings, structured validator rejection reasons, distributed caps, and proof of abort propagation. Analytics latency is captured before its own writes and clarification/error requests do not enter normal qa_log. |
| Phase 5 frontend | Typed statuses, prose/citations, clarification, cancel/retry and source-reader wiring exist. Page is still chapter-selected even though backend permits bounded cross-chapter retrieval when no chapter is supplied. Full interactive/mobile/source-click acceptance remains open. Local backup has OCR text but not the PDF bytes for PDF-mode acceptance. |
| Phase 6 evaluation | 58 offline tests and previous production build pass; local schema suite previously 22/22 rolled back. Forty-four draft review cases exist (30 development, 14 held out), but references are fixtures and none is teacher reviewed. They are not a real-corpus gold set. No measured academic accuracy or comprehensive harness-case coverage claim follows. |

Complexity worth retaining: signed context prevents a browser from inventing approved interpretations;
one canonical statement/block representation prevents orphan prose; no-score neighbors protect the
gate; runtime schemas enforce trust boundaries. Avoidable complexity/work includes six near-identical
neighbor round trips, a remote token count before an already-low-score refusal, duplicated call-cap
checks in provider and orchestrator, and duplicated input constants. The duplicated call cap is cheap
defense in depth, not a meaningful latency issue. A blanket refactor would distract from provider
reliability and evidence quality.

## Targeted recommendations — proposals only

Effort below is engineering time including focused tests, not a promised wall-clock response time.
No model/threshold/check change in this table has been applied.

| Order / class | Exact proposal and measured target | Expected benefit and evidence | Tradeoff | Effort / required tests |
| --- | --- | --- | --- | --- |
| 1 — safe observability | Retain provider status, usage counts, stage request IDs, abort cause, deterministic failure codes and embedding/RPC/log durations in minimal operational traces. Separate queued/waiting-to-headers from body receipt where transport supports it. | Makes 109s upstream failure and previous Ohm-law refusals diagnosable; no claimed speed gain. Existing trace hides usage and exact validator failures. | Metadata only; never store private question/prompt/answer or reasoning by default. | 0.5–1 day. Fake 503/504/429/invalid-output/abort cases; assert redaction and request correlation; one approved live probe. |
| 2 — safe query consolidation | Batch/deduplicate same-section neighbor ranges with bounded concurrent queries (for example concurrency 2–3) or one validated scoped batched query; preserve original ordering and config.context semantics. | Targets measured 100–137ms expansion; gains bounded by that small stage in these cases, not tens of seconds. | Extra DB burst; batch must not widen scope or change which rows survive. | 0.5–1 day. Snapshot exact selected IDs/roles/order/budgets; sparse/dense sections, duplicate seeds and abort tests. |
| 3 — conditional refusal fast path | Apply a non-generating preliminary gate to independent seeds before expansion/countTokens. If it is REFUSE, return refusal with no later provider calls; otherwise retain exact final-payload gate after reduction. | Unsupported case could avoid the measured 100ms expansion + 273ms count stage; also avoids sending ~5,577 unnecessary tokens to countTokens. Preliminary REFUSE is safe only because unscored neighbors never raise similarity support. | Must prove selection never raises max score/support; retain actual nearest chapters and consistent local logging. No threshold change. | 0.5–1 day. Equivalence tests over PASS/BORDERLINE/REFUSE, overlap/source filtering, zero seeds, malformed config and token-reduction cases. |
| 4 — conditional evidence selection | Rank whole passages by supported requested aspects/conditions, not just top six scores; include cited support plus condition/conflict-relevant context in review. First fix boundary coverage, then benchmark smaller envelopes. | Fresh review resends six chunks though final claims cite one; input is 4,860 tokens. Less irrelevant OCR may improve both quality and provider work. **Seconds saved unknown**; review was slower than explanation despite fewer tokens. | Dropping an uncited condition can falsely approve a claim. Reviewer must still see material that contradicts/qualifies it. | 1–2 days initially, more for cross-subject breadth. Negative condition/conflict cases, multi-chapter comparisons, original examples, OCR errors and real corpus review. |
| 5 — conditional provider tuning | Same model, separate measured output caps for understanding/explanation/review; assess supported thinking settings only after exact model documentation and usage telemetry. Keep strict schemas and every grounding check. | Targets repeated slow model stages, but fresh STOP outputs use far below 4,000 already. Benefit is a hypothesis until an A/B benchmark. | Caps can truncate options or verdicts; reasoning changes may impair meaning/support judgment. Not a behavior-preserving optimization until evaluated. | 0.5–1 day experiment plus review time. Same cases/config/corpus, record usage and failure rates; include long Urdu, calculations, max statement count, and held-out meaning/support negatives. |
| 6 — conditional outage handling | Classify upstream timeout distinctly and allow at most one transient early retry only if enough shared time/call budget remains; never blindly retry a 109s exhausted request. Preserve final gate rule. | Fresh early 503 failed in 779ms and might recover; 504 had no useful retry budget. Improves availability if demonstrated, not guaranteed latency. | More quota and potentially slower failures; one transport attempt must have one owner, avoiding SDK+app amplification. | 0.5–1 day. Inject fast 503 then success, late 504, 429 Retry-After, abort, no retries after REFUSE, and absolute cap/deadline. |
| 7 — optional product decision | Consider scoped, owner-bound cache/reuse of confirmed interpretations only with original/scope/language/model/prompt/config/corpus keys, short expiry and bounded size. Do not skip understanding for arbitrary new inputs. | Repeated same input currently repays 13.6–109s understanding; signed choice resumption already avoids it. Cache hit benefit depends on actual repeated traffic, not measured here. | Staleness/privacy/cross-instance complexity. No observed hit rate. Not the first fix. | 1–2 days if chosen. Identity isolation, invalidation/restart/config changes, expiry, unchanged original, refusal and injection cases. |

Keep default semantic support review during this work. Making it optional for some classes of
answer, or substituting a deterministic meaning check for fresh-question understanding, requires
an explicit product decision and reviewed quality evidence. The existing rollback flags are not
a reason to quietly remove those features. Do not stream unvalidated academic prose merely to
make first-byte timing look better. A server-backed stage-status channel could improve waiting
clarity, but adds complexity and does not shorten the critical path; it is optional UX work.

### What may run concurrently

Keep auth scope authorization before exporting the question; keep understanding before the
canonical query embedding; embedding before vector search; retrieval before expansion/selection;
exact final evidence selection before the final gate/explanation; explanation validation before
support review; full support/citation validation before returning visible academic prose. A repair
requires the failed output and must precede its revalidation/review. These are data/safety
dependencies, not a reason to parallelize speculative provider calls.

Profile queries already run concurrently. Independent neighbor ranges can use a small bounded
concurrency after seeds are fixed. Pure scope/config/input checks can be reorganized but measured
savings would be negligible. Citation identity/structure checks are local and cheap; running them
concurrently with paid support review would waste review calls for invalid answers. Logging can be
bounded separately from answer production only if durable logging/lifecycle requirements are
explicitly handled; simple fire-and-forget is unreliable in serverless hosts. Its measured local
writes total only 48–55ms, so it is low priority.

## Verification, status and completion estimate

Audit checks: `npm.cmd run lint` passed. The sandboxed offline test command initially failed
before executing tests because tsx's `os.userInfo()` raised `uv_os_get_passwd ENOMEM`; the approved
normal-environment rerun completed **58 passed, 0 failed**. This was a runner restriction, not
evidence that these tests passed under the sandbox. The previous production build and schema
22-assertion suite passed as recorded in EVALUATION.md; neither was re-run for this documentation-only
audit. A build is not evidence of teaching quality. No browser was available.

**Implemented and demonstrated:** connected exact-input correction → live scoped retrieval →
structured explanation/book example → rebuilt citation → semantic review → endpoint result;
signed clarification choice resumption in the previous live checks; changed/forged scope rejection;
final refusal without explanation/review; bounded errors, schema checks and offline negative paths.

**Implemented but not sufficiently verified:** real Urdu/mixed-language and numerical breadth,
free-text clarification through the actual page, source clicking/PDF mode, mobile/keyboard behavior,
rapid submit and late-response ordering in a browser, disconnect-to-provider cancellation, deployment
across replicas, consistent clear-question success and teacher-reviewed support judgments.

**Incomplete or broken:** repeated upstream Gemini availability/timeout failures; reliable clear
Ohm-law answer behavior unresolved; incomplete pre-generation concept/aspect coverage and conflict
handling; section-only context discovery; limited numerical formulas; no semantic-failure repair
or safe partial salvage; missing production timing/usage/rejection detail; draft rather than real
reviewed corpus dataset. The held-back Ohm-law output is an availability/diagnostic gap, not proof
that it should have been accepted. No grounding rule should be loosened to make it pass.

The three largest confirmed generation latency contributors are:

1. Understanding: 26.546s on the fresh success, 13.599s on refusal, and 109.083s until the fresh upstream timeout.
2. Semantic review: 36.875s on the fresh success; earlier real success 24.775s.
3. Explanation: 6.039s fresh; earlier real success 24.526s and synthetic success 26.277s.

Recommended order: instrument and isolate upstream/validator failures; consolidate small DB work
and add the proven-safe early refusal path; improve evidence coverage/selection; benchmark same-model
stage settings; then evaluate deadline-aware transient recovery. Finish real corpus/human and browser
acceptance before claiming completion. Do not prioritize a large frontend rewrite or switch models
without this evidence.

**Planning estimate:** a narrowly scoped reliability/latency improvement patch with regression checks
is approximately **3–5 engineering days**, based on the separately scoped 0.5–1-day telemetry/query/
gate/provider experiments above and integration overlap. Completing the remaining reviewable harness
scope is approximately **6–10 engineering days total**, assuming access to a browser, stable provider
service and a reviewer, with numerical work kept to an explicitly agreed bounded formula set. This
includes 1–2 days evidence-boundary work, roughly 1–2 days broader failures/lifecycle tests and 1–2
days corpus/browser review alongside that patch. General numerical solving across every subject or
complete language equivalence has not been scoped and is **not included**. Human reviewer scheduling
and provider outages add elapsed time; there is no defensible fixed latency target or completion date
from these four cases.

Blockers to the final acceptance claim: no available browser, no teacher-reviewed real-corpus set,
unresolved provider timeouts/503s and the narrower evidence/validation gaps above. PDF bytes are
also missing locally for PDF-mode testing. The audit itself is complete; optimization remains a
proposal, consistent with the request to present findings before implementation changes.
