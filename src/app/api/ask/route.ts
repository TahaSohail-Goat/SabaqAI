import { randomUUID, createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { logQuestion } from '@/lib/qa-log';
import { askRequestSchema, scopeSchema } from '@/lib/ask/contracts';
import { readAskConfig, AskFailure } from '@/lib/ask/config';
import { createAskProvider } from '@/lib/ask/provider';
import { liveAskRetrieval, scoredEvidence } from '@/lib/ask/evidence';
import { newTrace } from '@/lib/ask/orchestrator';
import { runAskService } from '@/lib/ask/service';
import { acquireAskSlot, readBoundedJson, withinDeadline } from '@/lib/ask/limits';
import type { AskResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

const messages = {
  invalid_request: 'Enter a complete question and select a valid subject, source and chapter. If this selection was restored, select it again.',
  invalid_clarification: 'These choices expired or no longer match your selection. Please submit a clearer complete question again.',
  rate_limited: 'Please wait a moment before asking again; another question may still be running.',
  configuration: 'The textbook answer service is not configured. Please try again after the service is restored.',
  unavailable: 'The textbook answer service is temporarily unavailable. Your question is still here; please try again.',
  invalid_output: 'The answer service returned an incomplete response. Please try again.',
  timeout: 'This question took too long to process. Your question is still here; please try again.',
};

export async function POST(req: NextRequest) {
  const requestId = randomUUID(), startedAt = Date.now(), trace = newTrace();
  let release: (() => void) | undefined;
  let provider: ReturnType<typeof createAskProvider> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resultStatus = 'error';
  let failureCode: string | undefined;
  let anonymousCookie: string | undefined;
  const setOwnerCookie = (response: NextResponse) => {
    if (anonymousCookie) response.cookies.set('ask-owner', anonymousCookie, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/api/ask', maxAge: 1800 });
    return response;
  };
  try {
    let config;
    try { config = readAskConfig(); } catch { throw new AskFailure('configuration', 503); }
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), config.timeout);
    const signal = AbortSignal.any([req.signal, controller.signal]);
    const body = askRequestSchema.safeParse(await readBoundedJson(req, signal));
    if (!body.success || body.data.question.length > config.maxInput) throw new AskFailure('invalid_request', 400);
    const input = body.data;
    if (!scopeSchema.safeParse({ board: input.board, classLevel: input.classLevel, subject: input.subject, sourceType: input.sourceType, ...(input.chapterNo === undefined ? {} : { chapterNo: input.chapterNo }), ...(input.sourceId ? { sourceId: input.sourceId } : {}) }).success) throw new AskFailure('invalid_request', 400);
    const { user, profile } = await withinDeadline(getCurrentUserAndProfile(), signal);
    // Anonymous Ask remains public. Signed-in selections must match the real profile;
    // a model or unsigned browser field cannot grant another curriculum scope.
    if (user && !profile) throw new AskFailure('unavailable', 503, true);
    if (user && profile && (profile.board !== input.board || profile.classLevel !== input.classLevel || !profile.subjects.includes(input.subject))) throw new AskFailure('invalid_request', 403);
    const existing = req.cookies.get('ask-owner')?.value;
    const anonymous = existing && /^[a-f0-9-]{36}$/.test(existing) ? existing : randomUUID();
    if (!user) anonymousCookie = anonymous;
    const owner = createHash('sha256').update(user ? `user:${user.id}` : `anonymous:${anonymous}`).digest('hex');
    release = acquireAskSlot(owner);
    provider = createAskProvider(config, signal);
    const result = await withinDeadline(runAskService({ mode: 'student_question', request: input }, { userId: user?.id ?? null, profile }, { config, provider, retrieval: liveAskRetrieval, signal, requestId, owner, trace,
      log: async (entry) => logQuestion({ userId: user?.id ?? null, subject: entry.scope.subject,
        questionLanguage: entry.language, top1Score: entry.top1, supportCount: entry.support,
        decision: entry.decision, refusalReason: entry.reason, retrievedChunks: scoredEvidence(entry.evidence),
        citedChunkIds: entry.cited, latencyMs: Date.now() - startedAt }),
    }), signal);
    resultStatus = result.status;
    const response = NextResponse.json(result, { headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } });
    return setOwnerCookie(response);
  } catch (error) {
    const failure = error instanceof AskFailure ? error : new AskFailure('unavailable', 503, true);
    failureCode = failure.code;
    const result: AskResponse = { status: 'error', requestId, code: failure.code, message: messages[failure.code], retryable: failure.retryable };
    return setOwnerCookie(NextResponse.json(result, { status: failure.httpStatus, headers: {
      'Cache-Control': 'no-store', 'X-Request-Id': requestId, ...(failure.httpStatus === 429 ? { 'Retry-After': '60' } : {}),
    } }));
  } finally {
    if (timer) clearTimeout(timer);
    release?.();
    console.info('[ask]', JSON.stringify({ requestId, status: resultStatus, failureCode, ...trace, calls: provider?.calls ?? 0, latencyMs: Date.now() - startedAt }));
  }
}
