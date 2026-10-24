# Sabaq AI — finals presentation fact check

> Historical snapshot: this report describes the commit/date stated below. It predates the latest `triage-branch` update (`6a85545`) and has not been re-audited against that update. In particular, older planned/unimplemented Concept Lab or Quiz statements do not supersede the current code and `docs/project-status.md`.

Checked 24 October 2026, Asia/Karachi, against current working tree at commit `89c801c`, existing reports/recordings, sanitized local configuration and read-only local database evidence. Existing uncommitted work is not treated as deployed. **AI Concept Lab is PLANNED and has not been implemented. It is excluded from current features and completed-feature counts.** Do not turn this document into a claim that every module is demo-ready.

## Evidence labels and scope

- **Code:** implementation was inspected; this alone does not prove runtime success.
- **Fresh offline test:** executed for this fact check, using controlled fixtures/mocks and no paid inference.
- **Fresh local observation:** read-only inspection of the running local stack/configuration; not hosted-production evidence.
- **Historical test:** an existing dated report/recording; conditions and failures matter.
- **Unverified:** evidence was not found or the check was not performed. It does not mean the feature is necessarily broken.
- **Planned:** proposal, not implemented, tested or ready to demonstrate.

Fresh verification: `npm run lint -- --incremental false` passed; `npm run test:ask` passed **179 tests**, zero failures/skips; `npm run test:notifications` passed **16 tests**, zero failures/skips. These are automated contract/control-flow tests, **not accuracy or learning-gain measurements**. No build was rerun for this documentation-only task. No application/configuration/branch/database changes, new inference, login, account creation or notifications sync were performed. Tests use isolated fixtures; no current student records were modified. Only this report is added.

The existing local Supabase containers are still running: db/auth/kong/storage healthy; rest running without a Docker healthcheck. No Next app listener was found on ports 3000 or 3100. There is therefore **no newly verified browser demo** from this fact check. Historical localhost availability statements do not establish present app availability.

## 1. Current features

| Module | Actual behavior found | Honest status | Evidence and references |
| --- | --- | --- | --- |
| **Doubts** | Corrects/interprets a question, clarifies ambiguity, searches a selected curriculum/source/chapter, generates structured teaching, reconstructs citations and reviews support plus adequacy. Can refuse, return partial support, or report an operational failure; narrowly supports sources-only browsing after both providers fail. | **Implemented; bounded live-provider successes and failures recorded. Broad accuracy/browser readiness unverified.** | `/api/ask/route.ts`; `src/lib/ask/{service,orchestrator,evidence,validation,provider}.ts`; `src/components/app/AskResultView.tsx`; `src/app/(app)/doubts/page.tsx`. Fresh offline suite; historical real-corpus HTTP/service probes; see sections below. |
| **Quiz** | Chapter-scoped textbook MCQs and short/long questions; content-sized generation, encrypted grading token, drafts, server grading, partial-credit text marking, submitted history and attempt summaries. Additional cited explanation review exists as a backend endpoint. | **Implemented core; explanation integration is backend-only in inspected UI. Scientific answer-key validation is partial.** | `/api/quiz/route.ts`, `/grade/route.ts`, `/history/`, `/drafts/`; `src/lib/quiz/{answer-key,persist,feedback,explain}.ts`. Fresh suite tests review/transport contracts, not full new live Quiz generation/grading. Existing reports record synthetic review and database fixture tests. No fresh browser submission. |
| **Chat** | Login-required streaming open study chat with model choice, conversation history/deletion, current-turn image/PDF input on Gemini, editable voice transcription and browser speech playback. | **Implemented in code; current attachments/voice/browser quality unverified.** | `/api/chat/route.ts`, `/transcribe/route.ts`, `/conversations/`; `src/lib/ai/{chat-generation,transcription}.ts`; `src/lib/chat/{models,persist}.ts`; `src/prompts/chat.ts`; `ChatMessage.tsx`, chat page. Not the textbook-grounded Doubts pipeline. |
| **Dashboard / Progress** | Counts owned question logs and quiz attempts; displays a 14-day activity series and per-chapter quiz-derived bands. Shows empty-state UI when data is absent. | **Implemented; current end-to-end rendering and educational validity unverified.** | `/api/dashboard/{stats,progress}/route.ts`; `src/lib/mastery.ts` (`computeChapterMastery`, `bandFor`); dashboard/progress pages and chart components. Counts are operational/test activity, not verified student adoption. API error paths can yield zeros; a zero is not always proof of no activity. |
| **Notifications** | Shared bell, inbox, read/unread, archive/restore, deletion/tombstones, bulk actions, filters, category/pop-up preferences. Events derived from saved plans/completed quizzes; in-app delivery while open, not email/push. | **Implemented and fixture-tested, but blocked on the present local database.** | `src/lib/notifications/{server,rules,popups}.ts`, `/api/notifications/`, `NotificationContext`, `NotificationBell`, `NotificationToasts`, notifications page. Fresh 16 offline tests pass. Historical SQL/E2E reports exist, but current live `notifications` and `notification_preferences` tables are absent. No migration was applied here. |
| **Syllabus / Explore** | Browses actual source records and OCR; opens chapter PDFs. Syllabus has subject/source/unit lists and scrolling PDF reader. Explore is an interactive 3D book browser with non-WebGL/reduced-motion paths. | **Implemented; local source-reader and Physics PDF bytes verified, browser gestures/citation clicks unverified.** | `/api/ask/{options,document}`, `/api/explore/overview`; syllabus/explore pages; `SyllabusPdfReader`, `AskDocumentReader`, `src/components/explore/`. Prior live refresh loaded all eight Physics sources through the real adapter and validated their eight PDFs. Explore's orbital artwork is not a physics lab. |
| **Plan** | Saves subject/chapter-range/exam-date settings, deterministically generates study/quiz/review sessions from current mastery bands, reserves an optional buffer day, reports skipped work, links to Quiz and lists subsequent in-scope attempts. | **Implemented in code; fresh planner/browser acceptance unverified.** | `/api/dashboard/plan/route.ts`, `/api/dashboard/plan/[id]/route.ts` (`sessionsForChapter`, priority tiers); `src/app/(app)/dashboard/plan/page.tsx`; `src/lib/mastery.ts`. Not an LLM-generated plan. Calendar logic uses process-local dates; do not promise timezone-independent scheduling from inspection alone. |
| **Practice** | “Practice quiz” actions link to the existing Quiz flow, including planner deep links. No separate Practice module/route or independent adaptive practice engine was found. | **Standalone Practice: not implemented / future scope. Quiz practice: current Quiz capability.** | Quiz page deep-link handling, planner UI; no `src/app/.../practice` route. `QUIZ_HANDOFF.md` explicitly excludes Practice implementation. Do not count it again as a separate completed feature. |

Mastery means `correct / answered` over recorded answers in the current board/class/subject, with at least five answers before a band. Bands use configured code thresholds, not a validated diagnostic model. Written-answer `is_correct` is based on reaching half the marks; this is not the same as the points-based attempt percentage. Current `mastery.ts` does not explicitly exclude every unavailable-grading record, so failed text grading can distort later aggregates. Do not call this psychometrically validated mastery or proven personalization.

## 2. Doubts: actual pipeline and fallback

### Textbook/crawler foundation

The corpus is produced by a maintainer-run crawler/ingestion pipeline, **not a live web search for each student question**. `scripts/crawl.ts`, `src/lib/crawler/fetch.ts` and manifests in `data/crawl-manifest/` select/download PDFs with URL fallback, cached bytes and SHA-256 checks. `pdf-tools.ts` uses Poppler for extraction/rasterization; `ocr.ts` performs page-tracked **Tesseract** OCR with checksum-keyed cache (English 150 DPI, Urdu 300 DPI in current code). Structure/ToC heuristics and cross-checking build chapter sources/sections; `structure/vision-verify.ts` can ask Gemini about disputed boundaries, default `gemini-2.5-pro`. That optional escalation is not evidence that every chapter boundary was correctly checked.

`src/lib/ingest/chunker.ts` and the crawler adapter prepare rows; `src/lib/ai/embeddings.ts` embeds passages/query text through an OpenAI-compatible embeddings endpoint. Current local configuration is **Jina AI `jina-embeddings-v3`, 1024 dimensions**, endpoint `https://api.jina.ai/v1`. Existing stored vectors were restored, not re-embedded in the audits. Current pgvector lives in the local database's `public` schema. The weekly GitHub workflow defines scheduled crawling with Tesseract/Poppler and cached crawl state; code presence does not prove a recent successful scheduled run.

OCR is imperfect. The live Physics inspection confirmed actual source spillovers: Unit 4 opening in source 3; Unit 5 opening/elasticity in source 4; Unit 7 opening/density in source 6; Unit 9 inside source 8. Some chunks cross unit boundaries. A server-rebuilt citation may faithfully reproduce an incorrect stored chapter label. No “perfect OCR,” full textbook completeness or exact semantic chapter coverage claim is supported. See [PHYSICS_LAB_FEASIBILITY.md](PHYSICS_LAB_FEASIBILITY.md).

### From student question to answer

1. `POST /api/ask` validates bounded input and scope. Signed-in requests must match the actual profile's board/class/enrolled subject; anonymous Doubts access remains possible. Source UUID, source type and chapter are verified server-side. Current UI sends the actual source UUID; source-less legacy input requires an unambiguous source. These are curriculum restrictions, not browsing the open internet.
2. `question-understanding.ts`, `preservation.ts`, `clarification.ts` correct/interpret input and extract intent/concepts. Original input remains separate from normalized/retrieval text. Quantity/unit, scientific-token, polarity and other preservation checks can require clarification. Signed clarification state binds owner/scope/language/options/expiry. Language breadth is not established by one typo example or fixtures.
3. `liveAskRetrieval.seeds()` in `evidence.ts` embeds the **complete corrected/confirmed question once**, and calls `search_ask_hybrid`. PostgreSQL English full-text/concept hints combine with pgvector candidates using rank fusion. **Fusion rank is not confidence**: the gate uses original cosine similarity. English full-text search is not proof of equivalent Urdu lexical search quality. Active Doubts requires live retrieval and does not silently switch to the ten-row keyword demo corpus.
4. Hydrate actual stored rows, retain independent scored seeds, add bounded same-source/same-section neighboring conditions, and constrain context/tokens. Context neighbors have null similarity and do not manufacture support scores. Board/class/subject/type/chapter/source filters remain intact.
5. On uncertain candidates, a bounded **pre-gate** semantic sufficiency assessment may use exact excerpts. Sufficient or useful partial support can authorize only BORDERLINE. `evaluateConfidence()` is the final gate and fails closed. **No additional model call occurs after final REFUSE.** Do not say “a refused request never calls AI”: question understanding or evidence assessment may already have happened before that final decision.
6. Teaching uses the retained evidence only. Structural, language, quantity/origin and citation checks follow. `validateCitations()` rejects foreign chunk IDs; the active teaching validator rejects invalid explanations rather than attaching a real citation to invented content. Displayed chapter/page/section/excerpt comes from stored rows. Citation validity proves provenance identity, not scientific truth.
7. Independent model review checks statement grounding, coherence and **adequacy**: does it answer the requested how/why/multipart task with supported reasoning/examples? Partial gaps remain explicit. A bounded evidence-backed repair needs a fresh review and remaining call/deadline budget. Model review remains fallible. Deterministic worked-calculation checking currently supports only three Ohm-law forms (`V=I*R`, `R=V/I`, `I=V/R`), not arbitrary science mathematics.

References: `src/lib/ask/{contracts,orchestrator,evidence,sufficiency,validation,config}.ts`, `src/lib/ai/{guardrail,citation}.ts`, `src/prompts/{question-understanding,grounded-answer,ask-support-review}.ts`.

### Exact configured fallback behavior

`createAskProvider()` in `src/lib/ask/provider.ts` starts with **Google Gemini**, configured locally as `gemini-3.5-flash-lite`. If Gemini is unavailable and only the Groq key is configured, it can start directly on Groq. With both configured, connection/transient HTTP 502/503/504 failures and Gemini HTTP 429 can switch the next permitted attempt to **Groq-hosted `openai/gpt-oss-120b`**. The orchestrator shares **one retry allowance across the entire request**, including token-count failures; a switch consumes that allowance and failed generation attempts consume the original call budget. Subsequent stages remain on Groq; no automatic switch back to Gemini exists. This is not an unlimited two-provider retry loop.

Auth/schema/malformed-output/grounding/adequacy failures do not select a new provider. Groq rate limiting or invalid output can still fail the request. Groq uses an estimated planning token count, then requires actual reported prompt usage within budget; Gemini uses its count endpoint. Neither is evidence of a successful live fallback answer: the recorded Groq probes ended in rate limiting or rejected review output.

**Sources-only (“citation-only”) behavior:** `runAskService()` can catch `unavailable` only after **both providers actually failed in that request**, with an explicit source UUID/chapter, time remaining and suitable evidence. It reuses seeds or searches the unchanged original question once, then exposes at most three stored OCR excerpts with source/page controls. It generates **no answer, summary or explanation**, and does not claim the passages answer the question. This can still require a Jina query embedding. Missing database/embedding/evidence cannot fabricate sources. Final refusals, invalid output, cancelled/timed-out requests, clarification and Quiz review do not become sources-only success.

**Insufficient evidence:** a normal academic refusal/partial boundary, usually HTTP 200, not proof of provider failure. **Provider/configuration/timeout failure:** a typed operational error, or the narrowly qualified sources-only result above, not a claim the textbook lacks the topic. “Nearest chapters” must come from actual scores, never a fixed presentation list.

## 3. Quiz: verification and limits

- **Filtering:** `fetchChunksFromDb()` reads `content_chunks_expanded` with board, class, subject, chapter and `source_type='textbook'`; papers are excluded. Topic/subtopic generation is not the current scope. The Quiz route accepts requested curriculum fields and does **not** reproduce Doubts' strict profile/enrollment/source-UUID authorization. Its no-Supabase development corpus fallback filters fewer fields. Do not call all modules identically source-isolated or equally hardened.
- **Generation:** Gemini only in `/api/quiz/route.ts`, using `CHAT_MODEL`; chapter profile targets MCQ/short/long questions but scales down for thin content. Bounded shuffled text samples and recent stems reduce repetition. Parallel batches have one retry each; there is no shared Doubts gate or automatic Groq fallback for this generation path. Drafts may be parked; normalized submitted-quiz/attempt rows are created on submission, not as completed activity at generation time. `resolveChapterId` can upsert shared chapter metadata; “generation performs no database writes whatsoever” would be false.
- **Question/key validation:** `validateMcq()` and `validateText()` discard unknown batch chunk IDs and rebuild source metadata. MCQ validation checks a stem, options array and numeric `correctIndex`, but does **not** fully establish integer/in-range index, exactly four nonempty options or independent scientific correctness of the chosen answer. Text validation requires a model answer but does not independently certify the rubric's correctness. A valid chunk ID is not a validated answer key. This is a presentation limitation, not repaired here.
- **Answer protection:** `respondWithQuiz()` removes `correctIndex`, `explanation`, `modelAnswer`, `rubric` from public question objects. `sealQuizToken()` uses **server-side AES-256-GCM**, random 12-byte IV and 16-byte authentication tag; a server-secret-derived 256-bit key protects confidentiality and integrity. The opaque token travels to the browser; it expires after two hours. SHA-256 derives the AES key from the configured secret; it is **not browser hashing to conceal answers**. A configured `QUIZ_SECRET` exists locally (value not exposed); absent configuration uses a process-random key that is unsafe for reliable multi-instance resumption. No claim of independent cryptographic audit is made.
- **Grading:** `/api/quiz/grade` decrypts/validates expiry/integrity, compares MCQ indices on the server, and sends short/long answers in one batched Gemini rubric-grading request. Finite numeric marks are clamped to each maximum; partial credit is supported. Missing/malformed provider grades are explicitly `gradingState:'unavailable'`, not established academic failures. However some returned mark fields retain zero placeholders and aggregate code needs care; do not interpret them as valid zero attainment. `summarizeAttempt()` computes points-based feedback separately from the binary “correct” count.
- **Security bounds:** the token shape does not bind a user ID or supply one-time replay protection; expiry/encryption alone do not prevent repeated submission or prove exam-level anti-cheating. Submission reveals answer/feedback after grading. Persistence checks ownership on history/review access, but ordinary generation/grading do not share all review-endpoint authorization guarantees. Do not claim a formally secure examination system.
- **Internal Doubts review:** `/api/quiz/explain` → `explainQuiz()` → `runAskService({mode:'quiz_review'})` loads an owned submitted immutable snapshot, validates current curriculum/grade state, skips free-form correction, compares student/expected answer and requires grounded support/adequacy review. It can flag insufficient support or an assessment conflict without changing marks/key. Durable leases coordinate duplicate requests. **No current React UI caller of `/api/quiz/explain` was found**; present this as implemented backend integration, not a working “Explain with Doubts” button. Old records without snapshots are ineligible.

References: `src/lib/quiz/{answer-key,persist,feedback,explain,explain-store,explain-http}.ts`, migrations `0012`, `0015`, `0022`, and `docs/ask-evolution/QUIZ_HANDOFF.md`. Fresh automated review tests do not certify current live generated answer keys or teacher-quality partial credit.

## 4. Chat: exact capabilities

The selectable allowlist in `src/lib/chat/models.ts` is:

| Provider | Exact model ID in code | Current role |
| --- | --- | --- |
| Google Gemini | `gemini-3.5-flash-lite` | Default Chat option; locally configured Doubts and Quiz model |
| Groq | `openai/gpt-oss-120b` | Text-only Chat option and grounded Ask/Quiz-review fallback |
| Google Gemini | `gemini-3.6-flash` | Additional Chat option; presence is not a fresh successful-provider test |
| Groq speech endpoint | `whisper-large-v3` | Locally configured/default transcription model |

**Groq is the provider name; Grok is not integrated.** GPT-OSS is a hosted model on Groq, not a claim of OpenAI API inference. No Beam/Ollama integration exists.

Chat accepts **one current-turn JPEG, PNG, WebP or PDF**, at most 10 MiB, only on Gemini options. These MIME types are checked in the API and UI; there is no evidence here of full binary malware/content-type validation. No DOCX, PPTX, Excel, arbitrary audio/video attachment support is established. Attachment bytes are sent to the provider but history persistence stores only filename/MIME metadata, not attachment bytes. Prior conversation turns are replayed **text-only**, from owned server-stored messages, not client-submitted history. There is no explicit history-token truncation/summarization budget in the inspected replay path; long conversations can increase cost or fail. The selected model is user choice, not automatic Chat provider failover.

Voice uses browser `MediaRecorder` → authenticated `/api/chat/transcribe` → `https://api.groq.com/openai/v1/audio/transcriptions`, model `whisper-large-v3`, response text inserted into the editable message field. The API caps audio at 20 MiB; that size cap is not an enforced exact recording duration. The text box remains available; transcription failure advises typing. Browser speech playback uses the Web Speech API, not Groq-generated speech. Actual microphone permissions, Urdu transcription accuracy and playback voices depend on browser/device and were not tested here.

`src/prompts/chat.ts` explicitly permits general knowledge outside the selected textbook. It provides student/profile/language context, encourages reasoning and asks the model to decline harmful requests. **There is no retrieval gate, citation validation or independent support review in Chat.** These are prompt-level safety instructions plus provider behavior, not an established guarantee against hallucination or prompt injection.

## 5. Evaluation: what the evidence actually establishes

The currently advertised old evaluation story is stale: **`src/lib/evaluation/`, `/api/eval`, the Eval page and `npm run eval` are absent in the inspected tree/package scripts.** `docs/evaluation.md` and old `docs/submission.md` still describe them. Do not show an Eval dashboard or quote historical fallback figures as today's system accuracy.

| Evidence | What ran / outcome | Conditions and limitations |
| --- | --- | --- |
| **Fresh offline suite, 24 Oct** | 179 Ask/Quiz/UI tests and 16 notification tests passed, no skips; lint passed | Fixtures/mocks, recorded-response replays and local fixture servers. No paid provider, browser or real student evaluation. Counts must carry this label. |
| **Class 9 catalogue** | 168 proposed acceptance cases across eight local textbook collections; historical structural/reference checks. Prior live refresh matched all seven Physics evidence records | The 168 academic questions were **not executed** against Ask. Not 168 correct answers. See `tests/ask/class9/catalogue.json` and `CLASS9_TEST_CATALOGUE.md`. |
| **21 Oct four-request HTTP latency audit** | Evaporation typo answered in **71,814 ms** client time; unsupported World Cup question refused in **14,660 ms**. Clear evaporation request failed with upstream 504 after **109,205 ms**; ambiguous request failed with upstream 503 in **888 ms** | Local restored corpus + actual Jina embeddings + Gemini, sequential authenticated HTTP requests, no browser. Earlier pipeline checkpoint; not current average/p95 or a speed benchmark. `LATENCY_AUDIT.md` and ignored event recording. |
| **23 Oct evidence-sufficiency service probes** | Reported non-contact question answered in **9,437 ms**; multipart request returned partial in **10,218 ms**; Einstein and magnetic-bit mechanism traps refused in **4,506 / 3,640 ms** | Real local retrieval/Jina/Gemini, focused probes, preceding stricter adequacy follow-up. Definition-only quality gaps were subsequently found. Not broad academic acceptance. `FALSE_REFUSAL_FIX.md`. |
| **23 Oct stricter adequacy/provider follow-up** | One real HTTP non-contact request answered with partial coverage and three cited statements in **49,348 ms** client / **49,167 ms** server; no retry needed | Also recorded provider failures around understanding, explicit explanation 503 and a 110-second deadline failure. Current checks can reject supported-but-inadequate answers. `ANSWER_ADEQUACY.md`. |
| **23 Oct Groq fallback probes** | Real Groq with simulated Gemini 503: one probe hit Groq 429 in **1,401 ms**; another finished stages but its review was invalid and rejected in **6,855 ms** | Stored OCR/scores; no live retrieval for these probes. **No passing live fallback answer established.** `GROQ_FALLBACK.md`. |
| **23 Oct sources-only probe** | Returned three actual source references in **1,852 ms**, of which **1,665 ms** retrieval | Both LLM outages simulated; real local retrieval and Jina, zero actual LLM calls, direct service execution. Not a real outage/browser timing. `SOURCES_ONLY_FALLBACK.md`. |
| **Quiz review backend probes** | Historical synthetic-evidence supported review and wrong-key conflict in **4,327 / 4,333 ms** with real Gemini | These are not real-corpus quiz-generation quality or student-grade validity tests. Historical SQL fixtures/two-client tests covered snapshots/leases. `QUIZ_HANDOFF.md`. |
| **Build/CI history** | Reports document isolated Node 24 builds and CI success at earlier checkpoints; latest sources-only report records isolated Webpack build success after stopping a stalled Turbopack attempt | No fresh production build/deployment verification in this task. The two build outcomes must not be collapsed into “all builds pass.” `docs/ci-cd.md`, `SOURCES_ONLY_FALLBACK.md`. |

The old `nm-003` Drude-model leak with a 0.709 keyword-fallback score is a historical measured failure, not a calibrated embedding result or present accuracy estimate. No representative current error-rate denominator, teacher-adjudicated benchmark, classroom trial, learning-gain study, verified real-student user count or partnership evidence was established. Do not claim “zero hallucinations,” perfect refusal, validated exam performance, proven improved grades, or a mean response time from these heterogeneous cases.

## 6. Practical viability, operating evidence and cost

### Deployment and measured local resources

Single Next.js app with API routes, React/Tailwind, Node **24.x**, npm. Supabase supplies PostgreSQL/pgvector, Auth and Storage; no separate application backend service is required. Vercel analytics/speed packages are integrated. `.github/workflows/ci.yml` defines install → lint → offline Ask tests → notification tests → build. The weekly crawler is a separate write-capable workflow and was not run. No hosting account, production environment, current production URL or billing dashboard was accessed.

`docs/ci-cd.md` records a successful Vercel **Preview** deployment `7219407236` on 21 Oct, separately from a then-failing CI run. This is historical preview evidence, not current production health, a production promotion policy or an uptime SLA.

Fresh read-only local measurements (changing operational snapshots, not hosted usage or quotas):

| Item | Observed value | What it means |
| --- | ---: | --- |
| Curriculum | 494 chapter rows; 498 source rows; 8,491 sections; 8,594 chunks | Includes textbooks/papers and multiple subjects; not 494 complete curriculum chapters or learning objects independently checked |
| Board/class rows | FBISE only; class 9: 106, class 10: 124, class 11: 140, class 12: 124 chapter rows | Rows may include paper-year artifacts. Do not label all four classes completely covered |
| PostgreSQL database bytes | 166,934,195 | `pg_database_size`, including non-corpus overhead; not exact billable hosted storage |
| Chunk relation including indexes/TOAST | 149,880,832 bytes | `pg_total_relation_size('public.content_chunks')`; not just raw vector payload |
| Storage object metadata | 509 objects in `source-pdfs`, summed metadata sizes **1,828,736,476 bytes** | Listing/metadata total, not a filesystem or all-object download validation. It exceeds the earlier recovery report's 497 published sources; do not equate object count with distinct textbook count |
| Class 9 Physics | Eight live source records, 176 chunks, stored 1024-dimensional vectors; eight downloadable PDFs matched cached SHA-256/page counts in the preceding live refresh | Reference/byte integrity, not verified physics answers. Explicit unit-boundary defects remain |

The local stack is the retained `sabaq-ask-review` Docker recovery project on API 54321 / DB 54322. The established `.env.local` then `.recovery/ask-local.env` launcher points the app to local Supabase; `.env.local` alone still targets hosted configuration. No app is currently listening on the previously used demo port 3100. The local migration ledger has one combined bootstrap entry; hybrid retrieval/Quiz-review feature presence was checked directly. Notifications tables are absent, and old match/ingest RPCs retain authenticated EXECUTE with legacy match lacking a pinned path. Active hybrid RPC has tighter service-role-only execution. Do not say the entire live schema matches every committed migration.

### Dependencies, limits and privacy

- Jina query embeddings, Google Gemini generation/review, Groq fallback/Chat/transcription, Supabase, SMTP email/OTP and deployment/network access are external dependencies. Tesseract/Poppler are crawler-time local/CI dependencies. No Alibaba/Ollama runtime is required by the current configuration.
- Default Doubts limits: 1,600 input characters, 32KB body, 6 seeds/10 context chunks, 7,000 context tokens, 4,000 output tokens, 110-second total deadline, route ceiling 120 seconds, maximum 6 generation attempts including optional paths. Instance-local caps are 1 active request and 6/minute per owner; 4 active and 30/minute globally. These are code limits, not measured concurrency capacity; multiple replicas require shared limiting. Do not apply these caps to Chat or Quiz, whose independent routes do not enforce the same budget.
- Local thresholds are `.62 / .52 / .50` for PASS/BORDERLINE/support. They are configured settings, **not calibrated accuracy evidence**. A pre-gate excerpt assessment now also participates in uncertain evidence handling.
- Supabase RLS and explicit server ownership checks protect several owned data paths. Service-role credentials bypass RLS; every server route still needs correct scope/owner checks. Prior sampled read-only role tests denied anonymous curriculum reads and foreign-class data under the tested authenticated profile. That is not a full security audit.
- Chat text/profile context, quiz answers/performance and plans are personal data, including potential minors' data. Model requests can export question/evidence/chat/attachment/audio or grading content to third parties. Do not say “no personal data,” “everything stays locally,” “nothing is stored,” or “end-to-end encrypted.” Raw attachments are not persisted by Chat's message store, but providers still receive their bytes.
- Code includes conversation deletion, logout/local draft clearing, an activity marker with a 30-minute idle timeout, and account deletion after an emailed OTP via `src/app/api/auth/delete-account/`. The account route uses Auth admin deletion and schema cascades. These controls were inspected, not destructively tested; completeness across files, backups, logs, analytics and third parties is unverified. Missing SMTP can trigger development OTP logging. Formal retention, parental consent, provider contracts and a complete privacy-policy/compliance review were not established.
- Official Google pricing distinguishes free-tier content use for product improvement from paid-tier handling; the actual project tier/contract was not inspected. Do not promise provider zero retention or zero training use. [Google pricing and data-use table](https://ai.google.dev/gemini-api/docs/pricing).

### Textbook provenance and permissions

Manifests point to FBISE-related textbooks/papers, including third-party mirrors such as Taleem360 and Google Drive bundles. The Class 9 Physics manifest describes an NBF National Curriculum 2022–23 scanned textbook. Local identity/hash evidence links served chapter copies to recovered caches; it does not independently establish publisher permission, edition certification or OCR accuracy.

No signed redistribution licence, publisher/board partnership or blanket permission for textbook ingestion/hosting was established. Public download availability is **not permission**. The repository `LICENSE` covers the team's own software and lists its contributors; it does not grant rights to third-party textbook material. Obtain title/edition-specific provenance and permission before public distribution; do not falsely relabel the present textbook corpus as only openly licensed papers. No legal clearance is claimed.

### Recorded token use and defensible cost example

Current official rates were checked read-only on 24 Oct; no provider API inference was made. Google's standard `gemini-3.5-flash-lite` list price is **$0.30 per million input tokens / $2.50 per million output tokens, including thinking**. [Official pricing](https://ai.google.dev/gemini-api/docs/pricing). Groq lists `openai/gpt-oss-120b` at **$0.15 / $0.60 per million input/output tokens**, and `whisper-large-v3` at **$0.111 per audio hour**. [Official Groq model pricing](https://console.groq.com/docs/models). These rates are not invoices or proof that the account has a particular paid/free entitlement.

The historical `.recovery/ask-latency-audit-events.jsonl` contains usage for the successful evaporation-typo HTTP request (server request `9714725c-f23c-4960-8062-5b050ddc8b9d`), model version `gemini-3.5-flash-lite`, standard service tier:

| Stage | Recorded input tokens | Recorded candidate-output tokens |
| --- | ---: | ---: |
| Understanding | 430 | 152 |
| Explanation | 5,470 | 477 |
| Support review | 4,860 | 358 |
| **This turn's recorded generation total** | **10,760** | **987** |

Those usage records have no separate thinking-token field and their reported totals equal input + candidate output. The same turn's Jina query reports **23 embedding tokens**. At the current stated Gemini rates, the **three recorded generation calls only** would list-price at `(10,760 × $0.30 + 987 × $2.50) / 1,000,000 = $0.0056955`, approximately **$0.0057**. This is a repriced historical example, not the invoice, a current average, a full cost per question, or a forecast. The current pipeline can add sufficiency/repair/retry work not present in that example. Token-count endpoint handling, embeddings, failed requests, hosting, database, Storage/egress and taxes are not included.

A separate refused turn records Gemini understanding **452 input / 75 output tokens**, plus 23 Jina embedding tokens; final refusal therefore is not synonymous with no upstream cost. Normal request traces do not provide a complete production billing ledger.

No reproducible current total operating-cost estimate is supported. Missing: billed account tiers/invoices, Jina model/account-specific rates (its current page exposes account/top-up-dependent pricing), full per-stage usage including failures/retries, Quiz/Chat histories and audio durations, traffic/concurrency distribution, storage egress and hosting plan rates. [Jina pricing surface](https://jina.ai/embeddings/). No local recording of completed voice duration was established, so no voice-cost total is calculated. No Alibaba or Beam cost is assigned to the running app.

## 7. PLANNED AI Concept Lab — proposal only

Source: [PHYSICS_LAB_FEASIBILITY.md](PHYSICS_LAB_FEASIBILITY.md). **Everything in this section is PLANNED. There is no implemented Lab route, experiment registry/solver/session model, completed Lab acceptance test, working Lab screenshot, selected final Lab provider or delivery commitment.** Existing Three.js Explore visuals are not evidence of implementation.

**Smallest recommended PLANNED scope:** FBISE Class 9 Physics, Kinematics, one straight-line uniform-motion experiment family. The PLANNED loop is question → select an approved supported experiment → student prediction → deterministic experiment → observations → AI-guided explanation → approved follow-up. Code would own units, validation, calculations, samples, graphs and displayed results. AI would propose only supported experiment IDs and teaching/observation actions; approved templates/result references would prevent model-authored formulas, numbers or citation metadata. The initial PLANNED follow-up changes speed while holding time fixed. This is a proposed learning interaction, not a measured learning benefit.

**Additional PLANNED candidates, separate from the minimum scope:** instrument reading, bounded constant-acceleration/free-fall, force/mass, lever balance, ideal pressure/hydraulics, energy accounting, density and linear thermometer calibration. Qualitative magnetism/particle illustrations would need different treatment; they are not defensible numerical simulators from the current OCR alone. Broader coverage requires further implementation, source-boundary work and scientific verification. Beam through Ollama Cloud was assessed as an option, **not chosen or integrated**. Starting Supabase did not test Beam. Do not reuse feasibility effort estimates as promised delivery dates.

## 8. Presentation handoff

### Ten short defensible slide claims

1. “Sabaq AI is a board-focused study application for Pakistani students.”
2. “Doubts searches selected textbook sources and chapters.”
3. “Doubts rebuilds displayed citations from stored source records.”
4. “After the final refusal gate, Doubts makes no further model call.”
5. “Doubts checks answer grounding and whether the explanation addresses the question.”
6. “Quiz supports MCQs and written responses, including partial-credit marking.”
7. “Quiz answer data is encrypted server-side before submission.”
8. “Chat offers open study conversation; it is distinct from textbook-grounded Doubts.”
9. “Progress and revision planning use recorded attempts and deterministic code.”
10. “AI Concept Lab is PLANNED, starting with a small Class 9 Kinematics scope.”

Claims 1–9 describe implementation behavior, not current browser availability or guaranteed scientific correctness. Do not convert them into a count of fully verified shipping features. If tests are shown, label “179 offline Ask/Quiz/UI tests and 16 offline notification tests passed on 24 Oct” and state the scope.

### Claims to avoid

- Implemented/working Concept Lab, Beam-powered current app, completed simulations, current Practice module or an integrated Quiz→Doubts UI button.
- “All features live,” functioning local Notifications, all migrations applied, production-ready, scalable to a claimed number of users, instant/always available or a made-up average latency.
- All answers are grounded: **Chat explicitly isn't**; Quiz generation/grading don't use the full Doubts pipeline.
- Zero hallucinations, perfect refusal/accuracy, guaranteed correct keys/grades, calibrated thresholds, verified all textbooks, “168 academic tests passed,” or offline tests presented as student evaluation.
- Hashing hides browser answers, cheat-proof exams, zero-cost requests, a supported monthly cost-per-student figure, zero personal data or established minors/privacy compliance.
- Live Alibaba/Qwen/DashScope use, Alibaba hosting/partnership, a Grok integration, publisher permission, schools/users/learning gains or partnerships without independent evidence.
- Current Eval dashboard/`npm run eval`, PCTB-only production scope or other claims copied uncritically from older submission docs.

### Screenshots and demo journeys

**Available evidence:** HTTP/service JSON recordings, test reports, restored source PDFs and the real UI implementation. No authenticated application screenshot with verified current success was established. The tracked PNGs `public/bg.png` and `public/Backward_bg.png` are design assets, not feature screenshots. PDF page renders are textbook evidence, not app screenshots. Do not fabricate a Lab screenshot or label a mockup as running software.

**Suggested real screens to capture after starting the established local app and manually checking them:** syllabus chapter/PDF; Doubts question plus actual answered/partial result and opened citation; an actual refusal with reason; Quiz questions before submit and real results after submit; Chat's model/attachment controls; dashboard/plan with honestly labelled local test data. Capture Notifications only after its database prerequisites are separately resolved. Never expose credentials, student identifiers, OTPs or admin dashboards.

| Current-feature journey | Evidence-backed portion | Honest presentation use |
| --- | --- | --- |
| **Syllabus → Physics chapter → stored PDF** | Live source adapter and eight Physics PDFs verified in the preceding refresh; code implements the screen | Strongest low-inference-risk capture candidate. Browser interaction still needs rehearsal; use existing downloaded PDF if app isn't running. No new generated answer needed. |
| **Doubts typo → cited explanation** | Historical real HTTP evaporation typo success, preserved original input and rebuilt source citation | Show labelled recorded response or manually rehearse with explicit provider-call authorization later. Do not claim this audit just reran it. |
| **Doubts unsupported question → refusal** | Historical World Cup/unsupported-theory endpoint/service refusals; fresh offline terminal-refusal contracts | Valid recorded contrast. Do not promise a live request requires zero inference or will always finish quickly. |
| **Quiz submitted response → cited backend review/conflict** | Historical synthetic-provider review and controlled ownership/snapshot/lease tests | Explain architecture or show an honestly labelled technical recording. No current UI button, live generation/grade acceptance or student results established. |
| **Existing Quiz/history, Chat, dashboard and Plan screens** | Implemented surfaces and data/schema paths; some historical implementation reports | Capture/rehearse only after verifying the current app. They are not newly verified end-to-end journeys. Do not seed or manufacture “student activity” for slides. |

No current complete browser demo was verified in this read-only check. No demo should depend on forcing an outage, running the crawler, deleting an account, changing the database, or pretending a provider recording is a live request.

### Team contributions and Alibaba tooling

The `LICENSE` names **Taha Sohail, Muhammad Shaheer, Abdullah Adnan and Muhammad Hasnain**. `docs/build-plan.md` gives historical intended layer assignments, not proof of completed work. Git author records provide narrower evidence:

| Git-recorded contributor | Established examples | Attribution limit |
| --- | --- | --- |
| Taha Sohail | Notifications (`53742cc`, `e0ded52`, `362cd43`), dashboard charts (`96e211b`), Explore (`ad355d8`), PDF recovery checks (`7bd467e`), OTP/account/privacy-related UI work | Author/commit evidence, not sole ownership of every file, percentage contribution or proof of manual authorship |
| Abdullah-SE-bit / Abdullah Adnan author strings | Corpus ingestion (`c5bcb47`, `e44bbb1`), evolved Doubts/shared review/hybrid/adequacy (`a946b78`, `8238c8e`, `b7631bf`, `24ba281`), retry/fallback/sources-only (`316b1fe`, `0e9d820`, `89c801c`) | These author strings and the named build-plan role are documented; do not turn them into unverified hours/credit shares |
| Artfever / artfever author strings | Planner UI (`325b063`, `c143181`), evaluation removal (`1d2029f`), recovery handoff (`fd6d7be`), licence update (`c0f352d`) | Confirm the handle-to-real-name mapping with the team before labelling it Muhammad Shaheer on a contribution slide |
| Muhammad Hasnain | Syllabus UI (`fa568e0`, `169212a`), Quiz history/results/drafts (`1dcaba1`) | Git-recorded examples, not exhaustive attribution |

**Alibaba evidence:** the embeddings client supports a configurable DashScope/Qwen-compatible endpoint; `.env.example` documents `text-embedding-v3` as an alternative. That is **compatibility code/configuration documentation**, not evidence of actual Alibaba inference. Sanitized local env and recorded successful embedding calls instead show **Jina**. Older `docs/submission.md` claims that DashScope powers every embedding; that wording is contradicted by current evidence and should not enter the slides. No verified Alibaba hosting, Model Studio usage log, Qoder use or sponsor credits/partnership was found. Establish any actual historical Alibaba tooling with dated console usage/export, deployment records or the team's tool history before crediting it.

### Missing evidence before stronger claims

Current app startup and successful browser rehearsal/screenshots; present hosted deployment and migration parity; notification schema availability; full live Quiz answer-key/grading validity and replay/authorization hardening; Chat attachment/microphone/Urdu acceptance; exhaustive privacy/deletion/retention review; publisher permissions; representative teacher-adjudicated retrieval/answer evaluation; real student outcomes; complete billing/traffic metrics; confirmed contributor-handle mapping and any actual Alibaba usage records. Concept Lab needs implementation and scientific verification before it can appear as current functionality.

## PowerPoint-generation brief

Create a concise finals deck for **Sabaq AI**, a Pakistani board-study prototype. Lead with the need for source-checkable textbook help. Present current Doubts, Quiz, open Chat, source exploration, progress and deterministic revision planning; label Notifications implemented/tested but blocked on the inspected local schema, and standalone Practice not implemented. Explain Doubts as correction/clarification → scoped hybrid retrieval → final gate → teaching → stored citations → grounding/adequacy review. Explain encrypted Quiz answers and server grading without claiming perfect marking. Show only actual screenshots or explicitly labelled historical test recordings. Use no accuracy, adoption, learning-gain, partnership or monthly-cost claims. Any test count must say offline fixtures; any latency must retain its individual outcome and conditions. Place **AI Concept Lab — PLANNED** on a separate roadmap slide: Class 9 Kinematics, student prediction → deterministic code experiment/results/graphs → observations → constrained AI-guided teaching. No Lab screenshots, completed capabilities, final provider choice or dates. Close with next verification needs, not an invented success metric. Current evidenced stack: Next.js/Node 24, Supabase/pgvector, Jina, Gemini and Groq; Alibaba compatibility is not verified runtime usage.
