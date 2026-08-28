// Sabaq AI — pre-ingestion dimension probe. Dev-only utility.
//
//   node scripts/verify-embeddings.mjs
//
// Sends ONE probe string through the configured embedding provider and checks the
// returned vector length against EMBEDDING_DIM (which must equal the migration's
// vector(N)). Run this before `npm run ingest`: a dimension mismatch fails every
// insert with a database error that never mentions the model — catching it here
// costs one API call instead of an afternoon.
//
// Exit 0 = dimensions match, safe to ingest. Exit 1/2 = fix config first.
import { readFileSync } from 'node:fs';

// Minimal .env.local parser (dotenv is not a dependency).
const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const apiKey = env.EMBEDDING_API_KEY;
const baseUrl = (env.EMBEDDING_BASE_URL || 'https://api.jina.ai/v1').replace(/\/$/, '');
const model = env.EMBEDDING_MODEL || 'jina-embeddings-v3';
const expectedDim = Number(env.EMBEDDING_DIM ?? 1024);

if (!apiKey) {
  console.error('EMBEDDING_API_KEY is not set in .env.local — paste your key first (docs/setup.md step 3).');
  process.exit(2);
}

console.log(`Provider:  ${baseUrl}`);
console.log(`Model:     ${model}`);
console.log(`Expecting: ${expectedDim} dimensions (must match vector(${expectedDim}) in the migration)`);

const res = await fetch(`${baseUrl}/embeddings`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model,
    input: ['dimension verification probe'],
    dimensions: expectedDim,
    encoding_format: 'float',
  }),
});

if (!res.ok) {
  console.error(`Provider error ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 400)}`);
  process.exit(1);
}

const payload = await res.json();
const vector = payload.data?.[0]?.embedding;
if (!Array.isArray(vector)) {
  console.error('No embedding returned. Response:', JSON.stringify(payload).slice(0, 400));
  process.exit(1);
}

console.log(`Returned:  ${vector.length} dimensions`);
if (vector.length !== expectedDim) {
  console.error(
    `MISMATCH — the model returned ${vector.length} but EMBEDDING_DIM is ${expectedDim}. ` +
    `Do NOT ingest until these agree (model setting, EMBEDDING_DIM, and the migration's vector(N)).`
  );
  process.exit(1);
}
console.log('OK — dimensions match. Safe to ingest.');
