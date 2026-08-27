# Evaluation — the numbers that win the judging

Most hackathon AI demos assert they don't hallucinate. You can measure it. That gap is your
strongest differentiator, and this doc is how you defend it.

Run it with `npm run eval`, or open the Eval tab (`GET /api/eval`).

---

## What it measures

Every question in the labelled set runs through **live retrieval and the live guardrail** — the
same code path a student hits. Nothing is simulated.

| Metric | Definition | Target |
| --- | --- | --- |
| **Retrieval accuracy** | Of in-syllabus questions, the share where the expected chapter appeared in the retrieved set. | High. If low, chunking or embeddings are wrong. |
| **Off-syllabus refusal rate** | Of off-syllabus questions, the share the gate refused. | As close to 100% as you can get. |
| **False acceptance rate** | Off-syllabus questions that got *answered*. | **Zero. This is the number that matters most.** |
| **False refusal rate** | In-syllabus questions that got *refused*. | Low, but non-zero is acceptable — see the asymmetry below. |

### The asymmetry that defines the product

A confident wrong answer costs a student far more than a missed one. A student who gets "not in
your syllabus" asks again differently. A student who gets a fluent answer from the wrong curriculum
writes it in a board exam and loses the marks.

So when you tune thresholds, **prefer a false refusal over a false acceptance, every time.** If you
have to choose between refusal rate and coverage, choose refusal. Say this out loud to the judges —
it shows the tradeoff was designed, not stumbled into.

---

## The labelled set

**Single source of truth: `src/lib/evaluation/questions.ts`.** Both `/api/eval` and
`npm run eval` import it and both call `runEvaluation()` in `src/lib/evaluation/run.ts`, so the
dashboard and the CLI can never report different numbers for the same system.

(This set previously existed in three places — the route, the script, and a `.jsonl` file — with
different questions *and* different field names. They have been consolidated. Do not add a second
copy.)

Each entry:

```ts
{
  id: 'is-001',
  lang: 'en',                 // 'en' | 'ur' | 'roman_ur'
  label: 'in_syllabus',       // or 'out_of_syllabus'
  subject: 'physics',
  question: "What is Ohm's law?",
  expectedChapter: [14],      // empty for out_of_syllabus
  reason: undefined,          // why it's off-syllabus, shown in the report
  nearMiss: undefined,        // true for the hard cases — see below
}
```

**Label these yourself against the actual textbook.** Do not have an AI generate them. An AI-labelled
eval set measures whether two models agree, not whether your system is correct — and a judge who
asks "who wrote your ground truth?" will find that out in one question.

---

## Making the set actually prove something

The current off-syllabus questions are SN2 reactions, quicksort, kidney ultrafiltration,
photosynthesis, and Black-Scholes. Those are trivially far from Class 10 Physics. Any embedding
model separates them. **Refusing them proves close to nothing**, and a judge who knows retrieval
will spot that immediately.

The hard cases — the ones worth measuring — are **near-misses**:

| Near-miss type | Example | Why it's hard |
| --- | --- | --- |
| Wrong class, same subject | "Derive the equations of motion" (Class 9 Physics) | Same vocabulary, same subject, wrong syllabus |
| Above grade level | "Explain Maxwell's equations" (Class 11/12) | Topically adjacent to Chapter 15 |
| Adjacent but uncovered | A Chapter 16 electronics question when only 14/15 are ingested | Right class, right subject, missing content |
| Right topic, wrong depth | "Prove Ohm's law from Drude theory" | Correct chapter, beyond the book |

**Four near-miss questions are now in the set** (`nm-001` … `nm-004`), flagged with
`nearMiss: true` and reported as their own metric, `nearMissRefusalRate`, so the hard number is
never averaged away by easy wins.

### What they immediately caught

On the first run they exposed a leak the easy questions had completely hidden:

| Set | Refusal rate |
| --- | --- |
| Easy off-syllabus only | 100% |
| Including near-miss | 88.9% overall, **75% near-miss**, **11.1% false acceptance** |

`nm-003` — *"Derive Ohm's law from the Drude model of electron conduction"* — scored 0.709 and was
answered. Right chapter topic, far beyond the textbook's depth. That is a real off-syllabus answer
reaching a student, and the easy question set reported a clean 100% while it was happening.

This is the entire argument for near-miss testing: *"we refuse chemistry questions"* is not a
guardrail claim, it's a keyword filter with extra steps. *"We refuse Class 9 physics"* is a claim
worth defending.

> Those numbers came from the keyword fallback path, not real embeddings. Do not tune thresholds
> against them — recalibrate once the real corpus is ingested. But expect near-miss leakage to be
> the thing you actually have to fight, and budget Day 6 for it.

Keep the easy off-syllabus questions too — they're your clean demo moment.

---

## Calibrating the thresholds

Thresholds live in `.env.local`:

```
PASS_TOP1=0.62
BORDERLINE_TOP1=0.52
SUPPORT_SCORE=0.50
```

**These starting values are guesses. They are meaningless until you calibrate against real ingested
content** — they were picked before any real corpus existed.

1. Run the eval. For every question, note `top1Score` and its label.
2. Sort by score. Find where in-syllabus and off-syllabus scores separate.
3. Set `PASS_TOP1` just **above** the highest off-syllabus score.
4. Set `BORDERLINE_TOP1` below that, wherever partial support is still useful.
5. Re-run. Repeat until false acceptance is zero.
6. If the two groups overlap so much that no threshold separates them, the problem is retrieval
   quality, not the threshold. Fix chunking or embeddings — don't paper over it with a number.

Record the final values and *why* you chose them. "We set PASS at 0.62 because our highest
off-syllabus score was 0.58" is a much better answer than "it seemed to work."

---

## Reading the report

Each row in `results[]` gives you:

- `top1Score` — the highest similarity found. The number the gate decided on.
- `supportCount` — how many chunks cleared `SUPPORT_SCORE`. PASS needs at least two, so a high
  `top1` with `support: 1` still won't pass. That's deliberate: one strong match can be a
  coincidence.
- `decision` — PASS / BORDERLINE / REFUSE.
- `passedVerification` — for in-syllabus, the expected chapter was retrieved *and* the gate let it
  through. For off-syllabus, simply that it refused.

A row where `retrievalAccuracy` is fine but the gate refused means your threshold is too high. A
row where the wrong chapter was retrieved means chunking or embedding is the problem, and no
threshold will fix it.

---

## What to say to a judge

Lead with the false acceptance rate. It's the number that maps directly to "does it lie to
students."

> "We labelled *N* questions by hand against the actual textbook — in-syllabus, off-syllabus, and
> near-miss cases from Class 9 and Class 11 physics. Off-syllabus false acceptance is *X*%. When
> retrieval confidence is below our calibrated threshold, the language model is never called at
> all — so there's no path by which it can invent an answer."

If a number is bad, show it and say what it tells you. A team that reports a 12% false refusal rate
and explains the tradeoff reads as more credible than a team reporting a suspiciously perfect
sweep. Judges have seen fabricated metrics before.

**Never** show a metric the eval didn't compute. If the UI prints a number, it must come from
`/api/eval` — see defect #5 in `docs/project-status.md`.
