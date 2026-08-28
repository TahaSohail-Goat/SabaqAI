// Sabaq AI — live embedding probe. Answers one question with certainty: does the configured
// provider return vectors whose dimension matches BOTH EMBEDDING_DIM and the migration's
// vector(N)? A mismatch is the #1 silent failure in this project: inserts fail in Postgres
// with an error that never mentions the model. Run this BEFORE ingesting anything.
//
//   node scripts/verify-embeddings.mjs
//
// Credentials come from .env.local (same minimal parser as dev-db-sql.mjs — dotenv is not a
// dependency). The key is read, never printed.
//
// The client in src/lib/ai/embeddings.ts is provider-agnostic (OpenAI-compatible /embeddings).
// This probe mirrors its env resolution EXACTLY so what passes here is what the app will use:
//   EMBEDDING_API_KEY   (required — holds the Jina or DashScope key)
//   EMBEDDING_BASE_URL  (default: DashScope compatible-mode; set to https://api.jina.ai/v1 for Jina)
//   EMBEDDING_MODEL     (default: text-embedding-v3; Jina: jina-embeddings-v3)
//   EMBEDDING_DIM       (default: 1024)
import { readFileSync } from 'node:fs';

const DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'text-embedding-v3';
const DEFAULT_DIM = 1024;
const MIGRATION_FILE = 'supabase/migrations/0001_init.sql';

// Minimal .env.local parser (dotenv is not a dependency).
let env = {};
try {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
} catch {
  console.error('No .env.local found. Copy .env.example and fill in the keys. See docs/setup.md.');
  process.exit(2);
}

const apiKey = env.EMBEDDING_API_KEY;
if (!apiKey) {
  console.error(
    'EMBEDDING_API_KEY is not set in .env.local.\n' +
    'For Jina: create a key at https://jina.ai and set EMBEDDING_BASE_URL=https://api.jina.ai/v1\n' +
    'For DashScope: create a key in the Model Studio console. See docs/setup.md step 3.'
  );
  process.exit(2);
}

const baseUrl = (env.EMBEDDING_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const model = env.EMBEDDING_MODEL || DEFAULT_MODEL;
const expectedDim = Number(env.EMBEDDING_DIM ?? DEFAULT_DIM);

// What dimension did the migration declare? The probe checks the code of record, not the docs.
let migrationDim = null;
try {
  const sql = readFileSync(MIGRATION_FILE, 'utf8');
  const m = sql.match(/vector\((\d+)\)/);
  if (m) migrationDim = Number(m[1]);
} catch {
  console.error(`Could not read ${MIGRATION_FILE} — run this from the repo root.`);
  process.exit(2);
}

// Two inputs: one English, one Urdu. Two items also exercises the batch count check, and Urdu
// must embed without error — half the product's questions arrive in it.
const probeTexts = [
  "Ohm's law states that current is proportional to voltage.",
  'اوہم کا قانون: کرنٹ وولٹیج کے براہ راست متناسب ہوتا ہے۔',
];

console.log('Sabaq AI — embedding probe');
console.log('='.repeat(60));
console.log(`Endpoint : ${new URL(baseUrl).host}`);
console.log(`Model    : ${model}`);
console.log(`Expecting: ${expectedDim} dims (EMBEDDING_DIM); migration declares vector(${migrationDim ?? '?'})`);
console.log('');

let payload;
try {
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: probeTexts, dimensions: expectedDim, encoding_format: 'float' }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(`Embeddings request failed (${response.status} ${response.statusText}).`);
    console.error(detail.slice(0, 400));
    if (response.status === 401 || response.status === 403) {
      console.error('\nThe key was rejected. Check EMBEDDING_API_KEY matches the provider in EMBEDDING_BASE_URL.');
    }
    process.exit(1);
  }
  payload = await response.json();
} catch (err) {
  console.error(`Request could not be completed: ${err.message}`);
  console.error('Check network access and that EMBEDDING_BASE_URL is reachable.');
  process.exit(1);
}

const vectors = payload?.data;
if (!Array.isArray(vectors) || vectors.length !== probeTexts.length) {
  console.error(`Provider returned ${vectors?.length ?? 0} embedding(s) for ${probeTexts.length} inputs.`);
  process.exit(1);
}

let failed = false;
for (const [i, item] of vectors.entries()) {
  const v = item?.embedding;
  const label = i === 0 ? 'english' : 'urdu   ';
  if (!Array.isArray(v) || v.length === 0) {
    console.error(`FAIL  ${label}  empty embedding returned.`);
    failed = true;
    continue;
  }
  const finite = v.every((n) => Number.isFinite(n));
  console.log(`ok    ${label}  ${v.length} dims${finite ? '' : '  (WARNING: non-finite values)'}`);
  if (!finite) failed = true;
  if (v.length !== expectedDim) {
    console.error(`FAIL  ${label}  model returned ${v.length}, EMBEDDING_DIM is ${expectedDim}.`);
    failed = true;
  }
  if (migrationDim !== null && v.length !== migrationDim) {
    console.error(`FAIL  ${label}  model returned ${v.length}, migration declares vector(${migrationDim}).`);
    failed = true;
  }
}

if (migrationDim !== null && migrationDim !== expectedDim) {
  console.error(`FAIL  EMBEDDING_DIM (${expectedDim}) does not match the migration's vector(${migrationDim}).`);
  failed = true;
}

console.log('');
if (failed) {
  console.error(
    'MISMATCH. Fix all three of: EMBEDDING_MODEL, EMBEDDING_DIM, and vector(N) in ' +
    `${MIGRATION_FILE} — and if any content is already ingested, it must be re-embedded. ` +
    'See docs/setup.md step 3.'
  );
  process.exit(1);
}

console.log(`PASS — ${model} returns ${expectedDim}-dim vectors, matching EMBEDDING_DIM and the migration.`);
console.log('Safe to ingest: npm run ingest');
