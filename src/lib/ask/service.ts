// SERVER ONLY. Routes authenticate; adapters load assessment context. This service checks the
// supplied server principal against every scope again. No HTTP body may supply this principal.
import type { AskScope, GroundedAskResult, Language, QuizReviewContext } from '../types';
import { askRequestSchema, scopeSchema } from './contracts';
import { quizReviewContextSchema } from '../quiz/explain-contracts';
import { AskFailure } from './config';
import { runAsk, type AskDependencies } from './orchestrator';

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
    return runAsk(parsed.data, deps);
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
