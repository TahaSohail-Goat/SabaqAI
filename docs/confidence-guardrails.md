# Confidence Guardrail — the core feature

2026-10-23 adequacy follow-up: grounding alone no longer certifies answer completeness. The same
independent review also evaluates requested reasoning, examples and omissions. A bounded one-repair
path needs exact existing evidence and a new review inside the configured call/deadline budget.
See [adequacy contract and actual checks](ask-evolution/ANSWER_ADEQUACY.md). Final REFUSE remains terminal.

2026-10-23: scoped Ask/shared Quiz can now assess uncertain evidence **before the final gate**.
Finite nonempty seeds below existing PASS_TOP1 receive one exact-excerpt sufficiency assessment,
requiring independent support review for admission. Sufficient or useful partial support can
authorize only BORDERLINE; insufficient support returns final REFUSE and no further model call.
Scores and thresholds are unchanged; no new floor was calibrated. Strong-score and legacy callers
retain their score path. Cutoff refusals explicitly say semantic sufficiency was not assessed.
See [decision path, regressions and measured latency](ask-evolution/FALSE_REFUSAL_FIX.md).
The score-only decision/table below describes the legacy path, not the new assessed path.

2026-10-20: Ask now interprets the question and assembles bounded evidence **before** the final
`evaluateConfidence()` call. Once it returns REFUSE there are no further model calls. The gate
only sees genuine scored seeds retained in the final payload; contextual neighbors have null
similarity and do not count as support. Duplicate/heavily overlapping bodies are removed first.
Finite/range checks fail closed. Threshold values are unchanged by this feature; no calibration
or new accuracy claim is made. See [active pipeline](ask-evolution/IMPLEMENTATION.md). Historical
eval commands/starting thresholds below are not an up-to-date description of available tooling.

This is why Sabaq AI is trustworthy. It must be simple, calibrated, and impossible to bypass.

## The decision

After retrieval, before generation, decide from the scores:

```
if no chunks found                       → REFUSE (no_candidates)
if top score >= PASS and support >= 2    → PASS
if top score >= BORDERLINE               → BORDERLINE
otherwise                                → REFUSE (low_similarity)
```

- `top score` = the highest similarity (score = 1 - cosine distance).
- `support` = how many chunks scored above the support threshold.

**Fail closed:** if scoring throws an error, or filters are missing, the answer is REFUSE — never
PASS. There is no config flag that turns the gate off.

## What each decision does

| Decision | LLM called? | What the student sees |
| --- | --- | --- |
| PASS | Yes | Answer + citation + "Grounded in your syllabus" |
| BORDERLINE | Yes, with a low-confidence note | Answer + "partly supported" + nearest chapters |
| REFUSE | **No** | "This isn't in your syllabus" + 3 nearest chapters + a reformulation hint |

## Thresholds

In `.env.local` (starting values — you WILL calibrate these on Day 6):

```
PASS_TOP1=0.62
BORDERLINE_TOP1=0.52
SUPPORT_SCORE=0.50
```

These numbers are guesses until Day 6. Don't trust them until you've run the eval.

## Calibrating on Day 6 (simple version)

1. Run `npm run eval` — it prints each question's top score and whether it was in- or
   off-syllabus.
2. Look at where in-syllabus and off-syllabus scores separate. Pick a `PASS_TOP1` just above the
   off-syllabus scores.
3. Prefer refusing a borderline question over answering an off-syllabus one — a confident wrong
   answer costs more than a missed one. That asymmetry is the whole point of the product.
4. Re-run until off-syllabus questions mostly refuse and in-syllabus mostly answer.

## Refusal copy rules

- Say plainly the syllabus content wasn't found. Never phrase it as a system error.
- Never give a partial answer or hint — in any language.
- List the 3 nearest chapters, tappable.
- Suggest one reformulation.
- Respond in the student's language.

## The two demo moments this creates

1. **Grounded answer** with a real page citation the student can check in their book.
2. **The refusal** — ask something off-syllabus, watch it decline instead of bluffing, and note
   it's *faster* because no answer was generated. Most demos would have bluffed. Yours doesn't.
