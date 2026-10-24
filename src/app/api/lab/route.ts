import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { LabFailure, requireLabScope } from '@/lib/lab/contracts';
import { loadLabEvidence } from '@/lib/lab/evidence';
import { labReceiptStore } from '@/lib/lab/receipts';
import { executeLab, labDeadline } from '@/lib/lab/service';
import { createLabProvider } from '@/lib/lab/provider';
import { signProof, tokenContext } from '@/lib/lab/tokens';
import { readBoundedJson } from '@/lib/ask/limits';
import type { LabBootstrap, LabResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;
const headers = { 'Cache-Control': 'no-store' };
async function context() {
  const { user, profile } = await getCurrentUserAndProfile();
  const result = { userId: user?.id ?? null, profile };
  requireLabScope(result); return result;
}
function errorResponse(error: unknown, requestId: string) {
  const failure = error instanceof LabFailure ? error : new LabFailure('Concept Lab is unavailable. Check the local stack and retry. See PHYSICS_LAB_DEMO.md.', 503, true);
  const response: LabResponse = { status: 'error', requestId, message: failure.message, retryable: failure.retryable };
  return NextResponse.json(response, { status: failure.status, headers: { ...headers, ...(failure.status === 429 ? { 'Retry-After': '60' } : {}) } });
}
export async function GET(request: Request) {
  const id = randomUUID();
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(20000)]);
    const session = await labDeadline(context(), signal), sessionId = randomUUID(), expiresAt = Date.now() + 2 * 60 * 60 * 1000;
    const evidence = await labDeadline(loadLabEvidence(signal), signal);
    const response: LabBootstrap = { sessionId, expiresAt, sessionToken: signProof({ ...tokenContext(session.userId!, sessionId, expiresAt), kind: 'session' }), evidence };
    return NextResponse.json(response, { headers });
  } catch (error) { return errorResponse(error, id); }
}
export async function POST(request: Request) {
  const id = randomUUID();
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25000)]);
    const auth = await labDeadline(context(), signal);
    let raw: unknown;
    try { raw = await readBoundedJson(request, signal); }
    catch { throw new LabFailure('Send a valid lab request under 32 KB, then try again.', 400); }
    const result = await labDeadline(executeLab(raw, { context: auth, signal, evidence: loadLabEvidence,
      receipts: labReceiptStore(), provider: () => createLabProvider(signal) }), signal);
    return NextResponse.json(result, { status: result.status === 'error' ? 503 : 200, headers });
  } catch (error) { return errorResponse(error, id); }
}
