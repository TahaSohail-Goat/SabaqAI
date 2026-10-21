# Ask/Doubts evolution

2026-10-22 update on `doubt-finalize`: [hybrid retrieval](HYBRID_RETRIEVAL.md) supersedes the vector-only
retrieval and source-category picker details below. The strict request now accepts a source UUID,
the frontend supplies it, and the reader enforces it. Understanding, gate, validation and review
contracts remain; legacy source-less calls must be unambiguous except internal Quiz chapter snapshots.

Implemented on `evolved/asks-doubts`, based on `fe49875`. See [EVALUATION.md](EVALUATION.md)
for executed checks and environment blockers. This is one Next.js app; no database migration,
dependency, production fixture fallback, extra service or change to General Chat was introduced.

## Request path and trust boundaries

`/doubts` → `POST /api/ask` → bounded JSON/input validation → profile scope rules →
question understanding → clarification **or** semantic search → stored-row hydration →
same-section expansion → exact context selection/token count → final confidence gate →
structured teaching → deterministic validation → optional support review → stored-row citations.

Question understanding happens before `evaluateConfidence()`. It interprets input and never
produces an academic answer. Once that function returns REFUSE, **no further model call occurs**.
There is no flag disabling the gate. Normalizer confidence is never used as a probability.
No explanation is synthesized when a provider fails. The evolved path requires live configured
retrieval; the older generic retrieval helper's development keyword fallback is never eligible here.

The server validates FBISE, classes 9–12, known class-appropriate subject codes, supported source
types and optional positive chapter/paper numbers. Signed-in users must match their server profile's
board, class and enrolled subjects. Anonymous API access remains intentionally available with the
same schema and bounded consumption. Page authentication remains unchanged.

The original question is preserved exactly, including whitespace. Normalized and retrieval questions
are separate. Retrieval uses the complete interpreted question without the older keyword replacement
dictionary. Protected checks guard numbers/signs, numeric equivalents, quantity-unit associations,
relations, formulas, charges, selected scientific terms, negation and directional/conditional markers.
Decimal/scientific/fraction equivalents and a limited unit-alias map are allowed. Ambiguous linguistic
equivalence conservatively requests a complete rephrasing. This is not a complete scientific parser
or a guarantee of faithful translation; reviewed language evaluation remains necessary.

## Contracts and compatibility

Public shapes live in `src/lib/types.ts`; executable validators in `src/lib/ask/contracts.ts`.
Input requires `question`, `board`, `classLevel`, `subject`; optional language defaults to English and
source type to textbook. Unlike the old API, board/class/subject no longer silently default. The only
in-repository consumer, the Doubts page, already sends them and is migrated. Chapter is optional for
API comparisons across permitted chapters; the page continues to require one selection.

Response variants:

| Status | HTTP | Meaning |
| --- | --- | --- |
| `answered` | 200 | Valid canonical statements, blocks, citations, interpretation and boundary |
| `answered` + `boundary.coverage=partial` | 200 | Supported portion with explicit missing aspects |
| `needs_clarification` | 200 | Short question, zero or 2–3 intent options, free text, signed context |
| `refused` | 200 | Insufficient evidence or ungrounded output; actual nearest scored chapters |
| `error` | 400/403/429/502/503/504 | Input/scope, rate, invalid output, service/configuration or deadline failure |

Errors include requestId, safe message, code and retryable. Responses are `no-store`. Unknown response
variants, invalid citations or broken block references fail client validation. Older persisted answered
responses remain renderable without structured blocks. Restored clarification contexts are discarded
on reload. No second markdown answer exists outside the validated statement list.

Clarification resumption uses HMAC-SHA256 contexts, bound to version, exact original question, validated
scope, language, expiry, attempt and session owner. The owner derives from the authenticated ID or a
random HttpOnly/SameSite anonymous cookie, hashed before inclusion. Options and their complete interpreted
questions are signed. Arbitrary browser interpretations are never privileged. Free text is normalized
again as untrusted input. One continuation is allowed; repeated ambiguity asks for a fresh complete
question. Forged, expired or changed-selection contexts return a natural restart error.

## Evidence and boundary policy

The existing embedding client and `match_content_chunks` RPC remain the indexed seed search, always
filtered by board/class/subject/source and optional chapter. Scores retain full precision. The existing
threshold values and PASS/BORDERLINE rules are unchanged; finite/range validation now fails closed.
Duplicate or heavily overlapping bodies are removed before scoring support (word-set overlap above
0.85 of the smaller body). This makes support more conservative, never promotes neighboring evidence.

Search rows are hydrated through `content_chunks → sections → chapter_sources → chapters` with the
same explicit filters. This recovers real source/chapter/section IDs and section-local `chunk_index`.
No view/RPC migration is needed. Neighbor reads use section ID and an index window, not UUID ordering,
page offsets or timestamps. They never cross a section. Body concept overlap or an explicit adjacent
anaphoric condition is required; title matches alone do not establish relevance. Semantic review still
decides whether these passages support generated claims.

Neighbor similarity is **null** and never contributes to the gate or qa_log scored junction rows.
Source variants/languages are not merged within a chapter: retain the highest-ranked seed source.
The current schema has no edition/version field, so no edition preference is invented. Material conflicts
within the supplied evidence are handled conservatively by generation and support review.

Complete chunks are selected up to the chunk limit and a UTF-8 byte ceiling of six times the configured
input token budget, bounding the token-counter request itself. This is not a character/token conversion.
The complete teaching instruction/envelope is measured with the selected model's `countTokens` endpoint.
If over budget, use that measurement to drop lower-priority whole passages, reserve 2500 tokens for
instructions/question/metadata, and recount once. The final exact count must fit or explanation does
not run. If all evidence is dropped, the gate refuses. Never cut half a formula or truncate the question.
Selection is conservative and can underfill context; truncation is an explicit coverage limitation.

The gate uses only independent scored seeds **remaining in the exact final payload**. No allowed citation
ID survives merely because it appeared earlier in retrieval. Source/chapter/section identity, null pages,
excerpt and display titles come from stored rows. Page ranges remain section-level, not fabricated
sentence-level locations. Nearest chapter suggestions use the final genuine scored candidates.

The server owns boundary identity and truncation. Coverage/aspect labels begin conservatively partial,
then become proposals from canonical validated statements; the configured reviewer checks the answer and
missing aspects against cited evidence. With review disabled these are generation proposals, not semantic
validation. Coverage describes the retrieved material and never claims an exhaustive textbook boundary.

## Teaching, examples and support review

Prompt versions: `ask-understanding-v1`, `ask-teaching-v1`, `ask-support-v1`.
Teaching remains in the existing `src/prompts/grounded-answer.ts`, with separate understanding,
review and repair prompts. JSON-serialized payloads and system/user role separation keep student/OCR
content as data. The installed `@google/genai` supports `responseJsonSchema`, `countTokens`, request
abort signals and bounded retry options; all outputs still undergo Zod validation.
Gemini rejected the original detailed teaching decoder grammar with HTTP 400 during live synthetic
checks. The wire schema now retains types/properties/required fields/enums, leaving length/count/range
and pattern constraints to the unchanged strict runtime validators. This follows the provider's
[schema complexity guidance](https://ai.google.dev/gemini-api/docs/structured-output). A later synthetic
run completed normalization, explanation and support review using that adapter. No validator was relaxed.

The canonical statement list has unique IDs, source IDs, aspect and example kind; neutral block enums
reference exactly that list. The first block must be a direct answer. Book examples and original
illustrations have different visible labels. At most one original illustration is allowed. HTML and
model URLs are rejected in academic statements; React additionally escapes all visible strings.

The numerical checker implements only `V=I*R`, `R=V/I`, `I=V/R`. It checks formula presence in the cited
row, ordered input/output units, finite arithmetic, a matching visible result and declared origin of
givens. Assumed values require a labeled original illustration; student/book values must occur in their
declared source. Formula applicability/conditions and the scientific meaning of givens still require
support review. Other calculations are omitted with a limitation or clarification; no eval or generated
code is executed. This is intentionally not a general symbolic algebra engine.

Any invalid citation rejects the complete evolved explanation. This is stricter than the old
more-than-half-discard rule, preserving its safety floor and avoiding a broken causal explanation after
blind sentence filtering. `validateCitations` now also rejects `answerable:false` for legacy callers.

The default reviewer returns exactly one verdict per known statement ID, requiring its own cited
evidence for support. Other allowed passages can expose missing conditions/conflicts, but cannot
rescue an uncited claim; verdict references must belong to the statement's actual citation set.
Missing/duplicate/invented verdict IDs or unrelated evidence references are operational invalid output.
An unsupported/uncertain claim, unsupported core or incoherent answer is refused as a whole. The reviewer
is fallible and is not a proof, teacher approval or accuracy metric.

Optional repair allows **one structural/citation repair**, followed by complete validation and normal
support review. It uses the same evidence. A failed support review is not repaired without another
review: the request instead refuses within the four-generation-call cap. Invalid JSON/schema output
has an explicit error path rather than recursive repair. Repair is off by default.

## Configuration and budgets

Recommended settings are active defaults, also listed in `.env.example`. Existing Gemini and embedding
factory configuration is reused; do not change the embedding model/dimension without re-embedding.
Restore a working `NEXT_PUBLIC_SUPABASE_URL`, anon/service-role keys, embedding key and Gemini key.

| Variable | Default | Valid range / purpose |
| --- | --- | --- |
| `ASK_QUERY_UNDERSTANDING_ENABLED` | true | false bypasses correction for rollback; direct input still validated |
| `ASK_CONCEPT_EXPANSION_ENABLED` | true | false uses scoped scored seeds only |
| `ASK_SUPPORT_REVIEW_ENABLED` | true | false explicitly returns supportReview=disabled |
| `ASK_REPAIR_ENABLED` | false | one structure/citation repair followed by review |
| `ASK_MAX_INPUT_CHARS` | 1600 | 100–4000; UI and normalization currently cap at 1600 |
| `ASK_MAX_SEED_CHUNKS` | 6 | 1–12; one indexed search, TOP_K still bounds RPC candidates |
| `ASK_MAX_CONTEXT_CHUNKS` | 10 | 1–20; includes seeds and relevant neighbors |
| `ASK_NEIGHBOR_WINDOW` | 1 | 0–2; within the seed's section only |
| `ASK_MAX_CONTEXT_TOKENS` | 7000 | 500–16000; exact selected-model count after conservative selection |
| `ASK_MAX_OUTPUT_TOKENS` | 4000 | 500–8000 per generation, including structured output |
| `ASK_TOTAL_TIMEOUT_MS` | 110000 | 5000–120000; shared across stages, not reset per call |
| `ASK_MAX_LLM_CALLS` | 4 | 2–4; default reviewed success uses three calls |
| `ASK_CLARIFICATION_TTL_SECONDS` | 600 | 60–1800 |
| `ASK_CLARIFICATION_SECRET` | process random key | shared random secret ≥32 characters recommended for replicas |

Live normalization took about 23–32 seconds with this checkout's existing model. A complete three-call
synthetic-evidence run took 84.7 seconds. The 110-second default leaves room for real retrieval within
the route's 120-second ceiling. The real restored-corpus cooling answer took 73.7 seconds; other
attempts hit provider 503s, conservative refusals or the 110-second deadline. See the full result log.

There is one semantic embedding/search query, up to one hydration query and at most one bounded
neighbor query per seed. One model token-count request (at most two after reduction) occurs before the
final gate for nonempty evidence; it is not an explanation generation. The generative-call cap counts normalizer, explainer,
review and optional repair. There are no automatic search retries or provider retry loops.

Per-instance protections: six requests per owner/minute, one active per owner, thirty total/minute,
four total active, at most 1000 temporary owner entries, 32KB streamed request-body cap. A distributed
ingress limiter is still required when deploying multiple replicas or defending global quotas.
No shared answer cache is introduced. Abort signals reach embedding fetches, DB queries and Gemini;
the deadline also bounds waiting on authentication and logging. Underlying auth/log operations do not
have cancellation APIs, but cannot authorize further generation once the signal is aborted.

Logs contain request ID, statuses, counts, source IDs, gate decision/reason, truncation/coverage,
rejections, repairs, durations and total latency. No student question, answer, raw provider error,
prompt or secret is added to production logs. Existing qa_log attribution remains best effort; only
genuine scored rows enter its score-bearing junction table.

## Frontend, rollout and rollback

The existing page and source reader remain in place. Original input stays visible. Interpretation can
be inspected/edited as a newly validated question. Clarification uses native buttons and free text.
Explanation paragraphs precede collapsible excerpts, citations activate the same reader, Urdu uses
RTL blocks and isolated page references. Retrieval confidence is a label, never an accuracy percentage.

AbortController, request sequence IDs and a synchronous submit lock protect scope/question changes,
late responses, duplicate clicks and unmount. Loading is a general truthful state, with a Cancel button.
Operational errors retain typed input and offer retry when appropriate. Refusals remain neutral.

For local review run `npm install`, `npm run test:ask`, `npm run lint`, `npm run build`, `npm run dev`.
Use the five review flows in [EVALUATION.md](EVALUATION.md). This laptop now has a separate restored local
corpus and approved test account; restart with its private overlay rather than the stale hosted settings.
Source PDF bytes were not restored, so local source inspection uses the existing OCR reader.

For a limited rollback, disable understanding/expansion/review individually; this retains mandatory
schema, scope, gate and citation checks. Turning review off removes semantic checking and is explicit.
For full rollback revert this feature change as a unit, including the migrated response consumer.
No data migration or re-ingestion is required. Nothing has been pushed, deployed or merged here.
