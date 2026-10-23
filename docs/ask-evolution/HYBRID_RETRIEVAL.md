# Doubts hybrid retrieval — 2026-10-22

Implemented on `doubt-finalize`, compared with committed baseline `8238c8e`.
This report describes executed fixture checks, not corpus accuracy or provider quality.

## Behavior

- The same understanding call conservatively corrects the complete question and extracts concepts.
  Clear wording should remain unchanged. Added deterministic protection for `dont`, `doesnt`, and
  `increse`; the scientific/meaning checks remain a limited parser, not a semantic guarantee.
- One Jina query embedding still uses the entire corrected retrieval question. Concepts and words
  from that question supply bounded lexical hints in the same retrieval operation.
- Migration `0023_ask_hybrid_search.sql` adds PostgreSQL English full-text matching (stemming and
  OR terms), an expression GIN index, and a service-role-only hybrid RPC. Previously there was no
  database lexical search/index. No corpus rows/vectors or original vector RPC are replaced.
- The RPC unions up to `TOP_K` vector and lexical candidates. Reciprocal-rank fusion (constant 60)
  orders the union, preserving the strongest vector first. The application deduplicates actual rows,
  excludes heavily overlapping content, keeps one source per chapter, then selects up to six seeds.
  A lexical miss cannot exclude a vector match. Fusion rank is never a confidence score: every seed
  retains its own full-question cosine similarity, and the gate receives those scores sorted.
- Board/class/subject/source category/chapter and explicit source UUID filter both search branches,
  hydration and context reads. Exact source metadata is checked before query embedding. Wrong or
  ambiguous source selections fail closed rather than broadening scope.
- Options now expose each stored `chapter_sources.id` and language separately, with that source's
  PDF URL and page offset. The frontend sends `sourceId`; the OCR reader uses the same identity.
  Old persisted selections without an identity require reselection. Older API clients may omit it
  only when the permitted source record is unique. A chapter source is not a book-wide edition ID;
  the current schema has no edition entity and this change does not invent one.
- Existing Quiz snapshots have chapter scope without a picked source UUID. Only internal Quiz mode
  preserves that existing scope and chooses one hydrated source per chapter. HTTP clients cannot
  enable that exception; an explicit Quiz source UUID, if present, is enforced. Normal Ask/Quiz share
  the same hybrid adapter, gate, citation checks and review pipeline.
- Overlapping neighbor ranges in the same section/source are merged; distant windows remain separate.
  Nearby passages need a question/concept anchor in the same sentence as a relational/conditional
  predicate, a supported local qualification pattern, or an example with multiple anchors. Conditions
  remain adjacent to their seed. This is an English-oriented relevance heuristic, not complete concept
  boundary discovery. Default chunk/byte/token budgets and null neighbor scores are unchanged.
- Teaching requests an easy, direct explanation, necessary supported reasoning, usually 100–200 words,
  explicit partial coverage and an example only when supported. Existing citation/schema validation,
  final score gate, support review, optional bounded repair, refusal rules and PDF page rebasing remain.
  No threshold was changed and no extra LLM call was added.

## Executed comparisons and checks

Before editing, Node 24.18.0 passed all 83 existing Ask/Quiz tests. The restricted shell could not run
tsx's Windows user lookup; the same command passed outside that restriction. `npm.cmd` was used because
PowerShell blocks the npm.ps1 shim. These were environment failures, not application test failures.

The baseline source was exported to ignored `.recovery/hybrid-before`, without branch switching.
Its actual pure functions and the edited functions were run on identical invented fixtures:

| Case | Baseline | Updated |
| --- | --- | --- |
| Nearby keyword-list passage mentioning temperature | Included | Excluded; actual condition retained |
| Rewrite removes `dont` in typo-heavy boiling question | Deterministic check missed lost negation | Deterministic check catches it |
| Hydrated candidate belongs to another explicit source | Source UUID not consulted by eligibility | Rejected |
| Condition passage outside six-vector shortlist | Absent from shortlist | Included through lexical branch |
| Synonym-only strongest vector with no lexical hits | Retained | Retained |

The SQL fixtures use deliberately constructed vectors, not newly generated embeddings. They check
hybrid candidate recovery, original cosine scores, deduplication, empty/unmatched lexical queries,
wrong source/category/chapter/subject/class/board isolation, and effective function privileges.
All inserted fixture rows roll back. They passed in both a disposable normalized fixture database
with vector in `extensions` and the actual restored local schema with vector in `public`.

The first local migration attempt assumed the extension namespace and rolled back on a missing type.
The corrected migration resolves the installed vector type through a pinned `public, extensions`
search path without moving it. Migration 0023 is now applied **locally only**, followed by a PostgREST
schema reload. Before/after full-row fingerprints matched for 494 chapters, 498 sources, 8,491 sections
and 8,594 chunks, including source paths, OCR, chunk identities and stored vectors. Hosted migration
application remains a rollout prerequisite; no hosted writes/settings or provider calls were made.

HTTP fixture checks exercise the real adapter/options/document handlers: full question embedded once,
concept hints included, exact source validated, source-specific page offsets preserved, source UUID
sent to hydration/neighbor/OCR queries, ambiguous/missing identities rejected before embedding, and
foreign hydration rejected. Pipeline fixtures cover typo preservation, clarification, insufficient
evidence, partial support, unsupported statements, source-bound clarification, and existing Quiz flows.

Final executed checks on Windows Node 24.18.0: `npm.cmd run lint` passed; `npm.cmd run test:ask`
passed 91 tests with none skipped; `npm.cmd run test:notifications` passed 16 tests with none skipped;
`npm.cmd run build` passed (normal Next.js 16.3.3 Turbopack production build). The build emits the
existing PDF.js Node "use the legacy build" warning, without failing. No dependency changes were needed.

## Latency observations

Existing stage logs are retained. Added `source_validation`, `embedding`, `hybrid_search`, `hydration`,
and `evidence_selection` durations appear alongside understanding, retrieval, expansion, token count,
generation and support review. Nested stages must not be summed with their enclosing retrieval stage.

One recorded fixture run measured vector-only SQL at 0.867 ms and hybrid SQL at 3.364 ms. The rerun
with `extensions.vector` measured 0.832 / 2.550 ms; actual-schema fixtures measured 1.390 / 3.354 ms.
These are tiny local fixture queries, not student endpoint timings or a performance benchmark.
An un-warmed pure-selection loop of 1,000 fixture iterations measured 17.96 ms before / 13.03 ms after;
this noisy micro-measurement does not establish a speed improvement. Both paths retain the same
normal three Gemini generation calls, one token count (plus optional recount), and one query embedding.
Explicit source verification adds a database read; merged neighbor windows avoid duplicate reads.

The historical 71,814 ms successful Ask audit remains historical: understanding and support review
dominated it. No new live-provider or browser timings were measured. Support review was retained.

## Remaining limits

English full-text stemming does not supply a scientific synonym dictionary; semantic matches depend
on the full-question vector. Roman Urdu/Urdu lexical and relational-heuristic recall need reviewed
fixtures/live evaluation. Hybrid rank weights are a routine retrieval choice, not a calibrated
accuracy claim. Keyword similarity still cannot establish evidence sufficiency: generation and
support review must reject unsupported relationships. Real-corpus relevance/quality and browser/PDF
click behavior were not newly verified. Existing page offsets and actual PDF bytes were not rewritten.
