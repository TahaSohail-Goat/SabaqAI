# Setup (no Docker, beginner-friendly)

Follow in order. Total time first attempt: about 2 hours, most of it accounts and auth.

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
   - `service_role` key (SECRET — server only, never in browser code)

## 3. Create the tables

1. Database → SQL Editor → New query.
2. Open `supabase/migrations/0001_init.sql` from this repo, copy all of it, paste, and Run.
3. Check Table Editor — you should see `users`, `student_profiles`, `content_chunks`, `qa_log`,
   `quizzes`, `quiz_questions`, `quiz_attempts`.

## 4. Get an AI provider key

Pick one provider that offers both an embedding model and a chat model. Create an account, add a
little credit, and copy your API key. Note the exact model names for embeddings and chat —
you'll put them in `.env.local`.

> Whatever embedding model you choose, note its dimension (often 768, 1024, or 1536). The
> migration uses `vector(1024)`. If your model outputs a different size, change that number in the
> migration **before** you run it, and in `EMBEDDING_DIM`. Mismatched dimensions is the #1
> silent bug.

## 5. Fill in .env.local

```bash
cp .env.example .env.local
```

Open `.env.local` and paste your keys. Save. **Never commit this file** (`.gitignore` already
excludes it).

## 6. Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## When something breaks

- **"vector type does not exist"** → you didn't enable the extension (step 2).
- **Dimension mismatch on insert** → your embedding model's size ≠ the migration's `vector(N)`.
- **Auth redirect loops** → the most common Day 1 issue; check your Supabase URL and anon key are
  exact, no trailing spaces.
- **Empty search results** → you haven't run `npm run ingest` yet, or ingestion failed silently;
  check the Supabase logs.

Read the error message fully before changing anything. Most of these tell you exactly what's wrong.
