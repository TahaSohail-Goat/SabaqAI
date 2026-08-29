// Sabaq AI — dev-only SQL runner for schema testing and ad-hoc queries against the
// live database. NOT part of the app; nothing in src/ imports this.
//
//   node scripts/dev-db-sql.mjs supabase/tests/001_schema_torture.sql
//
// Credentials come from .env.local: SUPABASE_DB_HOST, SUPABASE_DB_USER,
// SUPABASE_DB_PASSWORD (session-pooler credentials — see docs/setup.md or the
// Supabase dashboard: Project Settings → Database → Connection string).
// The password is read, never printed.
//
// This script needs node-postgres, which is deliberately NOT a project dependency.
// Either install it as a devDependency:
//   npm i -D pg
// or keep the repo clean with a throwaway install (what we do):
//   npm install pg --prefix "$env:TEMP\sabaq-dbtest"
// Both resolution paths are tried below.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { inspect } from 'node:util';
import { join } from 'node:path';

function loadPg() {
  try {
    return createRequire(join(process.cwd(), 'package.json'))('pg');
  } catch {
    const tempPkg = join(process.env.TEMP ?? '', 'sabaq-dbtest', 'noop.js');
    return createRequire(tempPkg)('pg');
  }
}
const { Client } = loadPg();

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('usage: node scripts/dev-db-sql.mjs <path-to-sql-file>');
  process.exit(2);
}

// Minimal .env parser (dotenv is not a dependency either). Next.js itself reads both
// .env and .env.local, so this checks .env.local first, then falls back to .env —
// whichever the project is actually using.
const env = {};
let envFile = '.env.local';
try {
  readFileSync(envFile, 'utf8');
} catch {
  envFile = '.env';
}
for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

for (const key of ['SUPABASE_DB_HOST', 'SUPABASE_DB_USER', 'SUPABASE_DB_PASSWORD']) {
  if (!env[key]) {
    console.error(`missing ${key} in ${envFile} — Project Settings → Database → Connection string (session pooler)`);
    process.exit(2);
  }
}

// TLS verification stays ON. If your system CA store doesn't chain Supabase's
// certificate, download the CA bundle (Project Settings → Database → SSL) and point
// SUPABASE_DB_CA_CERT at it — never disable verification instead.
const ssl = { rejectUnauthorized: true };
if (env.SUPABASE_DB_CA_CERT) {
  ssl.ca = readFileSync(env.SUPABASE_DB_CA_CERT, 'utf8');
}

const client = new Client({
  host: env.SUPABASE_DB_HOST,
  port: 5432,
  user: env.SUPABASE_DB_USER,
  password: env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl,
});
client.on('notice', (m) => console.log('NOTICE:', m.message));

try {
  await client.connect();
  const sql = readFileSync(sqlFile, 'utf8');
  const started = Date.now();
  const res = await client.query(sql); // simple protocol: multi-statement scripts work
  const results = Array.isArray(res) ? res : [res];
  let shown = 0;
  for (const r of results) {
    if (r && r.rows && r.rows.length) {
      shown += 1;
      console.log(`--- result set ${shown} (${r.rows.length} rows) ---`);
      console.log(inspect(r.rows, { depth: 4, colors: false, compact: 3 }));
    }
  }
  console.log(`OK in ${Date.now() - started}ms`);
} catch (err) {
  console.error(`ERROR ${err.code || ''}: ${err.message}`);
  if (err.detail) console.error(`DETAIL: ${err.detail}`);
  if (err.hint) console.error(`HINT: ${err.hint}`);
  if (err.where) console.error(`CONTEXT: ${err.where}`);
  if (err.position && /^\d+$/.test(String(err.position))) {
    // position is a 1-based character offset into the file — map it to a line number
    const sql = readFileSync(sqlFile, 'utf8');
    const line = sql.slice(0, Number(err.position)).split('\n').length;
    console.error(`at file line ~${line}`);
  }
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
