// Retains Next's .env.local-over-.env precedence and refuses a hosted test target.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(), true);
const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://missing.invalid');
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '54321') {
  throw new Error('Lab demo requires the retained local Supabase overlay in .env.local at http://127.0.0.1:54321. Hosted testing is disabled. See PHYSICS_LAB_DEMO.md.');
}
try { await fetch(url + 'auth/v1/health', { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' }, signal: AbortSignal.timeout(5000) }).then((response) => { if (!response.ok) throw new Error(); }); }
catch { throw new Error('Start Docker Desktop and the retained local Supabase containers first. See PHYSICS_LAB_DEMO.md. Do not reset the database.'); }
console.log('Concept Lab: using the retained local Supabase stack (.env.local).');
const port = process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : '3000';
if (!/^\d{4,5}$/.test(port)) throw new Error('Use a numeric local port.');
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '-p', port, '-H', 'localhost'], { stdio: 'inherit', env: process.env });
child.on('exit', (code) => { process.exitCode = code ?? 0; });
