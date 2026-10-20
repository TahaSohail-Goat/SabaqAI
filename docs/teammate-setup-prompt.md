# Codex prompt: set up Sabaq AI on a teammate's Windows laptop

Copy the prompt below into Codex on the teammate's laptop after the teammate clones the repository.
The teammate must provide the database backup and PDF bytes separately through an approved private
transfer; they are not in Git. Credentials must be entered locally and privately.

```text
You are setting up an independent local copy of Sabaq AI on my Windows 11 laptop so I can test it.
Use the Git branch docs/vscode-local-recovery-handoff. Read AGENTS.md, docs/project-status.md,
docs/local-recovery.md, and docs/vscode-local-recovery.md first. Do not merge or push to main.

Goal: run the app in a VS Code integrated terminal with a separate local Supabase stack, recovered
OCR syllabus text, existing 1024-dimensional embeddings, and readable textbook, past-paper, and
model-paper PDFs. Verify retrieval, a grounded answer with a stored-row citation, a correct refusal,
and at least one PDF from each source type. Google login is optional until the core app works.

Work autonomously on a separate branch. First audit Windows 11, WSL 2, Docker Desktop, Node 20+,
npm, free disk space, Git status, and available ports. Prefer D: for large files if present. Explain
any missing prerequisite with exact VS Code/Windows steps. Check for an existing local Supabase
instance or Docker volume before changing it. Do not touch any hosted Supabase project.

Ask me where I privately placed (1) the PostgreSQL backup and (2) an archive or directory of the
restored PDF Storage objects, if you cannot find them. The backup alone contains Storage metadata,
not the PDF bytes. Do not claim the PDFs are present merely because storage_path rows exist. If the
PDF archive is unavailable, identify exactly which objects are missing and ask for a private
transfer or safely obtain them from the known source manifest. Preserve the original backup.

Create a machine-local Supabase CLI project/config and secrets in an ignored directory. Use a
distinct local project name and Docker volume names, so this laptop's data cannot collide with
another project. Restore a COPY of the backup, not the original. Preserve all OCR chunks, embedding
vectors, users, and authentication data. Do not run db reset, destructive migrations, volume prune,
or cleanup commands that can delete data. Restore PDF bytes into local Storage and verify actual
responses, page counts, and visible content. The 2022 past papers need the readable PDF copies (or
an equivalent browser-verified fix), because some original scans rendered as white pages in PDF.js.

Create .env.local from .env.example using local Supabase URL, anon key, and service role key; set
SOURCE_PDF_BYTES_AVAILABLE=false so the app checks actual Storage objects. Ask me to enter Jina,
Gemini, and any optional Google OAuth secret securely into ignored local files. Never print keys in
chat, logs, or Git. Google OAuth on this separate laptop needs its matching client ID/secret and
the exact authorized callback http://127.0.0.1:54321/auth/v1/callback if using port 54321. If
Google login cannot be configured, use local signup/login and continue the core tests.

Install dependencies with npm, run npm.cmd run lint, run npm.cmd run build if you change src/app/,
and then start Supabase and npm.cmd run dev. Verify the app at http://localhost:3000. Report real
database counts, PDF counts, auth status, and AI test results. Do not weaken the retrieval confidence
gate or fabricate answers. Update docs/project-status.md for any code or setup change, and give me
exact VS Code Command Prompt commands to start and stop this copy without deleting data.

Before any potentially destructive operation, show the exact command, target, and preservation
plan and get my approval. Never modify the original backup or any hosted Supabase project.
```
