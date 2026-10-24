# Class 9 Physics Concept Lab

## Start the local demo

This feature branch is stacked on `triage-branch` at `d87831d` and remains unmerged.
The first push triggered the repository's existing Vercel automation, which published a preview
of `e6907e4`. `vercel.json` now disables automatic deployments specifically for `feat/physics-lab`
using [Vercel's branch configuration](https://vercel.com/docs/project-configuration/git-configuration).
The existing preview still needs removal through the Vercel account; no Vercel credentials or
connected browser were available here. Its dashboard is
<https://vercel.com/tahasohail85-5257s-projects/sabaq-ai/8x21TpfXhKmyuDjVcSQ3zadZQnyc>.
No explicit deployment command or hosted DB migration was run.
Use Node 24 and npm. The retained `.env.local` overlay points to
`http://127.0.0.1:54321` and takes precedence over `.env`; never copy its credentials into Git.

Open Docker Desktop. In PowerShell at the repository root, start the **existing** containers:

```powershell
docker start supabase_db_sabaq-ai-taha-local supabase_kong_sabaq-ai-taha-local supabase_auth_sabaq-ai-taha-local supabase_inbucket_sabaq-ai-taha-local supabase_rest_sabaq-ai-taha-local supabase_storage_sabaq-ai-taha-local
npm run dev:lab
```

`dev:lab` loads the established Next environment overlay and rejects a hosted Supabase URL or
an unavailable local Auth endpoint before launching Next. Do not start a second app on port
3000. Plain `npm run dev` also uses `.env.local`; the guarded launcher is preferred for the demo.
The existing `.recovery/start-local.cmd` helper can also start the retained stack and ordinary
dev server, provided `.env.local` still points locally. Never reset or replace the recovered DB.

Open <http://localhost:3000/concept-lab>, or **Concept Lab** immediately below **Doubts** in the
sidebar. Sign in as an enrolled FBISE Class 9 Physics student. A synthetic local demo account
created during acceptance is retained in ignored `.recovery/lab-demo-login.json`.
This account and the restored data are not part of a Git clone.

Migration `0025_lab_request_receipts.sql` has been applied to this local database only. For a
different retained local clone where it is missing, apply it once, without resetting anything:

```powershell
Get-Content supabase/migrations/0025_lab_request_receipts.sql -Raw | docker exec -i supabase_db_sabaq-ai-taha-local psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1
```

## Three demo journeys

All results below were calculated by the real local API and checked against independent
reference examples. They are examples, not a claim about system accuracy.

| Journey | Confirmed settings in SI | Prediction | Calculated result | Comparison |
| --- | --- | --- | --- | --- |
| Steady on the straight | x0=0, v=4 m/s, t=5 s | Distance 20 m | Distance/displacement 20 m, final velocity 4 m/s | Change only v to 8: distance 40 m, same time |
| A change of pace | x0=0, u=6 m/s, a=-2 m/s², t=6 s | Final velocity -6 m/s | Turn at 3 s; distance 18 m; displacement 0 m | Change only a to -1: final velocity 0 m/s, distance/displacement 18 m |
| There and back | x0=0, v1=4 m/s, t1=5 s, v2=-4 m/s, t2=5 s | Displacement 0 m | Distance 40 m; average speed 4 m/s; average velocity 0 m/s | Change only t2 to 2.5: distance 30 m; displacement 10 m; elapsed 7.5 s |

Choose a catalogue card or ask `What happens to distance at a constant velocity of 4 m/s for
5 s?`. Review every proposed setting; omitted values are explicitly marked suggested. Confirm
the assumptions, record a numeric prediction, optionally explain your reasoning, and run. The
scene/graphs appear from deterministic equations before personalized guidance is needed.
Use a suggested follow-up to retain Run A and edit exactly one parameter for Run B. Both carts
and curves share the same spatial/time scales. Unequal durations are called out explicitly.

Pause freezes time. Replay restarts; Reset returns the clock to zero. The clock slider works
with keyboard arrows and under reduced motion. Reduced motion suppresses autoplay. Background
visibility pauses playback. The display states its time scale (longer runs are compressed to
about ten real seconds); calculations always use the entered simulation time.

Tap a textbook reference. Book pages 38–39 open the existing chapter reader at local page
4 / 26, corresponding to original book page 38. The page offset and original text are not
invented by AI. See [source review and bounds](docs/lab-evidence.md).

## Provider configuration and fallback

The existing Gemini/Groq transport is reused without changing Ask, Quiz, or global provider
behavior. Current local configuration uses `CHAT_MODEL=gemini-3.5-flash-lite` and the existing
Groq text model `openai/gpt-oss-120b` from `src/lib/chat/models.ts`.

- Server-only `GEMINI_API_KEY` (existing `AI_API_KEY` alias also works) and/or `GROQ_API_KEY`.
- `LAB_STATE_SECRET`, at least 32 characters, or the existing sufficiently long `QUIZ_SECRET`.
  There is no random process-local signing fallback. `.env.example` contains placeholders only.
- One routine structured completion per proposal or feedback transition, output cap 1,200
  tokens. Exactly one fallback from Gemini to configured Groq is allowed for a recognized
  transport, service, or rate-limit failure, within the same deadline. No same-provider retry
  loop. If only Groq is configured, it is the sole attempt. Missing keys, bad schemas, invalid
  scientific actions, absent evidence, auth failures and deadlines do not trigger a provider switch.
- Provider timeout 20 s; API orchestration deadline 25 s. Read-only bootstrap has a 20 s signal.
  Requests are limited to 32 KB; student questions to 800 characters and reasoning to 600.

No Beam or Ollama is integrated. The existing normal Ask retrieval/gate/generation contract is
unchanged. Lab uses a separately reviewed experiment/evidence registry, not Ask teaching prose.
Invalid/unavailable AI leaves the deterministic experiment and reviewed explanation usable,
explicitly labelled as lacking personalized guidance. Unsupported models get a calm limitation
and the three available choices. Missing evidence is an operational unavailability, not a
reason to ask a different provider.

## Architecture and state

- `src/lib/lab/registry.ts`: versioned approved families, parameters, SI bounds, assumptions,
  equations, observations, prediction prompts, and allowed follow-ups.
- `engine.ts`: shared pure browser/server solver, exact turning-point splitting, samples, unit
  conversions and controlled-comparison eligibility. Animation evaluates the equation at the
  current clock time rather than integrating positions per rendered frame.
- `evidence.ts` and `evidence-pins.ts`: current source identity/content/PDF checks and stored-row
  citations. External OpenStax equation confirmation is labelled independently.
- `contracts.ts`, `tokens.ts`, `service.ts`, `provider.ts`, `guidance.ts`: strict typed actions,
  authenticated scope, owner/session/input/solver/evidence binding, bounded AI, reviewed teaching.
  Model output selects reviewed blocks and result-field references; code renders numbers,
  equations, comparisons, scientific prose and citation metadata. Quantity-preservation checks
  reject omitted/changed/invented explicit numeric conditions. Less conventional wording may
  need a clarification or catalogue selection; a proposed experiment is never silently run.
- `/api/lab`: authenticated bootstrap plus proposal, commit and explanation actions. Run results
  are recalculated server-side from the signed input, never accepted from the client.
- `lab_request_receipts`: service-only, RLS-protected short-lived cross-instance coordination.
  Completed duplicate IDs replay the saved response; pending/conflicting IDs are rejected. New
  work is capped at 12 requests/student/minute, 60 globally/minute, four active globally and one
  active/student. Receipts logically expire after 15 minutes and are physically removed on the
  next claim. They can contain the short cached response/signed student input, not account
  records. They are not durable experiment history. Session tokens expire after two hours.
- UI requests are cancelled/ignored when settings, question, scope or notebook change. Duplicate
  clicks are blocked. A retry after an uncertain network failure reuses the original request
  ID within its acceptance window; deliberate new attempts get new IDs. There are no provider
  calls on slider changes or animation frames. Sliders/inputs never edit an already committed run.

## Checks executed

- `npm run test:lab`: 37 solver, contract, service-fixture, provider-policy and static UI tests
  passed, including all enabled families, rest/signed motion, reversal, units/bounds, comparison,
  invalid actions/results, injection preflight, ownership/scope, duplicate/stale/deadline paths.
- `npm run test:ask`: 172 existing Doubts/Quiz regression tests passed. These use fixtures;
  they do not claim a fresh live Ask/Quiz generation run. Real source/Quiz scope endpoints were
  also exercised by the Lab API check.
- `npm run test:lab:e2e -- --keep-fixture --live`: real local Auth, DB, evidence/PDF, all three
  solver families, reversal, comparison, idempotency, invalid/stale requests and curriculum/
  ownership checks passed. A final `npm run test:lab:e2e -- --live` pass also checked the
  acceleration and unequal-duration journey comparisons in the demo table. Four live Lab
  transitions succeeded across both passes: proposal/feedback 1,802/3,265 ms initially and
  4,369/5,777 ms on the final pass. The final pass logged one Gemini completion per transition.
  These are observed timings, not latency guarantees. The expanded API pass exposed a signed
  acceleration input key-order mismatch; canonical hashing fixed it and an all-family token
  regression now covers the failure.
- `supabase/tests/003_lab_receipts.sql`: passed against local PostgreSQL as `supabase_admin`;
  it rolls back all checks of grants/RLS, duplicates, owner isolation, rate cap and expiry.
- `scripts/test-lab-browser.js` with Playwright CLI: passed at 1440px and 360px, dark/light,
  reduced motion, prediction/confirmation, unit switching, pause/reset/keyboard scrubbing,
  all families, controlled comparison, reader 4 / 26, stale response, exploration and offline
  retry. Auth, source and run routes used real local services. AI UI responses were clearly
  labelled fixtures, separate from the live-provider API checks. Expected browser resource
  errors came from the two intentional network-failure cases; no unexpected page errors occurred.
- `npm run lint` and `npm run build`: passed. The build was repeated after the token fix;
  final status is recorded in `docs/project-status.md`.

Screenshots are genuine browser captures in ignored `output/playwright/lab-*.png`. They are local
review evidence, not shipped assets. To repeat the browser check without contacting a provider:

```powershell
npx --yes --package @playwright/cli playwright-cli -s=lab open http://localhost:3000/concept-lab --config .recovery/playwright-lean.json
npx --yes --package @playwright/cli playwright-cli -s=lab state-load .recovery/lab-browser-state.json
npx --yes --package @playwright/cli playwright-cli -s=lab run-code --filename scripts/test-lab-browser.js
```

Use `npm run test:lab:e2e` for fresh temporary test accounts that are cleaned up. Adding `--live`
spends up to four small completion attempts across two transitions; omit it for repeatable
offline-provider integration. The explicit live allowance for this implementation is bounded;
do not run repeated live checks in a loop. `--keep-fixture` retains a private local demo account
and browser state for a subsequent walkthrough. No test credentials are committed.

## Remaining limits

Only the three listed straight-line models are supported. No arbitrary simulations, full
chapter coverage, durable run history, force explanation, Urdu-specific teaching blocks,
teacher approval, broad AI accuracy result, or zero-error guarantee is claimed. Scientific
review here checked source pages/equations; independent teacher/pedagogy review is still pending.
Live Groq fallback was tested with fixtures, not a deliberately induced live Gemini outage.
Local migrations and restored PDFs are required; hosted migration and merge are intentionally
pending. The automatically published initial preview needs Vercel cleanup and is not a hosted
acceptance result. A clone on another machine must have the matching reviewed content or
the families fail closed. Model selection/parameter interpretation can still be wrong; explicit
confirmation, strict validation, and code-owned results bound its effect.

### Follow-up audit

Quantity parsing, signed journey explanations and notebook restoration have regression coverage.
An additional live proposal correctly preserved "from rest", long unit names and `.5 seconds`
in 2,602 ms. The expanded browser flow and local API integration passed; browser AI uses fixtures.
