// SERVER ONLY. Routes authenticate; adapters load assessment context. This service checks the
// supplied server principal against every scope again. No HTTP body may supply this principal.
import type { AskScope, GroundedAskResult, Language, QuizReviewContext, EvidenceChunk } from '../types';
import { askRequestSchema, scopeSchema } from './contracts';
import { quizReviewContextSchema } from '../quiz/explain-contracts';
import { AskFailure } from './config';
import { runAsk, type AskDependencies } from './orchestrator';
import { independentSeeds } from './evidence';
import { citationFromChunk } from '../ai/citation';

export interface AskAuthorization {
  userId: string | null;
  profile: { board: string; classLevel: number; subjects: string[] } | null;
}
export type GroundedAskInput =
  | { mode: 'student_question'; request: unknown }
  | { mode: 'quiz_review'; review: QuizReviewContext; language: Language };

export function authorizeAskScope(scope: AskScope, authorization: AskAuthorization, requireUser = false) {
  if (!scopeSchema.safeParse(scope).success) throw new AskFailure('invalid_request', 400);
  const { userId, profile } = authorization;
  if (requireUser && !userId) throw new AskFailure('invalid_request', 401);
  if (userId && !profile) throw new AskFailure('unavailable', 503, true);
  if (userId && profile && (profile.board !== scope.board || profile.classLevel !== scope.classLevel || !profile.subjects.includes(scope.subject)))
    throw new AskFailure('invalid_request', 403);
}

export async function runAskService(input: GroundedAskInput, authorization: AskAuthorization, deps: AskDependencies): Promise<GroundedAskResult> {
  if (input.mode === 'student_question') {
    const parsed = askRequestSchema.safeParse(input.request);
    if (!parsed.success) throw new AskFailure('invalid_request', 400);
    const { board, classLevel, subject, sourceType, chapterNo, sourceId } = parsed.data;
    authorizeAskScope({ board, classLevel, subject, sourceType, ...(chapterNo === undefined ? {} : { chapterNo }), ...(sourceId ? { sourceId } : {}) }, authorization);
    // Cache the same scoped search, never a model draft or its citation choices.
    let retrieved: EvidenceChunk[] | undefined;
    const retrieval = { ...deps.retrieval, seeds: async (...args: Parameters<AskDependencies['retrieval']['seeds']>) => {
      retrieved = await deps.retrieval.seeds(...args); return retrieved;
    } };
    try { return await runAsk(parsed.data, { ...deps, retrieval }); }
    catch (error) {
      // This is source browsing, not a generated/grounded answer or a relaxed gate.
      // Validation failures, final refusals, cancellation and Quiz never enter this path.
      if (!(error instanceof AskFailure) || error.code !== 'unavailable' || !deps.provider.bothProvidersFailed
        || deps.signal.aborted || !sourceId || chapterNo === undefined || parsed.data.clarification) throw error;
      const started = Date.now();
      try {
        const scope = { board, classLevel, subject, sourceType, chapterNo, sourceId };
        // When understanding failed before search, use the unchanged full original question.
        // This invokes retrieval only, not another LLM; exact identity is verified by the adapter.
        if (!retrieved) deps.trace.retrievalQueries++;
        const rows = retrieved ?? await deps.retrieval.seeds(parsed.data.question, scope, deps.config, deps.signal,
          { concepts: [], durations: deps.trace.durations });
        const citations = independentSeeds(rows, scope).filter((row) => row.content.trim()).slice(0, 3).map(citationFromChunk);
        if (deps.signal.aborted || !citations.length) throw error;
        deps.trace.sourcesOnly = true;
        deps.trace.sourceCitationCount = citations.length;
        deps.trace.sourceIds = [sourceId];
        return { status: 'sources_only', requestId: deps.requestId, originalQuestion: parsed.data.question,
          language: parsed.data.language, scope, reason: 'providers_unavailable', citations,
          message: parsed.data.language === 'ur'
            ? 'دونوں وضاحتی خدمات دستیاب نہیں ہیں۔ کوئی وضاحت تیار نہیں کی گئی۔ یہ صرف تلاش میں ملنے والے نصابی اقتباسات ہیں؛ ان سے سوال کا جواب ثابت نہیں کیا گیا۔'
            : 'Both explanation services are unavailable. No explanation was generated. These are search results from your selected source; they have not been assessed as answering your question.' };
      } catch { throw error; }
      finally { deps.trace.durations.sources_only = Date.now() - started; }
    }
  }
  if (input.mode !== 'quiz_review') throw new AskFailure('invalid_request', 400);
  const review = quizReviewContextSchema.parse(input.review);
  authorizeAskScope(review.scope, authorization, true);
  if (review.ownerId !== authorization.userId || !['en', 'ur'].includes(input.language)) throw new AskFailure('invalid_request', 403);
  // Structured assessment wording is never normalized or student-replaceable. Review is mandatory
  // in this mode, including when the optional student-question review setting is disabled.
  return runAsk({ ...review.scope, question: review.question, language: input.language }, {
    ...deps, config: { ...deps.config, understanding: false, review: true, repair: false },
  }, review);
}
