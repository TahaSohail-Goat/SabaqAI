# Confidence Guardrail — the core feature

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
