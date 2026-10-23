# Sources-only fallback

The student Doubts service now handles an actual failed Gemini attempt followed by a failed
Groq attempt with a separate `sources_only` result when scoped textbook passages are available.
This is browsing access, not a fabricated answer. It never contains a model draft, claims that
grounding or adequacy passed, or a retrieval-confidence success badge. The visible message says
no explanation was generated and the returned passages have not been assessed as answering the
question. OCR excerpts are explicitly labeled and displayed as quotations, with source/page buttons
using the existing reader and chapter-relative PDF page rebasing. A retry requests a new explanation.

Provider failure tracking is request-local. The original model call cap and single provider retry
remain unchanged. The service caches the original bounded seed search; if both providers failed
before understanding/search, it searches the full unchanged original question once. That search
still verifies exact source UUID, chapter, board, class, subject and source type. It requires a
selected source/chapter, deduplicates and checks all candidate rows and exposes at most three
citations. All metadata and excerpts come through the shared stored-row citation constructor.
No model is called to generate, summarize or select fallback claims. The existing Jina query
embedding may still be required when search has not happened; an embedding/database failure cannot
manufacture citations. Trace fields distinguish source browsing, citation count and its duration.

The fallback is limited to `unavailable` failures after both providers have failed. Final retrieval
refusals are terminal. Invalid output, unsupported or inadequate answers, exhausted deadlines,
cancelled requests, ambiguous/clarification flows and unavailable source evidence retain their
existing handling. A single failed provider does not trigger this result. Quiz review uses the
unchanged shared pipeline directly and cannot return source browsing as an assessment explanation.

## Verification

- `npm run lint`: passed.
- Working-tree Ask/Quiz/UI tests: 179 passed, no skips; includes ten new source-only/UI tests
  and seven pre-existing uncommitted catalogue tests which remain separate work.
- Notification tests: 16 passed.
- Production build: `npm run build --prefix .recovery/adequacy-commit-check -- --webpack` passed
  on the isolated staged snapshot, including TypeScript and all 56 static-page generation steps.
  The default Turbopack attempt stalled in compilation and was stopped; it is not reported as
  passing. Webpack recovered from transient font-download connection retries. Existing nested
  lockfile/root-inference and PDF legacy-build warnings remained. No build configuration changed.
- No live Gemini/Groq calls were needed for these new tests. The two-outage adapter test mocks
  Gemini and Groq HTTP 503 and verifies exactly two model attempts, one retrieval and no third call.
- A separate probe simulated both provider HTTP 503s but used **real local source verification,
  hybrid retrieval and a live Jina query embedding** for `how non contact forces work?` in FBISE
  Class 9 Physics, Dynamics, source `81855080-15fb-4971-b9da-5f1ddb616f74`. It returned the new
  schema-valid result with three actual source references, including
  `2ba6fc9f-df86-450b-bb34-309f9b5b19f0` (stored pages 63–64), in 1,852 ms; source retrieval took
  1,665 ms. Two simulated model attempts, zero actual LLM calls, zero database writes. This was
  direct service execution, not an HTTP/browser test or a real provider outage.
- Rendering tests verify visible source controls, excerpts, retry and absence of answer/confidence
  badges. Browser clicking and PDF rendering were not rerun; the existing reader is reused.

No corpus restoration, OCR, embedding changes, hosted settings, new dependencies or merges.
