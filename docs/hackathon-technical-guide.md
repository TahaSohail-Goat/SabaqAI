# Sabaq AI: technical presentation and study guide

Prepared on 11 October 2026 from this checkout's source code, package manifest, migrations, and project-status notes. This is an explanation of the implementation, not a new live-service verification. Historical test results below are attributed to the status notes; rerun the demo before presenting.

## 1. What to say about the project

“Sabaq AI helps Pakistani board students study their curriculum. Its Doubts feature retrieves passages from ingested syllabus documents, checks whether the retrieval provides enough support, generates an explanation only when that check allows it, and reconstructs citations from stored source data. Students can also read source PDFs, practise chapter quizzes, track their quiz performance, and receive a computed revision schedule.”

The central problem is exam relevance and traceability. A broadly knowledgeable model can provide an explanation beyond a student's textbook. Sabaq's grounded path adds curriculum filtering, a decision before generation, and inspectable source references.

Important qualification: the app also has general Chat. Chat uses general model knowledge and does not run the grounded retrieval gate. Do not describe every AI response in the whole app as textbook-grounded.

This is a retrieval-augmented generation (RAG) application. It is not a model trained from scratch or a fine-tuned model. Ingestion changes the searchable corpus, not the underlying model weights.

## 2. Architecture in plain language

The browser renders a React interface. Next.js serves the pages and implements the backend through API route handlers in the same application. Supabase supplies PostgreSQL, authentication, and file storage. PostgreSQL's pgvector extension stores and searches embeddings. Jina creates embeddings; Gemini creates grounded answers and quizzes. General Chat can use Gemini or a Groq-hosted model. Groq Whisper handles speech transcription.

```text
Offline / scheduled preparation
Source manifest → download PDFs → extract text / OCR → detect structure
  → clean text → chunk sections → Jina passage embeddings
  → transactional Supabase ingestion + source PDF storage

Grounded question
Browser → POST /api/ask → normalize question → Jina query embedding
  → filtered pgvector search → confidence gate
      REFUSE → return refusal; no answer-generation model call
      PASS / BORDERLINE → Gemini → citation validation → answer or refusal
  → best-effort question log → browser answer + source reader

Practice and planning
Textbook chapter → generated quiz → encrypted grading token + saved draft
  → submission → server grading → persisted quiz attempt
  → chapter mastery → computed revision plan

General Chat (separate flow)
Authenticated message + optional attachment → Gemini / Groq stream
  → persisted conversation; no textbook retrieval gate
```

There is no separate Express, FastAPI, or Python backend. The crawler is a preparation script, not a second request-serving service.

## 3. Technology inventory

These are declared dependencies and code references, not claims about current vendor pricing or availability. Manifest ranges are not exact installed versions.

| Technology | Role in this project | Why it fits this implementation |
| --- | --- | --- |
| Next.js, declared `^16.3.3` | App Router pages, API routes, route protection | UI and backend in one repository/application |
| React, declared `^19.2.8` | Interactive student interface | Reusable components and state |
| TypeScript, declared `^7.0.2` | Shared contracts and type checking | Helps routes and UI agree on shapes |
| Tailwind CSS, declared `^4.3.3` | Styling with existing theme tokens | Consistent responsive styling |
| Supabase JS + SSR clients | Database, Auth, cookie sessions, Storage access | Shared data and identity platform |
| PostgreSQL + pgvector | Relational data and embedding search | Curriculum metadata and vectors coexist |
| Jina `jina-embeddings-v3` default | 1,024-dimensional text embeddings | Shared vector space for passages and questions |
| Google Gen AI SDK | Gemini answers, quiz creation, text grading | Structured generation calls |
| Groq HTTP APIs | General Chat option and Whisper transcription | Separate configurable providers for chat/audio |
| Zod | Crawl manifest validation | Rejects malformed source configuration |
| Tesseract + Poppler system tools | OCR, text extraction, PDF rasterization | Handles scanned and text PDFs |
| `pdf-lib`, `pdfjs-dist`, `sharp` | PDF manipulation, browser rendering, image processing | Source preparation and source reading |
| Node `crypto` | SHA-256 hashes and AES-256-GCM tokens | Deduplication and hidden quiz keys |
| Nodemailer | Transactional OTP email through SMTP | App-managed verification/reset email |
| Three.js + React Three Fiber/Drei/postprocessing | Visual Explore experience | Interactive subject presentation |
| GSAP, simplex-noise | Visual animation/effects in the UI | Presentation polish, not retrieval logic |
| Lucide React | Icons | Consistent interface cues |
| `clsx`, `tailwind-merge` | Conditional class composition | Component styling utilities |
| Vercel analytics/speed packages | Instrumentation dependencies | Do not imply a currently healthy deployment from dependency presence |
| `tsx`, npm | TypeScript scripts and project commands | Ingestion/crawling and builds |
| GitHub Actions | CI and scheduled crawler workflow | Repeatable checks and content maintenance |

LangChain, Pinecone, Chroma, and a separately hosted API service are not part of this implementation. DashScope/Qwen is an embedding-client alternative, not the default provider currently shown in code.

## 4. Module-by-module explanation

### A. Authentication, onboarding, and sessions

Purpose: identify a student and establish curriculum context.

Routes under `src/app/api/auth/` cover signup, login, logout, user/profile reads, onboarding, OTP verification, password reset/change, avatar upload, and account deletion. Supabase Auth handles identity. Application tables hold the profile and subject enrolments.

`student_profiles` contains curriculum and preference data; `student_subjects` holds enrolments without repeating a subject array in the relational schema. The profile informs scope, language, and personalization.

`src/proxy.ts` validates users through Supabase `getUser()` and guards protected pages. It also implements session-activity behavior. API paths need their own checks: a page redirect guard is not API authorization. General Chat explicitly requires login; `/api/ask` can serve anonymous questions and attributes logs when a user exists.

OTP codes are stored in PostgreSQL `auth_otps`, not process-local memory. The code specifies a two-minute lifetime and a five-wrong-attempt limit. Nodemailer delivers emails when SMTP is configured. Do not claim OTPs are hashed: the current store reads a `code` column directly.

Google OAuth is part of the local recovery setup. The status records successful interactive Google login on the original recovery laptop; this teammate checkout records a redirect check, not a new interactive login test.

Presentation sentence: “Authentication establishes the student's profile; curriculum scope then follows them across the learning modules.”

### B. App shell and shared curriculum scope

Purpose: keep navigation and student context consistent.

The `(app)` route group contains dashboard, Doubts, Chat, Quiz, Syllabus, Explore, Progress, Planner, and Settings pages. Its layout and components provide the sidebar/topbar. `ScopeContext` shares curriculum choices across routed pages. Theme support and Urdu block direction belong to the UI layer.

Subject definitions live in `src/lib/subjects.ts`: Physics, Chemistry, Biology, Mathematics, English, Urdu, Computer Science, Islamiyat, and Pakistan Studies. The app's class-specific subject exclusions are encoded there. A listed subject does not prove that every chapter of its textbook is ingested.

Presentation sentence: “A shared scope keeps the interface consistent, while each retrieval request still explicitly supplies curriculum filters.”

### C. Crawler and source preparation

Purpose: turn source PDFs into structured curriculum evidence.

`scripts/crawl.ts` orchestrates modules under `src/lib/crawler/`. Zod-validated manifests live in `data/crawl-manifest/`. Fetching uses checksums to identify source changes. Extraction uses direct PDF text where suitable and OCR for scanned pages. Structure modules handle tables of contents, chapter boundaries, paper boundaries, and cross-checking. Noise filtering removes extraction clutter. PDF rebuilding creates readable source units. The ingest adapter converts these into the ingestion document shape.

Tesseract OCR runs page by page so page identity is preserved. The implementation uses 150 DPI for English and 300 DPI for Urdu. Checksum-keyed OCR caching avoids repeating expensive OCR for unchanged files. An all-blank extraction is not cached as a successful result.

The weekly GitHub workflow is configured for Monday 02:00 UTC, which is 07:00 in Pakistan. It installs Tesseract/Poppler and retains crawl state. Workflow configuration does not prove the most recent scheduled run succeeded.

Presentation sentence: “The preparation pipeline preserves curriculum structure and source pages before creating the searchable index.”

### D. Chunking and ingestion

Purpose: make long source text searchable without losing provenance.

`src/lib/ingest/chunker.ts` defines `SourceDocument`, `PreparedDocument`, and the recursive chunker. Defaults are 2,400 characters per chunk and 240 characters of overlap. These are character counts, not token counts. Splits prefer paragraphs, lines, sentences, words, then characters. Processing is section-local; chunks cannot cross chapters.

Overlap carries context into the next chunk, subject to the size bound. A SHA-256 content hash includes curriculum identity, source type, and language as well as normalized text. This allows legitimate content in different curriculum slots while supporting deduplication within a slot.

`scripts/ingest.ts` and the crawler adapter embed passages and call `ingest_document`. The database RPC writes a document transactionally: its related rows are committed together or rolled back together. This transactional property applies to ingestion; do not assume every multi-table operation elsewhere uses the same approach.

Presentation sentence: “We index citable sections rather than passing whole books to the model for each question.”

### E. Embeddings

An embedding is a list of numbers representing text for similarity search. Here each vector has 1,024 components. It is not an answer, a confidence percentage, or a model trained by our team.

`src/lib/ai/embeddings.ts` uses plain HTTP fetch with an OpenAI-compatible embedding request. The default is Jina. Passage ingestion uses `retrieval.passage`; question embedding uses `retrieval.query`. Both must use a compatible shared embedding model/vector space.

The client checks returned vector dimensions and batches up to ten inputs. Bulk ingestion can opt into retry/backoff for rate limits. A live question normally uses one embedding call; stored passages are not re-embedded for each question.

Changing embedding models requires re-embedding the corpus; changing dimension also requires aligned database declarations and configuration.

### F. Retrieval

Purpose: find evidence for this question inside this curriculum.

`retrieve()` in `src/lib/ai/retrieval.ts` normalizes text, including a small Roman Urdu dictionary, embeds the question, and calls the PostgreSQL `match_content_chunks` RPC with board, class, and subject. Optional source type and chapter filters narrow the result further.

The SQL uses cosine similarity: `score = 1 - cosine_distance`. An HNSW index is declared for vector search. HNSW is an approximate nearest-neighbor index, not an LLM or a separate vector database.

Code defaults request 20 candidates and keep up to six context chunks. Environment variables can override those defaults. The returned scores are rounded to three decimal places in the retrieval mapping before the gate receives them.

With Supabase absent, the app has a keyword-ranked development corpus. It emits a warning; these scores are not embedding similarity and must not be used as retrieval-performance evidence.

Presentation sentence: “We search semantically, but only within the requested board, class, and subject.”

Qualification: `/api/ask` supplies defaults when some fields are omitted. Do not claim it independently enforces a student's registered profile against all client-supplied scope values.

### G. Confidence gate and refusal

Purpose: decide whether generation may proceed.

`evaluateConfidence()` uses the best retrieved score and the number of supporting chunks. The current code defaults are:

| Decision | Code condition |
| --- | --- |
| PASS | Best score at least 0.55 and at least two chunks scoring at least 0.50 |
| BORDERLINE | Best score at least 0.45 when PASS did not apply |
| REFUSE | No candidates, weaker scores, or a caught scoring error |

These are configurable code defaults, not an observed accuracy result or proof of optimal calibration. The status notes say formal recalibration remains incomplete, despite comments describing an earlier adjustment against real scores.

The route branches on REFUSE before calling answer generation. It returns a calm refusal, normally HTTP 200, and genuinely nearest chapters based on the best actual score per chapter. No candidates means no nearest chapters. Retrieval/system exceptions return a refused-shaped HTTP 500 response.

“No LLM call on REFUSE” means no answer-generation call: the query embedding may already have used an external AI API. BORDERLINE still allows generation and is labeled medium confidence.

Presentation sentence: “Refusal is a deliberate result: insufficient retrieval support prevents an answer-generation call.”

### H. Grounded generation and citation inspection

Purpose: turn allowed evidence into a readable answer with traceable references.

`src/lib/ai/generation.ts` calls Gemini with the question, selected chunks, and the grounded prompt from `src/prompts/grounded-answer.ts`. The configured model comes from `CHAT_MODEL`, defaulting in this checkout to `gemini-3.5-flash-lite`. Temperature is 0.1 and JSON output is requested. Low temperature is a generation setting, not a correctness guarantee.

The model returns statements and chunk IDs. `validateCitations()` keeps only retrieved IDs, removes statements left without valid references, and rejects an empty answer or an answer losing more than half its statements. Displayed chapter, section, pages, source type, and excerpt come from retrieved database rows. The excerpt is limited to the first 400 characters.

If Gemini is unavailable or fails, generation returns an unanswerable empty result; it does not manufacture an answer from a sliced paragraph.

Citation validation proves reference membership and trusted metadata. It does not mathematically prove that every surviving sentence is entailed by its passage. A model can still cite a real chunk while making an unsupported claim. This is why semantic evaluation remains necessary.

The Doubts reader uses source selection and page navigation to make evidence inspectable. `AskDocumentReader`, `/api/ask/options`, and `/api/ask/document` support the reading experience.

Implementation qualification: the validator checks statements/references, but does not explicitly reject on `answerable === false`. Generation failures currently return empty statements and are rejected through that route. Do not claim a fully strict runtime schema validator exists for every generated field.

### I. Syllabus Explorer and PDF storage

Purpose: let the student see and read the available corpus.

`/syllabus` uses `/api/ask/options` for subjects, source types, and units. It offers a recent-document list and a continuous-scroll PDF reader with zoom/fullscreen and chapter navigation. `pdfjs-dist` renders PDFs in the browser; Supabase Storage stores file bytes. Database metadata alone does not mean a PDF is downloadable.

The local recovery fix probes PDF bytes before presenting links in recovery mode. Some scanned originals needed JPEG-based readable copies for PDF.js compatibility. Those reader fixes did not change OCR text or embeddings according to the status notes.

Presentation sentence: “Students can inspect the source collection directly instead of treating the model's response as the only view of the textbook.”

### J. Quiz generation, answer protection, and drafts

Purpose: turn chapter study into practice.

`POST /api/quiz` uses textbook content for a selected chapter. Current types include MCQ, short, and long questions. Model-generated references not in the available chunks are discarded; they are not reassigned to a convenient real chunk. Generation requests JSON and retries malformed output once. Generation batches and samples context to control prompt size.

The public question shape omits correct options, explanations, model answers, and rubrics. The browser receives `quizToken`, which seals grading data using AES-256-GCM, a random 12-byte IV, and a 16-byte authentication tag. Tokens expire after two hours. Base64url encodes the encrypted bytes for transport; encoding alone would not hide the answers.

`QUIZ_SECRET` must be consistent across instances. Without it, the implementation uses a process-specific development key, which can make cross-instance grading fail.

Generation parks a draft in `quiz_drafts` for a logged-in user. Draft APIs allow answer autosave, resume, and discard. Completed normalized quiz/attempt records are written on submission. Older comments saying generation writes nothing to the database are stale because drafts now exist. Draft persistence survives device changes, but the grading token still has its expiry.

### K. Grading and quiz history

`POST /api/quiz/grade` decrypts the token and grades server-side. MCQs compare option indices deterministically. Free-text answers use one batched Gemini call against stored model answers/rubrics and may receive partial credit. Returned points are clamped to each question's maximum.

For free-text questions, the boolean `correct` is true at half or more of possible points. The response's `score` counts questions marked correct; it is not the same as summing partial-credit points. Use the actual displayed/result contract when explaining a score.

If free-text grading is unavailable or malformed, the present implementation returns zero points with an unavailable/could-not-grade message. This is a limitation: service failure should not be mistaken for a reliable diagnosis of student knowledge.

For authenticated submissions, persistence writes quizzes, questions, options/keys/rubrics, attempts, and attempt answers. History lists completed attempts and supports replaying solved papers. Successful submission removes the associated draft on a best-effort basis.

### L. Dashboard and Progress & Mastery

Purpose: summarize observed student activity and identify chapters needing work.

`/api/dashboard/stats` counts the user's `qa_log` entries and quiz attempts and builds a 14-day activity series. `/api/dashboard/progress` uses shared `computeChapterMastery()` from `src/lib/mastery.ts`.

The mastery join follows attempts to quizzes and their chapter identity, rather than depending only on nullable chunk IDs. It filters historical attempts against the relevant board/class/subject and excludes paper-only artifacts from textbook chapter mastery.

```text
chapter accuracy = correct answered questions / answered questions
```

No answered questions means Not started. Fewer than five answered questions means Insufficient data. With enough data, below 50% is Needs work, 50% to below 80% is Getting there, and at least 80% is Strong. These are product classification rules, not claims about model accuracy. Aggregation is across eligible stored attempts, not only the latest attempt.

Mastery is a simple quiz-performance signal, not a psychometrically validated learning estimate. Repeated questions, AI grading, and limited samples affect interpretation. Some planner copy says “last attempt,” although the shared accuracy is aggregated; present the actual computation.

### M. Revision Planner

Purpose: decide what to study before the exam using observed data.

The app stores exam plan settings and computes the schedule when a plan is read. It uses the same chapter mastery as Progress. Priority is Needs work, Not started, Insufficient data, Getting there, Strong. Ties use chapter order.

Weak and unattempted chapters receive study/quiz/follow-up sessions; strong chapters get light review. Round-robin ordering separates repeated chapter sessions, and a deterministic formula distributes sessions across available days. An optional buffer day applies when enough days remain. Expired plans and chapters that cannot fit because no days remain are represented explicitly.

No LLM generates the plan. New submitted attempts can change the next computed schedule. Plan-related attempts are associated by curriculum scope, chapter range, and submission time since plan creation, not a stored attempt-to-plan foreign key.

Presentation sentence: “The schedule is computed from quiz evidence and the exam date, so its priorities can be explained.”

### N. General Chat, voice, and read-aloud

`POST /api/chat` accepts authenticated messages and optional JPEG/PNG/WEBP/PDF attachments up to 10 MB for attachment-capable models. Conversation history is read from the database under ownership checks. Replies stream as text; conversation/messages are persisted. Interrupted replies can preserve text produced before the stop.

The model allowlist in `src/lib/chat/models.ts` includes Gemini Flash Lite, a Groq-hosted GPT-OSS option, and a heavier Gemini option. These are identifiers configured in this code; this review did not test their current provider availability or latency.

`/api/chat/transcribe` and `src/lib/ai/transcription.ts` implement Groq `whisper-large-v3` speech-to-text. Browser Web Speech handles read-aloud. Recognition and available speaking voices depend on provider/browser configuration. Existence in code is not a new live Urdu transcription test.

Do not conflate Chat voice support with a fully tested voice workflow in grounded Doubts. Chat's personalized prompt is not curriculum retrieval, and its responses have no equivalent stored-row citation guarantee.

### O. Explore and Settings

Explore presents subjects visually using Three.js-related components. `/api/explore/overview` summarizes actual source availability per subject in a board/class scope. Its visual layer is a navigation experience, not another reasoning engine.

Settings includes profile/preferences/theme/session controls and account-related API routes. Some older status rows still describe password/deletion as missing even though route files now exist. Test those flows before claiming successful email delivery or account deletion.

## 5. Database explanation for judges

The schema is normalized: metadata is factored into related tables rather than copied into every chunk or packed into repeated arrays.

```text
users → student_profiles + student_subjects
chapters → chapter_sources → sections → content_chunks (text + vector)
qa_log → qa_log_chunks (retrieved/cited evidence)
quizzes → quiz_questions → quiz_options / quiz_answer_keys / quiz_answer_rubrics
quizzes → quiz_attempts → quiz_attempt_answers
users → quiz_drafts / exam_plans / chat_conversations → chat_messages
auth_otps → app-managed email verification/reset/deletion flows
```

`content_chunks_expanded` is a view joining provenance metadata for application reads. The vector search and ingestion functions are exposed through PostgREST RPC calls.

Row-level security controls client access. The service-role client is server-only and can bypass RLS, so server code must still enforce ownership and curriculum scope. Quiz answer-key/rubric tables do not expose client read policies. Function permissions must revoke PUBLIC execution where service-role-only behavior is intended; migration 0018 addresses a later RPC-signature grant regression. Functions using pgvector pin the required `public, extensions` search path.

SHA-256 content hashes are for identity/deduplication. AES-GCM is for quiz confidentiality/integrity. Authentication tokens identify sessions. They serve different purposes; do not call all three “encryption.”

## 6. What evidence exists, and what remains uncertain

The latest 9 October recovery notes report a separate local Supabase stack at `127.0.0.1:54321`, containing 8,594 embedded chunks, 494 chapters, and 8,491 sections. They report 498 source records with actual PDF bytes and smoke tests for an on-syllabus answer with stored-row citations, an off-syllabus refusal, login, generated quiz, grading, and history. These are recorded snapshot counts and tests, not current counts freshly queried for this guide or accuracy metrics.

The recovered app points at the local stack. Do not describe that as a currently tested hosted production deployment. Restored avatar bytes are missing according to the notes. Browser testing on this teammate checkout and conference-phone testing remain unconfirmed.

Older module/status sections conflict with newer code in several places. Treat source as the evidence for implementation, and dated test notes as evidence for what was actually exercised. This guide does not silently convert “implemented” into “tested live.”

The evaluation route, CLI script, and old near-miss question-set directory are absent in this checkout. `package.json` has no `eval` command. Progress metrics are student-performance metrics, not replacement measurements of retrieval safety. No current formal near-miss/refusal-accuracy result should be claimed. The historically recorded Drude-model question is a useful challenging test because topical similarity can be high while the requested explanation is beyond the curriculum.

## 7. Strengths, limitations, and next engineering work

Defensible strengths: mandatory retrieval scope on the vector-search path; a pre-generation refusal branch; citations rebuilt from stored rows; no fabricated answer fallback when generation is unavailable; encrypted quiz answers; persistent practice; explainable mastery and revision planning.

Material limits: general Chat has a different trust boundary; valid citation IDs do not prove semantic correctness; similarity thresholds need formal evaluation; OCR quality influences both search and citations; model-generated quiz questions/rubrics and text grading can be wrong; token expiry limits draft grading; runtime request/output validation is not uniformly strict; provider outages and quota limits affect availability.

Potential improvements to discuss as future work, not delivered features:

1. Restore a labelled live-retrieval evaluation harness, including near-miss questions, multilingual cases, and failure-path assertions.
2. Validate request scope and structured model output more strictly; test `answerable: false`, malformed citations, non-finite scores, and bad configuration.
3. Test semantic support of answer statements, not only citation membership.
4. Represent unavailable free-text grading separately from wrong answers so outages do not distort mastery.
5. Review API authorization/rate limits, quiz replay/user binding, and multi-table persistence behavior for production use.
6. Test the complete mobile demo, PDF rendering, Urdu input/output, auth mail, and provider availability in the actual environment.
7. Expand corpus/board coverage through verified ingestion, rather than merely adding dropdown entries.

## 8. A suggested 10-slide presentation

| Slide | Main message | Evidence/demo |
| --- | --- | --- |
| 1 | Sabaq AI: curriculum-focused study support | One-sentence pitch and target student |
| 2 | Students need relevant, inspectable explanations | Example of an advanced but off-syllabus question |
| 3 | The study loop connects reading, asking, practice, and revision | Actual module navigation |
| 4 | One Next.js app with Supabase and AI providers | Architecture diagram above |
| 5 | PDFs become structured citable chunks | Manifest, OCR, chunker, database hierarchy |
| 6 | Retrieval decides before answer generation | Scope filters and PASS/BORDERLINE/REFUSE |
| 7 | Citation metadata is reconstructed from source rows | Live answer plus PDF/source inspector |
| 8 | Quiz answers stay hidden until submission | Public question shape and AES-GCM token |
| 9 | Practice data drives mastery and computed plans | Saved attempt → Progress → Planner |
| 10 | Current evidence, limitations, and next steps | Dated test notes; no invented accuracy number |

If Chat is demonstrated, explicitly introduce it as the general assistant alongside the grounded feature. Mention voice/attachments there.

## 9. Demo sequence and narration

1. Log in and show board/class/profile context. Say: “This student context selects the curriculum we work within.”
2. Open Syllabus and a real PDF. Say: “These are the available sources, and you can read them directly.”
3. Ask a question covered by the selected chapter, such as an appropriate Ohm's-law question if that chapter is available. Say: “The backend retrieves matching passages before deciding whether generation is permitted.”
4. Open a returned citation. Verify its chapter/page/excerpt against the source before presenting. Say: “The reference is built from stored source metadata.”
5. Ask a clearly unrelated question in the same scope. Say: “This retrieval decision refuses, so this path skips answer generation.” Do not promise every off-syllabus question will refuse.
6. Generate a short quiz, answer, and submit. Show feedback and history. Say: “Answers are hidden before submission and grading runs on the server.”
7. Show Progress and Planner. Say: “Observed quiz results drive chapter bands and the computed schedule.” Use an account with enough real answers if demonstrating bands.
8. Optionally show Chat voice/attachments. Say: “This is our separate general study assistant; it does not use the textbook citation gate.”

Rehearse using the same laptop, database, account, network, providers, and browser intended for the event. Do not force a prepared answer into the UI when a provider fails; explain the failure behavior honestly.

## 10. Judge questions and defensible answers

**How is this different from a general chatbot?**
The grounded Doubts path filters curriculum evidence, gates generation using retrieval scores, and displays references reconstructed from source rows. The app also connects reading and questions with practice, progress, and a computed revision plan.

**Did you train your own AI?**
No. We use pretrained embedding and generation providers. Our engineering is the source pipeline, filtered retrieval, refusal/citation controls, and learning workflow.

**Why RAG instead of fine-tuning?**
This implementation needs source passages and page metadata at answer time. Retrieval makes that evidence available and lets corpus updates change what is searchable without changing model weights.

**Can you guarantee hallucinations never happen?**
No. The pre-generation gate and citation checks reduce particular failure modes, but a valid source reference alone does not prove every claim. We need broader semantic and near-miss evaluation.

**Is 0.55 a confidence of 55%?**
No. It is a similarity threshold in the current code defaults. It is not a probability of correctness or a reported accuracy measurement.

**What happens without a Gemini key or during rate limits?**
Grounded generation returns an unanswerable result and the route withholds the answer. It does not fabricate a cited paragraph fallback. Other features have their own failure behavior; free-text grading currently needs improvement in how it represents service outages.

**Why PostgreSQL rather than a separate vector database?**
The implementation keeps relational curriculum/provenance data and vector search in one store using pgvector, avoiding another backend service in this app.

**Can a student inspect the answers in DevTools before submitting?**
The public quiz response excludes the grading key and carries an encrypted token. AES-GCM protects the payload; base64 alone would not. This addresses answer exposure, not every possible assessment-abuse scenario.

**Are quiz grades all deterministic?**
MCQ matching is deterministic. Short/long grading uses Gemini against generated model answers and rubrics, so it has uncertainty and can award partial credit.

**What does mastery mean?**
It is chapter accuracy across eligible answered quiz questions, with at least five required before assigning a strength band. It is a practical indicator, not a claim of comprehensive subject mastery.

**How is the revision plan personalized?**
It orders chapters by observed mastery and distributes study/practice/review sessions before the exam. The rules are deterministic and shared with Progress.

**Does it support all boards/classes/subjects?**
The app currently offers FBISE and has a class/subject catalog plus an ingested source collection. Coverage varies by source and curriculum slot. Check the live options/corpus before promising a specific textbook.

**Does voice preserve textbook grounding?**
Voice transcription exists in general Chat in this checkout. Grounding depends on which backend route receives a question; converting speech to text alone does not ground the answer.

**What is your measured accuracy?**
We should only report a result from a current labelled evaluation against live retrieval. The old evaluator is absent, and this review does not produce a new accuracy figure. Successful smoke tests are examples of functioning paths, not a population accuracy estimate.

## 11. Code-reading order and operational commands

For understanding, read in this order:

1. `docs/project-status.md`, especially the newest dated recovery notes.
2. `src/lib/types.ts` and `src/lib/subjects.ts` for the shared vocabulary.
3. `src/app/api/ask/route.ts` for the complete grounded request.
4. `src/lib/ai/retrieval.ts`, `embeddings.ts`, `guardrail.ts`, `generation.ts`, and `citation.ts`.
5. `src/prompts/grounded-answer.ts` for the instructions sent to the answer model.
6. `src/lib/ingest/chunker.ts`, `scripts/crawl.ts`, and the crawler modules for source preparation.
7. `supabase/migrations/` for schema, indexes, RLS, RPCs, drafts, chat, and plans.
8. Quiz route, token module, grading route, persistence, and history.
9. `src/lib/mastery.ts` and dashboard/plan routes.
10. Chat route, chat prompt/model allowlist, transcription, and settings/auth flows.

Project commands currently declared:

```bash
npm install
npm run dev
npm run lint
npm run build
npm run start
npm run ingest -- --dry-run
npm run ingest
npm run crawl:dry
npm run crawl
```

`lint` is `tsc --noEmit`: type checking, not ESLint. Build checks production compilation; neither replaces functional API/browser tests. Ingestion and normal crawling can call paid APIs/write data, so dry runs are useful preparation. The crawler dry run can still download and parse sources. `npm run eval` from older instructions is not a current script.

Configuration concepts: Supabase URL/public anon key for client integration; service-role key for privileged server operations; embedding key/model/dimension; Gemini/Groq keys; stable quiz secret; SMTP credentials. Never put server-only keys in `NEXT_PUBLIC_` variables or show `.env` contents during the presentation.

For a module-by-module rehearsal, use each section above in this order: student problem → module input → processing → output → link to the next module → one limitation. This explains why the code exists instead of reciting filenames.
