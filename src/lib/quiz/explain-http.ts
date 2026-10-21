import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '../auth/get-current-user';
import { getServiceRoleClient } from '../supabase/admin';
import { AskFailure, readAskConfig } from '../ask/config';
import { acquireAskSlot, readBoundedJson, withinDeadline } from '../ask/limits';
import { newTrace } from '../ask/orchestrator';
import { createAskProvider } from '../ask/provider';
import { liveAskRetrieval } from '../ask/evidence';
import { explainQuiz, QuizExplainFailure } from './explain';
import { quizReviewStore } from './explain-store';
import type { QuizExplainResponse } from '../types';

const live = { authenticate: getCurrentUserAndProfile, database: getServiceRoleClient,
  provider: createAskProvider, retrieval: liveAskRetrieval, config: readAskConfig,
  store: quizReviewStore, slot: acquireAskSlot };

// A dependency seam for deterministic HTTP tests; production always uses the live defaults.
export function createQuizExplainHandler(services: typeof live = live) {

  return async function POST(req: NextRequest) {
    const requestId = randomUUID(), start = Date.now(), trace = newTrace();
    let release: (() => void) | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    let provider: ReturnType<typeof createAskProvider> | undefined;
    let status = 'error';
    try {
      let config;
      try { const selected = services.config(); config = { ...selected, timeout: Math.min(selected.timeout, 110000) }; }
      catch { throw new AskFailure('configuration', 503); }
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), config.timeout);
      const signal = AbortSignal.any([req.signal, controller.signal]);
      const { user, profile } = await withinDeadline(services.authenticate(), signal);
      if (!user) throw new QuizExplainFailure('unauthenticated', 401);
      if (!profile) throw new QuizExplainFailure('forbidden', 403);
      const body = await readBoundedJson(req, signal);
      const db = services.database();
      if (!db) throw new AskFailure('configuration', 503);
      const owner = createHash('sha256').update(`user:${user.id}`).digest('hex');
      release = services.slot(owner);
      // Lazy creation keeps provider configuration checks behind assessment authorization and
      // eligibility. An unauthorized caller must not cause a model client or request to be made.
      const lazyProvider: ReturnType<typeof createAskProvider> = {
        get calls() { return provider?.calls ?? 0; },
        json(...args) { provider ??= services.provider(config, signal); return provider.json(...args); },
        countTokens(...args) { provider ??= services.provider(config, signal); return provider.countTokens(...args); },
      };
      const result = await explainQuiz(body, { authorization: { userId: user.id, profile }, store: services.store(db),
        provider: lazyProvider, config, signal, requestId, owner, trace, retrieval: services.retrieval });
      status = result.status;
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } });
    } catch (error) {
      const failure = error instanceof AskFailure || error instanceof QuizExplainFailure ? error : new AskFailure('unavailable', 503, true);
      const cancelled = req.signal.aborted;
      const code = cancelled ? 'cancelled' : failure.code;
      const retryAfterSeconds = failure instanceof QuizExplainFailure ? failure.retryAfterSeconds : failure.httpStatus === 429 ? 60 : undefined;
      const result: QuizExplainResponse = { status: 'error', requestId, code, retryable: cancelled || (failure instanceof AskFailure ? failure.retryable : failure.httpStatus === 429),
        message: cancelled ? 'The review request was cancelled.' : failure.httpStatus === 429 ? 'A review is running or was recently requested. Keep its result and wait before retrying.'
          : failure.httpStatus === 401 ? 'Sign in to review your submitted answer.' : failure.httpStatus === 403 ? 'This curriculum is not available for your current profile.'
          : failure.httpStatus === 404 ? 'This submitted question could not be found.' : failure.httpStatus === 400 ? 'Send a valid attemptId, questionId and language only.'
          : failure.httpStatus === 504 ? 'The review deadline expired. Please try again later.' : 'The review service is unavailable. Please try again later.',
        ...(retryAfterSeconds ? { retryAfterSeconds } : {}) };
      return NextResponse.json(result, { status: cancelled ? 499 : failure.httpStatus,
        headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId, ...(retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : {}) } });
    } finally {
      if (timer) clearTimeout(timer);
      release?.();
      console.info('[quiz-explain]', JSON.stringify({ requestId, status, ...trace, calls: provider?.calls ?? 0, latencyMs: Date.now() - start }));
    }
  }
}
