# CI — what it does and how to fix it when it's red

This project has one automated check, defined in `.github/workflows/ci.yml`. It does **not**
deploy anything — it only checks that the code is installable, type-safe, and buildable.

## What runs, and when

Every time you push to `main`, or open/update a pull request, GitHub runs three steps in order:

1. `npm install` — installs dependencies.
2. `npm run lint` — type-checks the code (this project uses `tsc --noEmit` as its lint step, so
   "lint" here really means "does TypeScript compile without errors").
3. `npm run build` — runs `next build`, the same build Vercel or any host would run.

If any step fails, the whole run is marked **red (failed)** and the later steps don't run. If all
three pass, the run is **green**.

No API keys or Supabase credentials are needed for this to pass — the app is written so that
missing env vars are handled gracefully at build time (they just mean a feature returns "not
configured" at runtime, not that the build crashes).

## How to read a failed run on GitHub

1. Go to your repo on GitHub → the **Actions** tab.
2. You'll see a list of runs, one per push/PR. A red ✗ means it failed.
3. Click the failed run, then click the **build** job on the left.
4. Click to expand the step with the red ✗ (it'll be "Install dependencies", "Lint (type check)",
   or "Build").
5. Scroll to the bottom of that step's log — the actual error is almost always the last real
   message before the step stops, not the first line.

You can also see this directly on a pull request: GitHub shows a red ✗ or green ✓ next to the
"CI" check near the merge box, and clicking "Details" takes you to the same log.

## Fixing the two most common failures

### "Lint (type check)" failed

This means TypeScript found a type error — usually a typo, a wrong prop name, or a variable that
could be `null`/`undefined` where the code assumes it can't be.

1. Run it locally: `npm run lint`
2. It prints the file and line number of the error, e.g. `src/app/page.tsx:42:10 - error TS2339:
   Property 'foo' does not exist on type 'Bar'.`
3. Open that file at that line, fix the type mismatch (often: add a null check, fix a typo, or
   correct an import), save, and re-run `npm run lint` until it's clean.
4. Commit and push — CI will re-run automatically.

### "Build" failed

This usually means either a lint error slipped through in a file lint doesn't cover, or something
that only breaks in a production build (e.g. an import that doesn't exist, a page using a
server-only API in client code).

1. Run it locally: `npm run build`
2. Read the error output the same way — it names a file and usually says what's wrong.
3. Fix, then re-run `npm run build` locally until it succeeds before pushing again.

### "Build" failed with `spawn UNKNOWN` (Windows only)

This one isn't your code. It's a stale Next.js/Turbopack cache, and it happens locally on Windows,
not in CI. Fix:

```bash
rm -rf .next
npm run build
```

`npm run lint` still type-checks correctly while this is happening, which is a good way to confirm
your code is fine.

### If it still doesn't make sense

Copy the last 20–30 lines of the failed step's log and paste them into a chat with an assistant
(or search the exact error message) — that's usually enough context to explain what broke, even
if the Actions interface itself is confusing.

## What this workflow deliberately does NOT do

- It does not deploy anywhere (no Vercel, no hosting step).
- It does not run security scans or evaluation scripts.
- It does not require any secrets to be configured in GitHub.

Those are separate things to add later, on purpose — this workflow's only job is "would this code
install and build cleanly."
