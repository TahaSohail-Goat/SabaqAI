# Sabaq AI — Product Brief (MVP)

## The problem
Pakistani board exams are marked against a specific textbook. General AI chatbots answer from a
global corpus — often right in general, wrong for the exam, and sometimes confidently invented.
Students can't tell a correct-for-exam answer from a plausible one, and get no diagnosis of what
they're weak on.

## The solution
A tutor that answers only from ingested syllabus content, cites the page, and refuses when the
syllabus doesn't cover the question — plus quizzes and an evaluation set that proves it works.

## Who it's for
A Class 10 student on a low-end Android, often typing Roman Urdu, weeks from board exams.

## MVP scope
- **One board (PCTB), one class (10), one subject (Physics)** — fully ingested, not spread thin.
- Grounded Ask with citations.
- Confidence gate + refusal.
- Chapter quiz (cuttable).
- Evaluation set with real metrics.
- Urdu voice input (speech-to-text) — accessibility, and it demos memorably.

## Explicit non-goals for this week
Revision planner, parent/teacher dashboard, weekly progress reports, multiple boards, payments,
notifications. The architecture allows them later; the week does not. These are cut deliberately —
see the cut list in `docs/build-plan.md`.

## Team
Four people, seven days. Ownership split and the day-by-day plan are in `docs/build-plan.md`.
What is actually built versus still stubbed is tracked in `docs/project-status.md`.

## What makes it different
The refusal path is a real, tested, measured feature — not a disclaimer. Most "AI tutor" demos
bluff when they don't know. This one declines and shows you the nearest chapters.

## Success = you can show a judge
1. A grounded answer with a page citation they can verify.
2. An off-syllabus question being refused (and it's faster, because nothing was generated).
3. A metrics table: how often it retrieves the right chapter, and how often it correctly refuses.

## The one risk to handle on Day 1
**Licensing.** Don't publicly demo a textbook corpus you don't have rights to. Start with past
papers or openly available material if the textbook licence isn't cleared. Be ready to answer
this from a judge in one sentence.
