# Database (single-app MVP)

Hosted Supabase Postgres with pgvector. Run `supabase/migrations/0001_init.sql` in the SQL Editor.

## Tables

- **users** — id (= auth user id), role, display_name, preferred_language.
- **student_profiles** — user_id, board, class_level, subjects, exam_date. Retrieval filters read
  from here.
- **content_chunks** — the ingested syllabus. board, class, subject, chapter_no, chapter_title,
  section, page, source_type, content, embedding vector(1024), content_hash.
- **qa_log** — every question: scores, gate decision (PASS/BORDERLINE/REFUSE), which chunks were
  retrieved and cited, latency. This is how you measure refusal rate.
- **quizzes / quiz_questions / quiz_attempts** — quiz data. The correct answer is never sent to
  the browser before the student submits.

## Key indexes

- HNSW index on `content_chunks.embedding` for vector search.
- A plain index on `(board, class_level, subject)` so the filter is fast.
- Unique on `content_hash` so re-running ingestion doesn't duplicate chunks.

## Row Level Security (do this — it's short)

The migration enables RLS so a student can only read their own rows and only the content chunks
matching their board/class/subject. Even for a solo MVP, leave RLS on: it's the difference
between a bug and a data leak, and it's already written for you.

## The dimension warning

`content_chunks.embedding` is `vector(1024)`. If your embedding model outputs a different size
(768, 1536, etc.), change that number in the migration **before running it**, and set
`EMBEDDING_DIM` to match. This mismatch is the most common silent failure.
