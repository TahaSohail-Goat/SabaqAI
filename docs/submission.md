# Submission — Bano Qabil AI Hackathon 2026

Category: **Education**. Everything a judge or organiser reads about the project lives here.

---

## Submission brief

> **Sabaq AI — Urdu RAG Board Tutor**
>
> Sabaq AI is a syllabus-grounded study companion for Pakistani board students that answers
> questions strictly from the actual textbook and past-paper content — in Urdu, Roman Urdu, or
> English — and always cites the exact chapter and page it drew from, so it never invents an answer
> outside the syllabus. When retrieval confidence falls below a calibrated threshold, the system
> declines to answer and shows the nearest chapters it does cover, without ever calling the
> language model. Beyond grounded Q&A it generates chapter practice quizzes tied back to source
> chunks, and ships with a hand-labelled evaluation set that measures retrieval accuracy and
> refusal quality rather than asserting them. Built as a single Next.js application with Supabase
> (Postgres + pgvector) for grounded retrieval and auth, Qwen via Alibaba Cloud DashScope for
> embeddings, and Gemini for grounded generation. Sabaq AI targets the educational-equity gap
> between students who can afford private tuition and those who can't — giving every board student
> free, accurate, always-available exam preparation in their own language.

---

## Problem

Pakistani board exams are marked against one specific textbook. General AI chatbots answer from a
global corpus — often right in general, wrong for the exam, and sometimes confidently invented. A
student cannot tell a correct-for-exam answer from a merely plausible one, and gets no signal about
what they're weak on. Access to tuition that would catch these errors tracks income and geography.

## Why existing options fail

- **General chatbots** are ungrounded, cite nothing, and are English-biased by default. They answer
  confidently regardless of which curriculum the student is actually sitting.
- **Paid tuition apps** carry subscription cost and English-medium bias.
- **Static PDF and guide-book apps** offer no interactivity and no way to ask a question.

None of them will tell a student *"I don't cover that."*

## The innovation

Confidence-gated retrieval over a real board-textbook corpus. Answers cite the exact chapter and
page. Below a calibrated similarity threshold, **the generation call is blocked entirely** — the
system says the topic isn't in the syllabus and shows the nearest chapters instead of guessing.

The refusal path is a tested, measured feature, not a disclaimer in the footer.

## Where AI is used

- **Embeddings + vector search** (Qwen `text-embedding-v3` via Alibaba Cloud DashScope, stored in
  Supabase pgvector) over the textbook corpus, filtered by board, class, and subject.
- **A confidence-threshold guardrail** that blocks generation when retrieval similarity is too low.
  This is rule-based, not model-based — it cannot be talked out of refusing.
- **Grounded generation** (Gemini) constrained to retrieved chunks, required to return chunk-ID
  citations that are validated server-side against the retrieved set.
- **Quiz generation** from chapter chunks, with each question tied to its source chunk.
- **Speech-to-text** (Whisper via Groq) for Urdu voice input, for accessibility.

## Architecture

A single Next.js application. API routes are the backend; there is no separate service.

```
question
  → normalise (Roman Urdu → Urdu script)
  → embed  (Qwen / DashScope)
  → vector search, filtered by board + class + subject  (Supabase pgvector)
  → score
  → GUARDRAIL ── REFUSE → refusal + nearest chapters   [LLM never called]
             └── PASS / BORDERLINE
                   → prompt built from retrieved chunks only
                   → LLM (Gemini) returns JSON with chunk-ID citations
                   → validate citations against the retrieved set
                   → answer + citation
```

Full detail in `docs/rag-architecture.md`; the gate itself in `docs/confidence-guardrails.md`.

**On the single-app choice:** one deploy target, one auth context, no CORS, no cross-service
debugging. Retrieval, guardrail, and generation stay cleanly separated in `src/lib/ai/`, so the
architecture is modular without paying the operational cost of microservices during a seven-day
build.

**On sponsor technology:** Alibaba Cloud DashScope provides the embedding model the entire
retrieval layer runs on. It is load-bearing infrastructure, not a decorative API call.

## Scope

**One board (PCTB), one class (10), one subject (Physics)** — fully ingested and polished.

The board/class/subject selector is fully built and the schema is curriculum-agnostic, so the
product supports more; only the demo path needs to be complete. This was a deliberate depth-over-
breadth decision, and it is the honest answer if asked about coverage.

## Evaluation

A hand-labelled question set, scored through live retrieval and the live guardrail. Reports
retrieval accuracy, off-syllabus refusal rate, false acceptance, and false refusal. See
`docs/evaluation.md`.

The question set is labelled by hand against the actual textbook — not generated by an AI, which
would only measure whether two models agree.

---

## Expected judge questions

**"How do you know it won't hallucinate?"**
We don't rely on the model's judgment. A similarity threshold, calibrated against a labelled test
set, blocks the generation call entirely below a confidence level. You saw it live — it said the
question wasn't in the syllabus rather than guessing. Our measured off-syllabus false-acceptance
rate is *X*%.

**"Why only one board and class in the demo?"**
The architecture is board, class, and subject agnostic — the selector already supports all of them,
and the filter is applied on every query. What you're seeing is one fully-ingested path, so we
could make the core pipeline genuinely solid rather than spread thin across four half-loaded
syllabi. Adding boards is a data-loading exercise, not a rebuild.

**"What's actually different from just using ChatGPT?"**
ChatGPT will confidently answer outside the real syllabus and won't cite a specific page. We ground
every answer in the actual textbook, cite the page so the student can verify it in their own book,
refuse when confidence is low, and we measured how often each of those works.

**"How did you use the sponsor's technology?"**
Alibaba Cloud DashScope provides Qwen `text-embedding-v3`, which is the embedding model our entire
retrieval layer runs on. Every question and every textbook chunk is embedded through it. It's
infrastructure, not a token integration.

**"What's your business model?"**
Freemium for individual students, with revenue from B2B licensing to schools, tuition academies,
and NGO networks. Longer term, a provincial education-department partnership for free at-scale
distribution.

**"What about data privacy for minors?"**
We collect board, class, subject, and quiz performance — nothing sensitive. Row-level security is
enabled so a student's records are only readable by that student. A formal privacy policy and
parental-consent flow is on the pre-launch roadmap; it isn't something a hackathon MVP needs, but
it also isn't something we're pretending doesn't exist.

**"Where did the textbook content come from, and do you have the rights?"**
*Answer this honestly, in one sentence, and agree the wording as a team before the pitch.* If the
licence isn't cleared, say the corpus is past papers and openly available material, and that a
licensing conversation is a prerequisite for public launch. Do not bluff — you are pitching a
product whose whole premise is not bluffing.

**"Why Supabase instead of building your own backend and auth?"**
Speed, given the timeline. Supabase gives us Postgres with pgvector plus auth out of the box. It's
standard Postgres underneath, so there's no meaningful lock-in if we outgrow it.

**"What doesn't work yet?"**
Have a real answer ready. `docs/project-status.md` tracks it. Naming a limitation before a judge
finds it is worth more than a claim they can puncture.

---

## Roadmap

- **0–3 months** — finish ingesting remaining chapters and a second subject; pilot with a school or
  tuition centre.
- **3–6 months** — additional boards and classes, expanded voice support, streaks and retention.
- **6–12 months** — B2B licensing to schools and academies alongside a free consumer tier.
- **12+ months** — provincial education-department partnership; anonymised aggregate weak-topic
  trends as an education-policy product.

## Team

Four members. Ownership split in `docs/build-plan.md` — retrieval and guardrail, student UI and
voice, ingestion and content, and evaluation/deployment/pitch. Each member should be able to name
what they built in one sentence.
