# Ask evolution: actual evaluation record

Date: 2026-10-20. These are development results, not measured academic accuracy or teacher approval.

## Automated checks

`npm.cmd run test:ask`: **58 tests passed** at the latest recorded run. The suite exercises
the orchestrator, schemas, signed clarification lifecycle, protected scientific spans, source/scope
exclusion, overlap removal, no-score neighbors, gate refusal control flow, token/call bounds, structured
blocks, examples/calculation checks, reviewer identity failures, one repair, timeouts and input/rate limits.
The actual retrieval adapter is exercised against a local HTTP fixture serving embedding/PostgREST
responses; assertions inspect real outbound filters, section/index bounds and unrounded scores.

React server-render tests cover canonical prose before secondary sources, safe escaping, native
clarification controls, Urdu direction and legacy response rendering. These do **not** establish
browser interaction, layout quality, source-reader clicking or real model teaching quality.

Default tests use no real provider or database credentials. Fixture claims and reviewer verdicts are
controlled test data, including deliberately unsupported statements; they are not live model judgments.
Two initial preservation regressions (Roman Urdu `ka kam` and `ohms law`) failed and were fixed before
the passing run. Additional tests guard invented/swapped numerical givens and stalled input streams.

`npm.cmd run lint`: passed. `npm.cmd run build`: passed after enabling normal network access for
the existing Google Fonts downloads. The initial sandboxed baseline build failed downloading those
fonts; no application font changes were made. The build retained a pre-existing PDF.js Node warning.
`git diff --check`: passed at the recorded inspection.

## Local HTTP integration

The built Next app was started on localhost:3100. Three invalid input/scope requests each returned
HTTP 400 with typed error, request ID and no-store cache policy. An anonymous GET /doubts returned
307 to login, preserving existing page authentication. A valid anonymous API request from the
network-restricted server returned HTTP 503/unavailable, with no answer or invented citations.
This tests the actual endpoint's operational-error envelope, not successful provider integration.

Browser inventory returned **no available browser**. Full browser flows, cancellation ordering,
mobile layout and source-reader interaction have **not been executed** in this session. The code
contains those behaviors, with rendered UI coverage; visual/interactive acceptance remains open.

## Live checks (separate, opt-in)

The environment already had Gemini, embedding and hosted Supabase configuration. Values were not
printed or copied. `scripts/ask-live-smoke.ts --live` performs no DB writes; production fixtures are
not substituted for missing content.

| Synthetic question | Actual result | Calls / latency |
| --- | --- | --- |
| Explain Ohm's law at constant temperature with a simple example. | Understanding ready; retrieval failed; no explanation generated | One Gemini generation, 27,589ms total; understanding 25,601ms, retrieval 1,983ms |
| current ka effect | needs_clarification; no retrieval and no explanation | One Gemini generation, 23,325ms |

Model: existing `gemini-3.5-flash-lite`. Prompts: ask-understanding-v1 / ask-teaching-v1 /
ask-support-v1. Corpus version/count: **unavailable** in this checkout's configured environment.
A separate read-only corpus probe failed hostname resolution with `ENOTFOUND`. Therefore live
hydration, section expansion, explanation, citation validation and support review against the real
corpus are **not established by this session**. Earlier project-status claims describe prior machines
and runs, not a new result here. No old/new model comparison was possible. No teacher review occurred.

To repeat, after repairing the existing environment connection:

```powershell
node --env-file=.env.local --import tsx scripts/ask-live-smoke.ts --live
node --env-file=.env.local --import tsx scripts/ask-live-smoke.ts --live '--question=current ka effect'
```

The script requires explicit --live, uses configured quota and reports metadata rather than full
student text or provider errors. Do not treat its exit status alone as answer accuracy.

## Subsequent local Docker and synthetic-provider checks

After the user opened Docker and requested local testing, inspection found no existing Supabase
containers or data volume on this laptop. An isolated `sabaq-ask-review` stack was initialized under
ignored `.recovery/ask-stack`, with official CLI/images. Existing CivicPulse volumes were untouched.
The original `.env.local` was preserved; `.recovery/ask-local.env` supplies process-only local settings.

Fresh startup exposed pre-existing invalid SQL in `0010_avatar_url.sql`: PostgreSQL does not support
`CREATE POLICY IF NOT EXISTS`. Three clauses were adapted **only in the ignored combined migration
copy for the new empty database**. Original migrations are unchanged. The local stack then started
successfully (database, gateway, auth, REST and storage). The repository's schema torture suite passed
all 22 assertions and rolled back. Explicit subsequent counts were zero chunks and zero chapters.
Local options returned HTTP 200 with three source types and no invented units; /doubts still redirected
anonymous users to login. A local-configured production build passed. Running Next directly with Node
--env-file flags initially failed worker argument validation; spawning the Next command from a parent
that loads the environment resolved this without changing application code.

Automatic approval review rejected the command to export the entire real Magnetism OCR chapter to
api.jina.ai for embedding and create a local account. The stated reason was that local testing permission
did not explicitly authorize exporting the corpus to that external destination. No chapter was sent by
the rejected command. The user subsequently explicitly approved embedding/account creation and
question-plus-bounded-evidence provider tests. A newly supplied embedding-bearing backup removed the
need for chapter re-embedding. No whole chapter was exported. The source-file proposal had 33 sections
and was 66,860 bytes; it was superseded by the local restore described below.

A separate safe provider check used only the explicitly synthetic passages in tests/ask/fixtures.ts,
with fixture retrieval scores clearly labeled synthetic and no DB/embedding calls. Two initial attempts
failed in explanation: 29,334ms and 48,336ms, two generations each. Sanitized diagnostics confirmed
HTTP 400/schema rejection rather than quota exhaustion on the second attempt. The provider wire schema
was simplified; full server validators still enforce all bounds and patterns.

The next synthetic live run returned answered/partial with three canonical statements, two rebuilt
fixture citations, a book-example label supported by the fixture text, an explicit numerical-example
limitation, and supportReview=model_reviewed. Three generations; total 84,660ms (understanding 31,977ms,
explanation 26,277ms, support review 26,125ms; token count 271ms / 1,103 input tokens). No statement was
rejected by that model reviewer. This validates provider plumbing on synthetic evidence, **not** actual
textbook retrieval, teacher-reviewed quality or academic accuracy. The request deadline was adjusted
to 110s based on this observed latency, with the route ceiling remaining 120s.

## Approved restored-corpus checks: final record

The user supplied `data/db_cluster-03-10-2026@10-33-39.backup.gz` and requested a container. Only four
curriculum COPY sections were extracted and loaded, in dependency order, inside a transaction that
refused a nonempty target. No auth/student rows, schema commands or role/password statements from
the backup were executed. Restored counts: **494 chapters, 498 sources, 8,491 sections, 8,594 chunks**;
all 8,594 stored vectors have dimension 1,024. Backup SHA-256:
`49cfeb7745d6918335e214fdbc2aedba9d73a68347259541fb5c2e265ad58880`.
The archive is now narrowly ignored in Git; existing contents were preserved.

The actual retrieval/hydration/neighbor adapter was exercised against the restored database, using a
known stored vector served on loopback (zero external provider calls). Physics 10 ch7 returned six
eligible scored seeds; a nonexistent board returned no rows. A real multi-chunk Mathematics 9 ch11
section returned two context rows with null scores. This is a stored-vector service integration test,
not student-question semantic accuracy. An RPC self-match also preserved chapter/source filters.

A separate approved local review account was created, initially Class 9 and subsequently changed to
Class 10 for the main review examples. Credentials stay in `.recovery/ask-demo-login.json`. Real HTTP
login and authenticated /doubts each returned 200. Options return all 12 Physics 10 textbook chapters;
Current Electricity's source-reader endpoint returned 19 sections/chunks. Missing PDF bytes correctly
produce OCR readers rather than links to nonexistent files.

All following provider questions were synthetic test questions against the real restored corpus.
Same existing model and prompt versions as above; defaults except where noted. No new threshold
calibration was performed and thresholds were not lowered to force positive results.

| Case / scope | Actual result | Generation calls / total latency |
| --- | --- | --- |
| Ohm's law with constant temperature and simple example / Physics 10 ch7, attempt 1 | Ready; real retrieval; BORDERLINE; Gemini explanation returned HTTP 503; typed unavailable | 2 / 57,375ms |
| Same case, one recorded retry | BORDERLINE; held back after generation/validation as ungrounded/unanswerable; review not reached | 2 / 55,204ms |
| “why evapration make thng cold” / Physics 10 ch2 | answered/sufficient; original retained; full interpretation “Why does evaporation make things cold?”; four connected statements and a book sweating example | 3 / 73,658ms |
| Ohm's law plus Drude derivation / Physics 10 ch7 | REFUSE/low similarity at final gate; zero explanation calls | 1 / 22,023ms |
| Football World Cup 2022 / Physics 10 ch7 | REFUSE/low similarity at final gate; zero explanation calls | 1 / 26,563ms |
| Magnetic poles with example / authenticated Physics 9 ch8 | HTTP 200 refusal; top score approximately .462 below existing gate; no explanation call | 1 / server trace 23,941ms |
| Authenticated “current ka effect” / Physics 9 ch8 | HTTP 200 clarification with Heating/Magnetic/Chemical choices; selecting Magnetic resumed with original preserved and confirmed question; final evidence refusal | First request 1; resumed request had no repeat normalizer |
| Clarification scope/identity attacks | Changed chapter and forged option HTTP 400/invalid_clarification; unauthorized class HTTP 403 | No explanation calls |
| Authenticated repeat of cooling typo / Physics 10 ch2 | Login/page/options 200; Ask HTTP 504/timeout; no fabricated answer | Reached total request deadline |
| Cooling/sweating plus exact molecular energy / Physics 10 ch2 | needs_clarification for missing information; no retrieval or explanation | 1 / 24,975ms |
| Additional clear “State Ohm's law and explain relationship between voltage, current and resistance” / Physics 10 ch7; optional repair explicitly enabled for this test | Timed out during explanation; repair never reached | 2 / 110,017ms (understanding 56,826ms; explanation 51,534ms) |

For the successful real cooling result, all citation chunk IDs resolve in the actual source-reader
document, page metadata matches stored section page 57, excerpt is the stored text prefix, and the
book sweating example occurs in that cited passage. This was checked through the local document API.
It demonstrates one complete real answer path. It does not establish general academic accuracy.
The other results expose real conservative refusals, provider outage and high/variable latency;
they are included rather than reporting only a successful correction. The narrower cause of the
second Ohm generation refusal was not isolated; the additional diagnostic timed out before output.

Browser interaction/mobile layout and teacher review remain unexecuted. Source-click **identity**
was checked through API responses; an actual browser click was not performed. The local app and
Supabase stack are left running for review. No hosted data was changed and no deployment occurred.

## Human-review pack and local review steps

`evaluation-cases.json` has 44 draft scenarios (30 development, 14 held out), with explicitly synthetic
fixture passages, intended meaning, language, scope, clarification choices, source references, requested
aspects, boundary and expected behavior relative to those fixtures. These are review candidates, not
a recovered or teacher-reviewed ground-truth dataset. None has been human-approved. Before reporting
live coverage, replace fixture references with actual eligible stored chapter/section/page IDs and
record corpus/model/prompt configuration, outputs, latency, calls and failures for every executed case.
Keep held-out scenarios out of prompt tuning. No student-facing evaluation metric is added.

For the running local review app, sign in at http://localhost:3100 using the credentials in ignored
`.recovery/ask-demo-login.json`, then open `/doubts`. The account is FBISE / Class 10; select Physics
and the actual chapter containing the concept (use picker titles, not historical chapter numbers).

1. **Clear:** In chapter 2 Thermal Expansion And Change Of State, ask “Why does evaporation make things cold?” Inspect direct answer,
   connected explanation, example label and source. Click a near-claim page reference and inspect the
   stored passage in the existing reader. Compare necessary qualifications with the source.
2. **Typo:** In an eligible chapter ask “why evapration make thng cold”. The original remains in the
   textarea, interpretation is inspectable/editable, and clear intent should proceed without confirmation.
3. **Ambiguous:** In Current Electricity, ask “current ka effect”. Choose a relevant effect or enter another full meaning.
   Original question and scope must survive; changing chapter/subject invalidates old choices.
4. **Partial/refusal:** In chapter 7 Current Electricity ask for Ohm's law plus a Drude-model derivation. If only the basic law has evidence,
   expect a supported basic explanation with the missing derivation stated, or refusal if the core
   cannot be supported. Never fill the extension from general knowledge.
5. **Refusal:** Ask a clearly unrelated or unsupported question within the selected chapter. Expect
   neutral refusal with actual/empty nearest chapters, no explanation model call after gate REFUSE.

Also exercise Cancel, rapid double-submit, editing while waiting, changing scope mid-request, retry
after an outage, Urdu with formulas, keyboard clarification controls and an unknown envelope. These
remain manual/browser acceptance steps, not claims of completed checks.

For an additional Class 9 review, explicitly change the local account's class in Settings and use
Physics / Textbook / Chapter 8 Magnetism. Equivalent review questions:
“Explain how like and unlike magnetic poles interact, with an example”; “why lik magntic pols rpel
and unlik pols atract”; “magnet effect”; “Explain attraction and repulsion of magnetic poles, then
derive quantum spin exchange”; and “Who won the football World Cup in 2022?”. The third should clarify,
the fourth should be partial/refused as supported by actual evidence, and the fifth should refuse.
Local account credentials belong only in ignored `.recovery/ask-demo-login.json`.

The built local app runs on http://localhost:3100; API/DB state belongs to `sabaq-ask-review`.
Restart the app with process-specific settings (no environment-file replacement):

```powershell
node --env-file=.env.local --env-file=.recovery/ask-local.env -e "const r=require('child_process').spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3100','-H','localhost'],{env:process.env,stdio:'inherit'});r.on('exit',c=>process.exit(c??1))"
```

Use `build` in that child argument list before `start` after source changes; use `dev` for development.
To restart Supabase, run `.recovery/cli/node_modules/.bin/supabase.cmd start --workdir .recovery/ask-stack`
with the exclusions recorded in PROGRESS.md. Never reset the DB or remove existing Docker volumes.
