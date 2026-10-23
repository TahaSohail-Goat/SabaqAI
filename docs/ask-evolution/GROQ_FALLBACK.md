# Groq fallback — 2026-10-23

The shared Doubts/Quiz provider now uses the existing server-only `GROQ_API_KEY` and the Groq
text model already listed in `src/lib/chat/models.ts` (`openai/gpt-oss-120b`). Gemini remains
primary. Connection failures and HTTP 502/503/504 can switch the next attempt to Groq;
Gemini HTTP 429 can also switch when Groq is configured. Authentication, schema rejection,
malformed output and grounding/adequacy failures do not select another provider. With only
a Groq key configured, the same grounded pipeline can start on Groq.

The existing orchestrator owns one retry across the whole request. Switching providers consumes
that allowance; failed and successful generation attempts both count against the original call
cap. Subsequent stages stay on Groq, retain the original abort/deadline, strict output schema,
source/chapter envelope, citation validation and mandatory independent support/adequacy review.
No fallback runs after the final gate refuses. No corpus, database or PDF metadata changes.

Groq accepts the existing structured JSON schema using its
[structured outputs API](https://console.groq.com/docs/structured-outputs).
Full runtime Zod bounds and scientific validators remain mandatory. Truncated output is rejected.
Gemini still uses its existing token-count endpoint. Groq planning uses a labeled UTF-8-size
estimate (bytes / 3 + 128), not an exact tokenizer or a claim of equivalent tokenization. Every
Groq completion must report positive integer `usage.prompt_tokens` within `ASK_MAX_CONTEXT_TOKENS`
before its output can proceed. Missing or excessive usage fails closed. Inputs also have a
100,000-byte preflight ceiling. An inaccurate planning estimate can therefore waste a provider
attempt or cause an operational failure; it cannot authorize an over-budget answer. Trace fields
record the selected provider and token-count mode. No new dependency or routine model call.

## Checks actually run

- `npm run lint`: passed.
- Working-tree Ask/Quiz/UI tests: 169 passed, zero skipped, including nine new provider tests.
  Seven pre-existing uncommitted catalogue tests are included in that total and remain separate work.
- Notification tests: 16 passed.
- No production build required or rerun: no `src/app/` or Next configuration changes.
- Offline tests exercise strict schemas, actual usage limits, truncation/invalid output, call caps,
  deadline exhaustion, Gemini 503/429 switching, no switch on auth/schema errors, the full shared
  orchestrator, grounding rejection and refusal without any fallback call.

Two bounded probes used **real Groq calls**, actual previously stored Dynamics OCR/chunk IDs and
recorded retrieval scores, with a **simulated Gemini 503**. They did not run live retrieval or
write to the database. The six-chunk probe reached Groq understanding but received Groq HTTP 429
at sufficiency (1,401 ms total, three attempts including the simulated failed attempt). A one-chunk
probe ran understanding, sufficiency, explanation and review in 6,855 ms total (five attempts).
Stage durations: understanding 1,337 ms, sufficiency 1,109 ms, explanation 1,668 ms, review 2,724 ms.
Its review contradicted the contract by returning repair evidence with a partial verdict, and was
correctly rejected as invalid output. Neither probe is a passing academic answer or a browser test.
These timings are not a speed comparison with the earlier Gemini/live-retrieval requests.
Fallback cannot guarantee availability when Groq is rate-limited or returns invalid academic output.

## Local login incident during startup

The old Turbopack dev process returned HTML 404 responses for the existing login POST route even
though its route manifest listed that handler. The browser's unconditional `res.json()` then raised
`Unexpected token '<'`. The prior `.next/dev` cache was preserved in ignored recovery storage and
the server restarted with `next dev --webpack -p 3100 -H localhost`, without changing app config.
The route then returned HTTP 400 `application/json` for missing fields and, through real local
Supabase Auth, `Incorrect email or password` for an intentionally invalid account. The login page
returned HTTP 200 and Supabase Auth health succeeded. This confirms the route/JSON failure is
resolved locally; a successful browser login was not performed. Clearing the cache and changing
the dev compiler together does not establish which alone was necessary.
