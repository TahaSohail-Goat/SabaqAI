# Database (single-app MVP)

Hosted Supabase Postgres with pgvector. Schema v2 is BCNF-normalised; the design record and
approval checklist live in `docs/schema-proposal.md`. Run the migrations in order in the
Supabase SQL Editor:

1. `supabase/migrations/0001_init.sql` — tables, constraints, indexes, RLS, reference data.
2. `supabase/migrations/0002_match_function.sql` — `match_content_chunks`, the vector search RPC.
3. `supabase/migrations/0003_ingest_function.sql` — `ingest_document`, the atomic ingestion RPC.
4. `supabase/migrations/0004_function_grants.sql` — revokes PUBLIC's default EXECUTE on both RPCs.
5. `supabase/migrations/0005_function_search_path.sql` — pins `search_path = public, extensions` on
   both functions (pgvector lives in the `extensions` schema; without this, calls through PostgREST
   as service_role cannot resolve `vector` / `<=>`).

After applying, run `supabase/tests/001_schema_torture.sql` (22 assertions, self-rolling-back) via
`node scripts/dev-db-sql.mjs` or the SQL Editor to verify everything holds.

## Tables

**Reference tables** (natural code keys; extend by inserting a row, not migrating):
`boards`, `class_levels`, `subjects`, `languages`, `source_types`, `user_roles`,
`gate_decisions`, `refusal_reasons`, `quiz_difficulties`.

- **users** — id (= auth user id), role_code, display_name, preferred_language.
- **student_profiles** — user_id, board_code, class_level, exam_date. Retrieval filters read
  from here.
- **student_subjects** — (user_id, subject_code). A student's subjects are a set, not an array.
- **chapters** — board_code + class_level + subject_code + chapter_no + chapter_title, unique on
  the natural key.
- **chapter_sources** — one row per ingested document for a chapter: source_type, language_code.
- **sections** — section_label, position, page_from/page_to. Page ranges are section-level facts.
- **content_chunks** — section_id, chunk_index, content, content_hash (unique, makes ingestion
  idempotent), embedding vector(1024). Everything about board/class/subject/title/pages is
  reached by joining up the chain — never duplicated onto the chunk.
- **qa_log** — every question: scores, gate decision, refusal reason, latency. `user_id` is
  `ON DELETE SET NULL` so eval metrics survive account deletion.
- **qa_log_chunks** — which chunks were retrieved for a question, with rank and score, and which
  were cited. One row per (qa_log_id, chunk_id).
- **quizzes / quiz_questions / quiz_options** — quiz content. Options are atomic rows.
- **quiz_answer_keys** — correct_option_index + explanation per question. **No anon/authenticated
  RLS policy**: deny by default, read only through the service role. The correct answer can never
  reach the browser before submission, structurally.
- **quiz_attempts / quiz_attempt_answers** — submissions, one atomic row per answered question.

## Read model

**content_chunks_expanded** — a `security_invoker` view flattening the chunk → section → source →
chapter chain back to one row per chunk. Used by `/api/syllabus`; handy for debugging. The
normalised tables remain the single source of truth.

## Functions

- **match_content_chunks(query_embedding, filter_board, filter_class, filter_subject, match_count)**
  — the ONLY search path. Cosine distance (`<=>`), score = 1 - distance. Always filtered by
  board/class/subject; an unfiltered search is a bug. Service role only.
- **ingest_document(payload jsonb, p_force boolean)** — writes one whole document (chapter →
  source → sections → chunks) in a single transaction. Called only by `scripts/ingest.ts` with
  the service role.

## Key indexes

- HNSW index on `content_chunks.embedding` (vector_cosine_ops) for vector search.
- Unique on `content_chunks.content_hash` so re-running ingestion doesn't duplicate chunks.
- Unique on `chapters(board_code, class_level, subject_code, chapter_no)` — doubles as the
  retrieval filter index.
- `unique (section_id, chunk_index)` on `content_chunks`.

## Row Level Security (do this — it's short)

RLS is enabled on every table. A student reads only their own rows, and only the curriculum
content matching their profile's board/class plus their `student_subjects` rows. Reference
tables and (via policy) curriculum content are not sensitive; `qa_log`, quizzes and attempts are
owner-only. `quiz_answer_keys` has no client policy at all. Even for a solo MVP, leave RLS on:
it's the difference between a bug and a data leak, and it's already written for you.

Retrieval and ingestion run with the **service role**, which bypasses RLS deliberately — with the
anon key and no matching profile, every content query returns zero rows and the app refuses every
question with no visible error. See `src/lib/supabase/admin.ts`.

## The dimension warning

`content_chunks.embedding` is `vector(1024)`. If your embedding model outputs a different size
(768, 1536, etc.), change that number in the migration **before running it**, set `EMBEDDING_DIM`
to match, and update `query_embedding vector(1024)` in `0002_match_function.sql`. This mismatch
is the most common silent failure.
