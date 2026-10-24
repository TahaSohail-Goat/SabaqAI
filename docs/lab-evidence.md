# Concept Lab scientific evidence and boundaries

Review date: 2026-10-24. This is an implementation source inspection, not teacher approval.
The requested `PHYSICS_LAB_FEASIBILITY.md` was absent from the checked-out repository and the
other local project checkouts. The current database, original PDF, and current source code were
inspected directly instead of treating an unavailable historical report as evidence.

## Identity and content versions

The retained **local** database identifies source `a97af255-a158-41a0-9e9f-b341c7c0c059` as
FBISE / Class 9 / physics / textbook / English / Chapter 2, Kinematics. Its chapter UUID is
`bb2ef426-f3b7-4cfc-9a5d-6219c99dbe95`. Storage path: `fbise/9/physics/textbook-2-en.pdf`.
No hosted data was changed. No OCR, chunks, or embeddings were changed.

`src/lib/lab/evidence-pins.ts` is the version manifest: original PDF SHA-256, chapter PDF
SHA-256, and seven chunk UUID/content SHA-256/page-range pins. `loadLabEvidence()` reloads
stored rows with the exact source/curriculum identity, verifies their content hashes, and builds
citations exclusively from those rows. Missing/changed required chunks disable the affected
family. A missing/changed chapter PDF disables the lab. Byte verification has a five-minute
process cache; source/chunk identity checks are repeated on every request.

The original PDF was inspected locally at `.recovery/obtained/fbise-9-physics-textbook.original.pdf`.
Rendered pages are retained in ignored `.recovery/prepared/physics-page-*.png`. Printed book
page numbers match the original PDF's one-based pages for this chapter. The stored chapter PDF
has 26 pages, beginning at original page 35. Existing `AskDocumentReader` rebases a citation as
`chapter page = original page - 35 + 1`: book page 38 opens chapter page 4, not page 38.

## Principles inspected in the original pages

| Original page | Support | Used by |
| --- | --- | --- |
| 39 | Path length versus directed change in position | All families, especially two-leg journeys |
| 40 | Speed as distance / elapsed time; SI m/s | Uniform motion, average speed |
| 44 | Velocity as displacement / elapsed time; direction | Signed straight-line motion |
| 45 | Average velocity and uniform velocity | All families |
| 46–47 | Change in velocity / time; constant acceleration | Constant-acceleration model |
| 50 | Distance–time axes and slope; non-negative distance | Distance graph |
| 53–54 | Motion graph gradient and area relationships | Velocity and graph explanations |

The page 45–46 car example contains inconsistent elapsed-time values between its text and
worked parts. The Lab does not copy that example's numbers; both averages always use the same
positive full elapsed time of the actual run.

The complete expression `x = x0 + ut + 0.5at²` was independently confirmed in
[OpenStax College Physics 2e, §2.5](https://openstax.org/books/college-physics-2e/pages/2-5-motion-equations-for-constant-acceleration-in-one-dimension),
along with `v = u + at` and the zero-acceleration specialization. This external equation check
is labelled separately in the UI. The Lab does not claim that the full expression was found in
the inspected textbook pages. Registry equations are reviewed code-owned strings; OCR and
provider output are never parsed into executable formulas.

## Enabled models and assumptions

- **Uniform:** `x(t) = x0 + vt`; distance `|v|t`, including stationary and signed motion.
- **Constant acceleration:** `v(t) = u + at`; `x(t) = x0 + ut + 0.5at²`. For total distance,
  split the path at `-u/a` only when it lies strictly inside the elapsed interval, then add the
  absolute displacements of the segments. This implements path length rather than the absolute
  net displacement. Graph samples include the exact turning time.
- **Two legs:** each leg has a constant signed velocity and a positive duration. Sum absolute
  leg displacements for distance and signed leg displacements for net displacement. Divide by
  the full elapsed time for either average. A velocity jump at the boundary is an idealization;
  acceleration there is not simulated. The velocity plot shows a discontinuous step.

All models are one-dimensional, with right positive. They prescribe motion; they do not model
forces, collisions, friction, projectiles, or arbitrary user-generated scenes. The position and
constant-acceleration plots are mathematical consequences of the reviewed models, not claimed
reproductions of textbook figures. No mastery or definite misconception is inferred.

## Implementation bounds

These are conservative finite demo settings, **not textbook physical limits**. Initial position
is ±100 m; each input velocity is ±30 m/s; constant acceleration is ±10 m/s²; each duration is
0.1–30 s (a two-leg journey can last 60 s). They keep the scene and graph ranges useful while
covering rest, braking, reversal and closed journeys. Final velocity is calculated and is not
clamped to the initial-velocity bound. Internally everything uses SI. Accepted conversions are
metres/kilometres, seconds/minutes, m/s/km/h, and m/s². Unknown units, non-finite values, unknown
fields and parameters from a different family are rejected.

Suggested settings are marked and require explicit confirmation. Animation and graphs share
the same pure engine as the server. Comparisons use shared spatial/time axes and one changed
SI parameter. Unequal durations are explicitly identified. A claim about doubling distance is
rendered only after the uniform-motion/equal-time/value-ratio checks pass.

## Evidence channels and AI limits

Textbook references support scientific principles. Signed run IDs, input hashes, solver and
registry versions support observations. Server results are recomputed from validated inputs.
The AI may select approved experiments, settings, reviewed explanation blocks, observation
references and follow-ups. All structured responses are validated again in application code.
It supplies no authoritative displayed results, equations, prose, citations, or units of results.
Misrouting or omissions remain possible; students see and confirm the proposed settings.
Invalid output and provider unavailability leave reviewed deterministic teaching available
with an explicit personalized-guidance-unavailable label.

Scientific coverage beyond the enabled models and independent teacher/pedagogy review remain
outside this implementation. No human approval is claimed.
