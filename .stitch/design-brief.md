# Sabaq AI — Design Brief

These are the design principles for every screen in Sabaq AI. Use this brief as the starting
context for any Stitch design session, and check new screens against it before exporting.

## Who this is for

A student on a low-end Android phone, often on a slow or unstable connection, reading in Urdu,
Roman Urdu, or English. Design for that device and that connection first — not for a desktop
preview.

## Principles

### 1. Mobile-first, low-end Android

- Design at a small viewport first (~360×800), not desktop-down.
- Avoid heavy animation, large images, or effects that lag on low-end hardware.
- Keep layouts single-column. No hover-dependent interactions — everything must work with a tap.
- Text must stay legible at default system font sizes; don't rely on tiny type.

### 2. The citation is the hero element

- Every grounded answer's citation (chapter, section, page) is not a footnote — it's a primary,
  visually prominent element (a chip or card), not small grey text at the bottom.
- The citation must be tappable/expandable to show the source excerpt, so the student can verify
  the answer against their own book.
- If an answer has no citation, that itself should be visually obvious (this shouldn't normally
  happen — PASS/BORDERLINE answers always cite).

### 3. Refusal is a calm, first-class state — not an error

- Refusal (REFUSE) is a normal, expected outcome of an honest system, not a failure. It must never
  use red, warning icons, or error-style UI (no exclamation triangles, no alarming tone).
- Use a neutral, calm visual treatment — similar weight to a normal answer, not a degraded one.
- Always show: a plain-language statement that the syllabus doesn't cover this, the 3 nearest
  chapters (tappable), and one reformulation hint.
- Never show a partial answer or hint at content — refusal means refusal.

### 4. Confidence is shown with icon + label, never colour alone

- Every answer shows its confidence tier (e.g. "Grounded in your syllabus" / "Partly supported")
  as an icon paired with a text label.
- Colour may reinforce the tier but must never be the only signal — this is both an accessibility
  requirement and a trust requirement (colour-blind students, low-quality screens in sunlight).

### 5. Urdu renders right-to-left, at the block level

- When the response language is Urdu, the containing block (not just the text run) gets
  `dir="rtl"`, so layout, alignment, and icon order flip correctly — not just text direction
  inside an otherwise LTR container.
- Roman Urdu and English stay `dir="ltr"`.
- Mixed-direction content (e.g. an Urdu answer citing an English chapter title) should still look
  intentional, not broken — test this case specifically.

## Visual tone

- Calm, textbook-like, trustworthy — closer to a study app than a chat app. Avoid playful/gamified
  visual language that undercuts the "we honestly don't know" moments.
- Generous whitespace and clear hierarchy over density — these are students reading, not scanning
  a dashboard.

## What NOT to do

- Don't introduce a new colour system, icon set, or component library — screens must be
  implementable with the existing Tailwind setup (see `.stitch/README.md`).
- Don't design desktop-first and shrink down.
- Don't treat refusal, low confidence, or "not configured" states as errors visually.
