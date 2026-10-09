# Run the recovered Sabaq AI in VS Code on this Windows laptop

This guide uses VS Code's integrated **Command Prompt** terminal. It starts the recovered local
Supabase stack and Next.js app from the D: drive. The restored database, embeddings, and PDF files
are stored outside Git in local Docker volumes and `.recovery/`; cloning the repository alone will
not copy them to another computer. See [the teammate setup prompt](teammate-setup-prompt.md) for
another laptop.

## Start

1. Open **Docker Desktop** and wait until the engine is running.
2. In VS Code, choose **File → Open Folder** and open
   `D:\University Work\SUMMER PROJECTS\SabaqAI\ver1`.
3. Choose **Terminal → New Terminal**. In the terminal's dropdown, choose
   **Select Default Profile → Command Prompt**. Open a new terminal if the current one is still
   PowerShell. The commands below are for Command Prompt (`cmd.exe`).
4. Go to the local Supabase project directory and check whether its database container is already
   running:

   ```bat
   cd /d "D:\University Work\SUMMER PROJECTS\SabaqAI\ver1\.recovery\local-stack"
   docker ps --filter "name=supabase_db_sabaq-ai-local-recovery"
   ```

5. If the output has no database container row, start the saved local stack:

   ```bat
   ..\cli\node_modules\.bin\supabase.cmd start --network-id sabaq-ai-local-only --exclude realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor --yes
   ```

   This may print local keys. Keep the terminal output private. Do not use `supabase db reset` or
   delete Docker volumes; either would put the recovered data at risk.
6. In the same terminal, return to the app and start it:

   ```bat
   cd ..\..
   npm.cmd run dev
   ```

7. Open <http://localhost:3000>. Sign in with your working local account. The local Supabase API
   is at <http://127.0.0.1:54321>. Google login uses the callback
   `http://127.0.0.1:54321/auth/v1/callback` on this laptop.

If `npm.cmd run dev` reports that dependencies are missing, run `npm.cmd install` in the app folder
and then `npm.cmd run dev` again. Node.js 20 or newer is required.

## Stop without losing data

1. In the VS Code terminal running the app, press **Ctrl+C**. The web server stops; Supabase may
   remain running.
2. To stop this laptop's local Supabase session too, run the following in a VS Code Command Prompt
   terminal. It stops containers only; it does not remove their volumes:

   ```bat
   docker stop supabase_storage_sabaq-ai-local-recovery supabase_rest_sabaq-ai-local-recovery supabase_inbucket_sabaq-ai-local-recovery supabase_auth_sabaq-ai-local-recovery supabase_kong_sabaq-ai-local-recovery supabase_db_sabaq-ai-local-recovery
   ```

The next start uses the same saved data. Leave the project folder, `.recovery/`, and Docker volumes
in place.

## If something does not start

- **Docker command cannot connect:** Open Docker Desktop and wait for its engine to finish loading.
- **Port 3000 is already in use:** Stop the other app on that port. CivicPulse may also use it.
- **Local Supabase will not start:** Check Docker Desktop, then run `docker ps -a --filter
  "name=sabaq-ai-local-recovery"` to inspect the saved containers. Do not reset the database.
- **PDFs show OCR text:** Check that the local Storage container started. The app uses OCR text
  when a PDF object is genuinely missing.
- **AI answers refuse:** The confidence gate may be correctly refusing an unsupported question.
  Jina and Gemini also need valid keys, network access, and available quota for new answers.

The recovery details and data inventory are in [local-recovery.md](local-recovery.md). Never copy
`.env.local`, `.recovery/`, database dumps, OAuth secrets, or demo credentials into Git.
