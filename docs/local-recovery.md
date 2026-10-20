# Sabaq AI local recovery on Windows

This recovery uses only the local copy of Supabase. The original backup at
`D:\University Work\SUMMER PROJECTS\SabaqAI\db_cluster-03-10-2026@10-33-39.backup.gz`
and the hosted Supabase project were left unchanged. Work is on branch
`fix/local-supabase-recovery`; local keys, database copies, and demo credentials are in the
gitignored `.recovery` directory on D:.
The previous hosted-project `.env.local` was copied privately to
`.recovery\prepared\remote.env.local.bak` before the local switch.
Before the Google OAuth configuration restart, a local database safety dump was written to
`.recovery\safety\pre-google-oauth-2026-10-09.dump`. The CLI restart used its data-preserving
stop; the local database volume and row counts were verified afterward.

## Start Sabaq AI for the demo

For a VS Code integrated Command Prompt terminal, follow
[vscode-local-recovery.md](vscode-local-recovery.md). This section records the equivalent
PowerShell commands on the original recovery laptop.

1. Start **Docker Desktop** from the Windows Start menu and wait until its engine says it is
   running. Docker's WSL data directory is already linked to D:.
2. Open PowerShell and run:

   ```powershell
   cd 'D:\University Work\SUMMER PROJECTS\SabaqAI\ver1'
   docker ps --filter 'name=supabase_db_sabaq-ai-local-recovery'
   ```

   If the database container is not running, start the local stack with:

   ```powershell
   cd '.recovery\local-stack'
   & '..\cli\node_modules\.bin\supabase.cmd' start --network-id sabaq-ai-local-only --exclude realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor --yes
   cd '..\..'
   ```

   The CLI may print local API keys. Keep that output private.
3. Run `npm.cmd run dev` from the repository directory. Open `http://localhost:3000`.
4. The local demo email and password are in `.recovery\demo-login.json`. Read that file
   privately on this computer; do not commit, upload, or share it. Existing restored accounts
   may also work, but the demo account was tested locally.

The Supabase API is `http://127.0.0.1:54321`. No paid Supabase project is needed. The app
still uses the configured Jina and Gemini API keys for question embeddings and generation,
so those providers need network access and available free quota during the demo. The confidence
gate continues to refuse when it cannot safely answer.

## What's restored

- 8,594 OCR content chunks and 8,594 existing 1,024-dimensional embeddings.
- 494 chapters, 8,491 sections, and their board/class/subject labels and source paths.
- 24 original Auth users, quiz records, attempts, profiles, and other public app data.
- Local signup/login, retrieval, grounded answers, refusals, and quiz generation/grading were
  checked through the running app. The checked quiz appeared in history.
- All 33 textbook source PDFs were downloaded from the saved crawl manifest and checked against
  their original SHA-256 crawl checksums. Their 377 chapter page ranges were rebuilt as standalone
  PDFs and uploaded to **local** `source-pdfs` Storage. `/api/ask/options` now returns a PDF URL for
  all 377 textbook units. The restore report is in the ignored
  `.recovery\obtained\textbook-restore-report.json` file.
- All 121 past-paper and model-paper records now have a readable local PDF. 115 originals matched
  their saved crawl checksums; five 2024 subject papers were extracted, rotated upright, and
  checked against the original FBISE bundle checksums; one legacy duplicate Chemistry model
  record uses the same verified 2025 source. The five previously null paper Storage paths were
  filled in the **local** database. PDF links for all 121 records were verified through the app.
  Reports are in the ignored `.recovery\obtained\papers\restore-report.json` and
  `.recovery\obtained\paper-bundles\restore-report.json` files.
- The 28 past papers from 2022 use separate readable PDF copies. The original Class 9 scans use
  CCITT image compression, and PDF.js rendered those pages white without its image decoder.
  Each 2022 paper was rendered into a JPEG-based PDF at readable resolution, checked for page
  count and legibility, and linked through its local `chapter_sources.storage_path`. Both the
  original and readable PDFs remain in local Storage. Headless Chrome confirmed nonblank pages
  for samples from Classes 9, 10, 11, and 12. The ignored
  `.recovery\obtained\papers\readable\publish-report.json` records every old and new path.

PostgreSQL backups contain Storage metadata, but not the Storage file bytes. The local
`.env.local` keeps `SOURCE_PDF_BYTES_AVAILABLE=false` so the options API checks which objects
actually exist: restored textbook chapters and papers open as PDFs, and missing objects still
fall back to recovered OCR text. Avatar bytes are still missing. The OCR text and embeddings came
from the database backup; the PDF restores did not rerun OCR or change them.

## Google login configuration

The local Supabase Google provider uses client ID
`790751584664-m9elalq85ipqq9sth7r5dosh8mjmju7l.apps.googleusercontent.com` in the
gitignored `.recovery\local-stack\supabase\config.toml`. Its matching secret belongs only in
the gitignored `.recovery\local-stack\.env`, under
`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET`. The `client_secret_761126181385*.json` file
in the parent folder is for a **different** client and must not supply this secret. The new
client must have this authorized redirect URI:

```text
http://127.0.0.1:54321/auth/v1/callback
```

In Google Cloud Console, go to **Google Auth Platform → Clients** (or
**APIs & Services → Credentials**), open the **Web application** OAuth client with the ID
above, add the URI under **Authorized redirect URIs**, and save. Preserve any existing
redirect URIs. If the consent screen is in testing mode, add
the demo Google account as a test user. Then use the Google sign-in button at
`http://localhost:3000/login` and confirm it returns to the app. The available browser control
could not access Google Cloud Console during recovery. The user added the matching secret
privately and later confirmed that Google login works. The restarted local Auth service sends
the client ID above with the exact callback URI.
Google requires an exact redirect URI match; see its [OAuth client instructions](https://support.google.com/cloud/answer/15549257?hl=en).

## CivicPulse for the assignment demo

All existing CivicPulse containers are stopped and have Docker restart policy `no`; none of
their containers, images, or volumes were deleted. To run the main project again:

Stop the Sabaq AI `npm.cmd run dev` terminal with Ctrl+C first: CivicPulse's Grafana service
also publishes port 3000.

```powershell
cd 'D:\University Work\Semester 5\SCD\Assignment 1\Assignment1_SCD'
docker compose up -d
```

When you are done, `docker compose stop` in that same directory stops it while preserving data.
Sabaq AI uses separate containers and a separate Docker network.
