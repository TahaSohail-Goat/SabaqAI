# Evidence assessment before final refusal — 2026-10-23

Historical checkpoint: [the subsequent adequacy fix](ANSWER_ADEQUACY.md) supersedes this report's
completeness and four-call-ceiling descriptions. Grounded definition-only how answers still exposed
a teaching-quality gap after this checkpoint; those earlier results are not claims about adequacy.

The reported `how non contact forces work?` request retrieved the correct evidence but the local
score-only gate refused. The fix is on `doubt-finalize`; no thresholds, corpus rows, embeddings,
source storage paths, migrations or dependencies were changed.

## Confirmed diagnosis

Local request `8d8c3fa9-6b8e-42af-a854-05a4cfb3339f` logged `low_similarity`, six seeds,
no expansion, no citation/support rejection and no teaching/review call. The two historical requests
recorded top score 0.515472, support count 2 and total request trace times 4,995 / 3,360 ms.
Their database log timings exclude a little request-finalization work: 4,900 / 3,287 ms.

The authorized source is FBISE Class 9 Physics, Chapter 3 Dynamics (English), source
`81855080-15fb-4971-b9da-5f1ddb616f74`. Chunk `2ba6fc9f-df86-450b-bb34-309f9b5b19f0`
was the second result, score 0.513276, stored section pages 63–64. Its actual OCR defines force
acting at a distance without physical contact and gives gravitational, electrostatic and magnetic
examples. The preceding contact-force chunk scored slightly higher. This was not a missing PDF,
wrong chapter or empty OCR problem. The PDF viewer's current page is not an Ask retrieval filter.

## Decision path

1. Existing understanding, full-question hybrid retrieval, source authorization, deduplication,
   bounded expansion and measured context budgets remain in place.
2. Finite, nonempty scored candidates below the existing `PASS_TOP1` are eligible for one bounded
   semantic sufficiency assessment **before** the final gate. This includes the former BORDERLINE
   region as well as scores below the former refusal cutoff. No new numerical floor was selected.
   Strong-score requests retain their existing generation and independent review path.
3. Assessment must distinguish sufficient, partial and insufficient support for the actual question.
   An affirmative verdict needs exact contiguous excerpts from allowed scored seed rows; whitespace
   alone may normalize. Unknown IDs, rewritten quotes, context-only support and contradictory verdicts
   fail closed. Context can expose conditions/conflicts, but cannot alone establish the core.
4. `evaluateConfidence()` remains the final pre-generation decision. It validates scores and the
   assessment's IDs/excerpts again. An affirmative assessment authorizes only BORDERLINE, preserving
   actual scores and medium confidence. An insufficient assessment refuses. Legacy callers without
   an assessment keep their old score behavior. No model call occurs after this final REFUSE.
5. Teaching receives the assessed plan with the same OCR evidence. The final prompt is counted again;
   an oversized plan fails closed rather than silently altering the assessed evidence. Generation may
   be more conservative, but cannot erase partial-assessment limitations. Independent support review
   and stored-row citation reconstruction still decide whether an answer can reach the student.

Independent review is required for the new path. Disabling optional student review cannot authorize
a below-cutoff answer through assessment. Quiz's shared service also uses this path and still forces
review of the submitted-response comparison and expected-answer reasoning. No HTTP field can supply
an assessment or enable Quiz mode. Invalid provider output, exhaustion, cancellation and deadline
failures return operational errors without a fabricated answer.

Teaching/understanding prompts distinguish ordinary explanation from an explicitly requested deeper
mechanism. Review instructions distinguish an independently useful, requested partial answer from
an unrelated definition offered instead of a wholly unsupported mechanism/derivation. Missing labels
remain limitations, not new academic claims.

A live response also exposed a layout-only rejection: an `aspect:example`, `kind:explanation`
statement appeared in an `example` block. Such blocks now render as ordinary explanation blocks;
statement text, kind and citation IDs remain unchanged. They are never relabeled as book examples.
All block membership, academic validation and independent support checks still run.

Refusal copy and UI headings distinguish no passages, retrieval-confidence rejection without semantic
assessment, and inability to validate a supported answer. A search cutoff no longer claims that the
textbook was semantically found insufficient.

## Actual checks

- `npm.cmd run lint`: passed.
- `npm.cmd run test:ask`: 121 offline tests passed, none skipped. Includes the existing catalogue
  structural tests; this does not mean the catalogue's 168 academic cases were executed.
- `npm.cmd run test:notifications`: 16 tests passed.
- Exact recorded-score/OCR regressions cover the original question, paraphrases, partial coverage,
  misleading keywords, unsupported requests, false citation/excerpt attempts, source/chapter isolation,
  malformed scores, provider failures, token limits, refusal copy and low-score shared Quiz review.
  Stubbed semantic verdicts test orchestration, not actual model understanding.
- The current real OCR for six logged chunks is retained in `tests/ask/non-contact-evidence.json`.
  Its page references are stored section ranges, not invented single-page precision.
  Four live response recordings are also replayed offline through the current validators and gate;
  replay results are distinct from new provider execution.
- No production build or browser visual/click verification was performed for this fix. No files under
  `src/app/` changed. HTTP availability is checked separately from component rendering tests.

## Bounded live provider checks

`scripts/evaluate-ask-sufficiency.ts --live` is explicit opt-in, requires local Supabase and performs
only eight named probes by default. `--cases=` selects a subset. It uses real Jina retrieval and
Gemini without account data, QA logging or database writes. Default automated tests call no providers.
Outputs go to ignored `.recovery/sufficiency-live-<label>.json`; no secrets are logged.

The final focused live run (`--cases=reported,partial,unsupported-theory,misleading-keywords
--label=acceptance-retry`) observed:

| Question | Old score-only gate on the same evidence | New observed result | Assessment | Final token recount | Total |
| --- | --- | --- | ---: | ---: | ---: |
| Original non-contact-forces question | REFUSE, 0.515472 | Answer, sufficient | 1,573 ms | 399 ms | 9,437 ms |
| Meaning/examples plus exact equation derivations | BORDERLINE, 0.543984 | Useful partial; derivations explicitly missing | 2,116 ms | 543 ms | 10,218 ms |
| Derive Einstein field equations | REFUSE, 0.400105 | Refused as insufficient, no teaching | 1,215 ms | none | 4,506 ms |
| Magnetic hard-disk bit encoding mechanism | REFUSE, 0.384410 | Refused as insufficient, no teaching | 1,300 ms | none | 3,640 ms |

The final original response stated action at a distance without touching and listed gravitational,
electrostatic and magnetic examples, citing the real 63–64 chunk. It did not add an underlying
particle theory. The partial response gave the Moon/Earth and nucleus/electron book examples and
explicitly withheld force-distance derivations. Every displayed statement passed independent support
review. The two unsupported questions made no teaching/review call after the assessment refused.

Earlier development probes answered a paraphrase scoring 0.485581 and an attraction/repulsion question
scoring 0.507005, refused an unrelated antibiotic question and a quantum-gravity calculation, and
exposed the partial-review and layout problems fixed above. Earlier answers sometimes added an
unnecessary, source-present fundamental-particle paragraph; the final original response did not.
Two early probes hit provider HTTP 429; a later run failed operationally at understanding and stopped.
These failures were not counted as academic refusals or successes. The completed focused retry is
reported above. Checks across intermediate revisions are not all tests of the final prompt revision.

The old-gate column is a **counterfactual on the same final evidence**, not a separately executed old
endpoint. Historical refusal timing is not a controlled before/after benchmark. Accepted uncertain
questions now use four model calls (understanding, assessment, teaching, review), versus three for
ordinary strong-score Ask, plus an extra token-count request. The final measured extra assessment and
counting work was about 2.0 seconds for the original and 2.7 seconds for the partial case. Answer
generation/review also take time the former early refusal avoided. There is no speed improvement claim.

No cosine thresholds were tuned or lowered. The small one-chapter probe is not calibration, a broad
accuracy evaluation or proof against every unsupported answer. Similarity can still admit a strong
keyword trap to generation; mandatory/default support review must reject unsupported claims there.
The four-model-call budget is unchanged; a further repair/review cannot exceed it. Quota availability,
model variability, OCR quality and evidence selection remain limitations. The full Class 9 acceptance
catalogue remains unexecuted, and broader live evaluation is required before deployment claims.
