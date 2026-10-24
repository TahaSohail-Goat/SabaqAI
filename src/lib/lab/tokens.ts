import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { labInputSchema } from './engine';
import { EVIDENCE_VERSION, LAB_SCOPE, REGISTRY_VERSION, SOLVER_VERSION } from './registry';
import { LabFailure } from './contracts';

const shared = { owner: z.uuid(), sessionId: z.uuid(), expiresAt: z.number().int(),
  evidenceVersion: z.literal(EVIDENCE_VERSION), registryVersion: z.literal(REGISTRY_VERSION), solverVersion: z.literal(SOLVER_VERSION),
  scope: z.literal('FBISE/9/physics/2/' + LAB_SCOPE.sourceId), };
const sessionSchema = z.object({ ...shared, kind: z.literal('session') }).strict();
const runSchema = z.object({ ...shared, kind: z.literal('run'), id: z.uuid(), inputVersion: z.uuid(), inputHash: z.string().length(64),
  input: labInputSchema, prediction: z.number().finite().nullable(), reasoning: z.string().max(600), question: z.string().max(800), mode: z.enum(['guided', 'exploration']),
}).strict();
export type SessionProof = z.infer<typeof sessionSchema>;
export type RunProof = z.infer<typeof runSchema>;
export function inputHash(value: unknown): string {
  // Schemas rebuild objects in schema order. Hash meaning, not insertion order, so an
  // acceleration run remains valid when its signed input is parsed again for comparison.
  const canonical = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(canonical);
    if (entry && typeof entry === 'object') return Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
    return entry;
  };
  const serialized = JSON.stringify(canonical(value));
  if (serialized === undefined) throw new Error('Cannot hash an undefined lab input.');
  return createHash('sha256').update(serialized).digest('hex');
}
export function tokenContext(owner: string, sessionId: string, expiresAt: number): Omit<SessionProof, 'kind'> {
  return { owner, sessionId, expiresAt, evidenceVersion: EVIDENCE_VERSION, registryVersion: REGISTRY_VERSION, solverVersion: SOLVER_VERSION, scope: ('FBISE/9/physics/2/' + LAB_SCOPE.sourceId) as SessionProof['scope'] };
}
function secret(key?: string) {
  const value = key ?? process.env.LAB_STATE_SECRET ?? process.env.QUIZ_SECRET;
  if (!value || value.length < 32) throw new LabFailure('Concept Lab needs LAB_STATE_SECRET or QUIZ_SECRET with at least 32 characters. See PHYSICS_LAB_DEMO.md.');
  return value;
}
export function signProof(proof: SessionProof | RunProof, key?: string) {
  const payload = Buffer.from(JSON.stringify(proof)).toString('base64url');
  return payload + '.' + createHmac('sha256', secret(key)).update(payload).digest('base64url');
}
function verify(token: string, owner: string, key?: string, now = Date.now()): unknown {
  const signingKey = secret(key);
  try {
    if (token.length > 10000) throw new Error();
    const parts = token.split('.');
    if (parts.length !== 2) throw new Error();
    const expected = createHmac('sha256', signingKey).update(parts[0]).digest();
    const actual = Buffer.from(parts[1], 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const result = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as { owner?: string; expiresAt?: number };
    if (result.owner !== owner || !result.expiresAt || result.expiresAt <= now || result.expiresAt > now + 2 * 60 * 60 * 1000 + 5000) throw new Error();
    return result;
  } catch { throw new LabFailure('This temporary lab session is invalid or expired. Restart the lab.', 409); }
}
export function readSession(token: string, owner: string, key?: string, now?: number) {
  const result = sessionSchema.safeParse(verify(token, owner, key, now));
  if (!result.success) throw new LabFailure('This session uses an unsupported scope or lab version. Restart the lab.', 409);
  return result.data;
}
export function readRun(token: string, session: SessionProof, key?: string, now?: number) {
  const parsed = runSchema.safeParse(verify(token, session.owner, key, now));
  if (!parsed.success) throw new LabFailure('This run uses an unsupported input or lab version. Restart the lab.', 409);
  const run = parsed.data;
  if (run.sessionId !== session.sessionId || run.expiresAt !== session.expiresAt || inputHash(run.input) !== run.inputHash) throw new LabFailure('This run belongs to a different session or input version. Restart the lab.', 409);
  return run;
}
