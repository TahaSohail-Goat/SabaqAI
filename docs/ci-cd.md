# CI and deployment checks

## What runs

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests. Its Ubuntu job uses
Node 24 and runs these steps in order:

1. `npm install`
2. `npm run lint` (`tsc --noEmit`)
3. `npm run test:ask` (offline fixtures, including a fixture PostgREST server)
4. `npm run test:notifications` (offline unit tests)
5. `npm run build`

A failed step prevents later steps in that job from running. No database or provider credentials
are required. These tests do not establish live retrieval accuracy, provider reliability or browser
behavior. The separate `weekly-crawl.yml` workflow also uses Node 24; running that workflow performs
ingestion and is not necessary to check these CI fixes.

## Runtime alignment

Both Actions workflows and `package.json` / the lockfile root declare Node 24. The installed
Supabase 2.112.4 clients require Node >=22; their realtime initialization needs a native WebSocket.
The installed PDF.js also requires >=22.13 or >=24. Node 24 satisfies both constraints.

The old `engines.node: ">=20"` admitted an unsupported runtime. It is now `24.x`, which also selects
the Node major for subsequent Vercel builds and functions: Vercel documents that the package engine
declaration overrides the project Node version setting. See
[Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
No hosted project setting was changed. The previous deployment's actual Node version was not read
from its build log, and changing this declaration does not alter an already-running deployment.

## Investigation of the 2026-10-21 failures

[CI run 39555718273](https://github.com/TahaSohail-Goat/SabaqAI/actions/runs/39555718273)
used Node 20.20.2 for PR #65 (head `5c16f49905f8e8e4495f2160dc2d0736681ec3dd`, tested merge
`2729f71bb0a0b9a2c4db9199e9039c597bf18c6d`). Installation completed with engine warnings;
the Ask step then reported 56 passing and two failing tests:

- The real retrieval adapter fixture failed during Supabase client initialization because Node 20
  lacked native WebSocket support. The fixture did not fail a curriculum-filter assertion.
- The fresh-process malformed-threshold test used `--import tsx --input-type=module` and a named
  ESM import. `guardrail.ts` really exports `evaluateConfidence`, but this package has no
  `type: module`; under the failing Node 20 execution, tsx exposed that TypeScript module as
  CommonJS. The forced ESM caller
  depended on synthetic named-export inference through that transformation. TypeScript's
  `module: esnext` / `moduleResolution: bundler` do not make the package an ESM runtime package.

The child process now uses `--require tsx/cjs --input-type=commonjs` and `require` explicitly.
It still loads a fresh module for each environment and asserts refusal for NaN, Infinity, invalid
support settings and inverted thresholds, plus a valid-settings PASS control. The test is neither
removed nor skipped; the production gate and its export are unchanged. A package-wide ESM migration
is unnecessary for this test and would affect unrelated scripts. The original fresh-process test
also passed unchanged on Linux Node 24.22.0: the import failure is runtime-dependent, not a missing
production export. An isolated Linux Node 20.20.2 run reproduced the original named-export error.
Explicit CommonJS loading removes that interoperability dependency.

## Did those failures block deployment?

They blocked the remaining notification-test and build steps of that CI job. They did **not** block
the Vercel Preview deployment for the same PR head: GitHub deployment `7219407236` reported
`success`, "Deployment has completed", at `2026-10-21T06:30:00Z`, and the Vercel commit status was
also successful. Its [deployment details](https://vercel.com/tahasohail85-5257s-projects/sabaq-ai/DdyhF6ywAtWRXu3uWu9vbqtpSokg)
are separate from the failed CI check.

There is no deployment job or dependency on CI in this repository's workflows. The observed
Preview success does not establish production promotion rules, branch protection requirements or
Vercel project checks settings; those were not inspected. It also does not establish app behavior.

## Reproducing checks

Use Node 24, then run `npm ci`, `npm run lint`, both test commands above and `npm run build`.
Read the first failed step's actual error before changing application behavior or infrastructure.
For an Actions failure, open the run, its `build` job, then the failed step. Engine warnings alone
are not proof that installation failed. No database restore, re-embedding or Supabase hosting
change is needed for the failures documented here.
