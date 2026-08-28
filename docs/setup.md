# Setup (no Docker, beginner-friendly)

Follow in order. First attempt takes about two hours, most of it accounts and auth.

## 1. Install Node.js 20+

Download from nodejs.org (LTS). Verify:

```bash
node --version   # must be 20 or higher
```

## 2. Create the Supabase project

1. Go to supabase.com, sign up, create a new project. Choose a region near you. Wait ~2 minutes.
2. **Enable pgvector:** Database → Extensions → search "vector" → toggle it on.
3. **Get your keys:** Project Settings → API. Copy three values:
   - Project URL
   - `anon` `public` key (safe for the browser)
   - `service_role` key (SECRET — server only, never in browser code, never in a `NEXT_PUBLIC_` var)

## 3. Get a Jina AI key (embeddings)

1. Go to [jina.ai](https://jina.ai), sign up, and create an API key. The free tier covers the
   demo corpus easily.
2. We use **`jina-embeddings-v3`**, which outputs **1024 dimensions** — matching `vector(1024)` in
   the migration, so nothing has to change.
3. In `.env.local`, set:
   ```
   EMBEDDING_API_KEY=<your Jina key>
   EMBEDDING_BASE_URL=https://api.jina.ai/v1
   EMBEDDING_MODEL=jina-embeddings-v3
   EMBEDDING_DIM=1024
   ```

> **Confirm the dimension before step 8.** Run `node scripts/verify-embeddings.mjs` — it embeds a
> probe string (English and Urdu) and fails loudly if the returned size isn't 1024. If you ever
> switch models and the result isn't 1024, change `vector(1024)` in
> `supabase/migrations/0001_init.sql` **before running it**, and set `EMBEDDING_DIM` to match.
> Mismatched dimensions is the #1 silent failure — every insert fails, and the error doesn't say why.

DashScope/Qwen `text-embedding-v3` remains a drop-in alternative (also 1024-dim): leave
`EMBEDDING_BASE_URL` blank and set `EMBEDDING_MODEL=text-embedding-v3`. Whichever provider you
pick, ONE model must embed both the corpus and every question — mixing models silently destroys
search quality.

## 4. Get a Gemini key (generation)

From Google AI Studio. Copy the key. We use `gemini-2.5-flash` for grounded answers and quiz
generation.

## 5. Get a Groq key (voice, optional)

Only needed for Day 5's Urdu voice input. From console.groq.com. We use `whisper-large-v3`.

Skip this if voice isn't in your scope — everything else works without it.

## 6. Create the tables and the search function

1. Supabase → SQL Editor → New query.
2. Open `supabase/migrations/0001_init.sql`, copy all of it, paste, and Run.
3. New query again. Open `supabase/migrations/0002_match_function.sql`, paste, and Run. This
   creates `match_content_chunks`, the vector-similarity function retrieval calls — without it,
   every search fails.
4. Check Table Editor — you should see `users`, `student_profiles`, `content_chunks`, `qa_log`,
   `quizzes`, `quiz_questions`, `quiz_attempts`.

> If you changed `vector(1024)` in `0001_init.sql`, change `query_embedding vector(1024)` in
> `0002` to match, or calls will fail with a type error.

## 6b. Set a quiz secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the result into `QUIZ_SECRET` in `.env.local`. This encrypts the quiz answer key so it can
be sent to the browser without exposing the answers. Without it, each server instance generates
its own ephemeral key and grading breaks intermittently once deployed.

## 7. Fill in .env.local

```bash
cp .env.example .env.local
```

Open `.env.local` and paste your keys. Save. **Never commit this file** — `.gitignore` already
excludes it.

## 8. Ingest and run

```bash
npm install
npm run ingest    # chunks + embeds your source content into Supabase
npm run dev       # http://localhost:3000
```

Verify ingestion actually worked — in Supabase, run:

```sql
select count(*) from content_chunks;
```

If that returns 0, ingestion failed silently. Don't move on until it returns real rows.

---

## Known traps

**Retrieval returns nothing and the app refuses everything.**
The RLS policy `chunks_match_profile` requires a matching `student_profiles` row, and nothing in
the app creates one yet. With the anon key, every query returns zero rows, the guardrail correctly
returns REFUSE, and the whole app refuses every question with no error anywhere.

*Fix:* run retrieval server-side with the `service_role` key and keep the explicit board/class/
subject filter. Content chunks are textbook material, not sensitive data. Keep RLS on for `qa_log`,
`quizzes`, and `quiz_attempts`, where it does matter.

**Auth "works" but nothing is configured.**
When Supabase env vars are missing, `/api/auth/signup` and `/api/auth/login` return a fabricated
`demo-user-101` with `isDemo: true` and `success: true`. Convenient locally, dangerous before a
demo — check for `isDemo` before you believe a successful login.

**Thresholds are meaningless until you calibrate.**
`PASS_TOP1=0.62` and friends were guessed before any real corpus existed. Calibrate them against
real ingested content before quoting them. See `docs/evaluation.md`.

---

## When something breaks

- **"vector type does not exist"** → you didn't enable the extension (step 2).
- **Dimension mismatch on insert** → your embedding model's size ≠ the migration's `vector(N)`.
- **Auth redirect loops** → the most common Day 1 issue; check the Supabase URL and anon key are
  exact, with no trailing spaces.
- **Empty search results** → ingestion hasn't run or failed silently. Check `count(*)` above, then
  the Supabase logs.
- **Every question refuses** → the RLS trap above, or ingestion is empty.
- **Rate-limit errors while testing** → retrieval currently re-embeds every chunk on every request
  (eleven calls per question). Precomputing embeddings at ingest time fixes this; see
  `docs/project-status.md`.

Read the error message fully before changing anything. Most of these tell you exactly what's wrong.
