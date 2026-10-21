// SERVER ONLY. No assessment writes, answer cache or private rubric enters this adapter.
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { QuizExplainResponse, QuizExplainIneligible, QuizReviewContext } from '../types';
import { scopeSchema } from '../ask/contracts';
import { runAskService, authorizeAskScope, type AskAuthorization } from '../ask/service';
import type { AskDependencies } from '../ask/orchestrator';
import { AskFailure, checkDeadline } from '../ask/config';
import { withinDeadline } from '../ask/limits';
import { quizExplainRequestSchema, quizExplainResponseSchema } from './explain-contracts';
import type { QuizReviewStore } from './explain-store';
import { TEACHING_VERSION } from '../../prompts/grounded-answer';
import { SUPPORT_VERSION } from '../../prompts/ask-support-review';
import { QUIZ_REVIEW_VERSION } from '../../prompts/quiz-review';

const attemptSchema = z.object({ id: z.uuid(), user_id: z.uuid(), quiz_id: z.uuid(), submitted_at: z.iso.datetime({ offset: true }).nullable() });
const snapshotSchema = z.object({
  quizId: z.uuid(), questionId: z.uuid(), question: z.string().min(1).max(4000), questionType: z.enum(['mcq', 'short', 'long']),
  options: z.array(z.string().min(1).max(1600)).max(8), expectedAnswer: z.string().min(1).max(8000), scope: scopeSchema,
  selectedIndex: z.number().int().nonnegative().nullable(), answerText: z.string().max(8000).nullable(),
  pointsAwarded: z.number().finite().nonnegative().nullable(), pointsPossible: z.number().finite().positive().nullable(),
  gradingState: z.string().max(32).nullable(), correct: z.boolean(),
}).strict();
const answerSchema = z.object({ question_id: z.uuid(), review_version: z.uuid().nullable(), review_snapshot: z.unknown(),
  selected_option_index: z.number().int().nullable(), answer_text: z.string().nullable(), is_correct: z.boolean(),
  points_awarded: z.coerce.number().finite().nullable(), points_possible: z.coerce.number().finite().nullable(), grading_state: z.string().nullable(),
});
export class QuizExplainFailure extends Error {
  constructor(public code: 'unauthenticated' | 'forbidden' | 'not_found' | 'duplicate_request', public httpStatus: number, public retryAfterSeconds?: number) { super(code); }
}
export interface QuizExplainDependencies extends AskDependencies {
  authorization: AskAuthorization;
  store: QuizReviewStore;
}

export async function explainQuiz(value: unknown, deps: QuizExplainDependencies): Promise<QuizExplainResponse> {
  const { authorization, store, signal, requestId, trace } = deps;
  const parsed = quizExplainRequestSchema.safeParse(value);
  if (!parsed.success) throw new AskFailure('invalid_request', 400);
  if (!authorization.userId) throw new QuizExplainFailure('unauthenticated', 401);
  if (!authorization.profile) throw new QuizExplainFailure('forbidden', 403);
  const input = parsed.data;
  const ineligible = (reason: QuizExplainIneligible): QuizExplainResponse => ({ status: 'not_eligible', requestId, reason });
  const loadStart = Date.now();
  const attemptRaw = await withinDeadline(store.attempt(input.attemptId, authorization.userId, signal), signal);
  if (!attemptRaw) throw new QuizExplainFailure('not_found', 404);
  const attempt = attemptSchema.parse(attemptRaw);
  if (attempt.user_id !== authorization.userId || attempt.id !== input.attemptId) throw new QuizExplainFailure('not_found', 404);
  if (!attempt.submitted_at) return ineligible('not_submitted');
  const answerRaw = await withinDeadline(store.answer(attempt.id, input.questionId, signal), signal);
  if (!answerRaw) throw new QuizExplainFailure('not_found', 404);
  const answer = answerSchema.parse(answerRaw);
  if (answer.question_id !== input.questionId) throw new QuizExplainFailure('not_found', 404);
  if (!answer.review_version || !answer.review_snapshot) return ineligible('snapshot_unavailable');
  const snapshotResult = snapshotSchema.safeParse(answer.review_snapshot);
  if (!snapshotResult.success) return ineligible('unsupported_context');
  const snapshot = snapshotResult.data;
  if (snapshot.quizId !== attempt.quiz_id || snapshot.questionId !== input.questionId) throw new QuizExplainFailure('not_found', 404);
  try { authorizeAskScope(snapshot.scope, authorization, true); } catch (error) {
    if (error instanceof AskFailure && error.httpStatus === 403) throw new QuizExplainFailure('forbidden', 403);
    throw error;
  }
  if (snapshot.gradingState !== 'graded' || answer.grading_state !== 'graded' || snapshot.pointsAwarded === null || snapshot.pointsPossible === null)
    return ineligible('grading_unavailable');
  if (answer.selected_option_index !== snapshot.selectedIndex || answer.answer_text !== snapshot.answerText || answer.is_correct !== snapshot.correct
    || answer.points_awarded !== snapshot.pointsAwarded || answer.points_possible !== snapshot.pointsPossible) return ineligible('grading_changed');
  if (snapshot.pointsAwarded > snapshot.pointsPossible) return ineligible('unsupported_context');
  let response: string;
  if (snapshot.questionType === 'mcq') {
    if (snapshot.selectedIndex === null) return ineligible('unanswered');
    response = snapshot.options[snapshot.selectedIndex];
    if (!response || !snapshot.options.includes(snapshot.expectedAnswer) || snapshot.answerText !== null || snapshot.pointsPossible !== 1
      || snapshot.pointsAwarded !== (snapshot.correct ? 1 : 0) || snapshot.correct !== (response === snapshot.expectedAnswer)) return ineligible('unsupported_context');
  } else {
    if (!snapshot.answerText?.trim()) return ineligible('unanswered');
    if (snapshot.selectedIndex !== null || snapshot.options.length) return ineligible('unsupported_context');
    response = snapshot.answerText;
  }
  if (snapshot.pointsAwarded === snapshot.pointsPossible) return ineligible('correct');
  // A partial written response remains reviewable even if the old half-credit boolean says true.
  if (!snapshot.question.trim() || snapshot.question.length > deps.config.maxInput) return ineligible('unsupported_context');
  const review: QuizReviewContext = { ownerId: authorization.userId, attemptId: attempt.id, questionId: input.questionId, version: answer.review_version,
    scope: snapshot.scope, question: snapshot.question, questionType: snapshot.questionType, options: snapshot.options,
    response, expectedAnswer: snapshot.expectedAnswer, credit: snapshot.pointsAwarded > 0 ? 'partial' : 'incorrect' };
  trace.durations.assessment_load = Date.now() - loadStart;
  // No cached academic result => no stale-evidence cache key or cross-student result reuse.
  // Configuration and model versions matter even for the short duplicate-suppression window.
  const key = createHash('sha256').update(JSON.stringify([review.ownerId, attempt.id, input.questionId, review.version,
    input.language, QUIZ_REVIEW_VERSION, TEACHING_VERSION, SUPPORT_VERSION, process.env.CHAT_MODEL ?? '', deps.config])).digest('hex');
  const token = randomUUID();
  checkDeadline(signal);
  const retry = await withinDeadline(store.claim(key, authorization.userId, token, signal), signal);
  if (retry) throw new QuizExplainFailure('duplicate_request', 429, retry);
  let success = false;
  try {
    const result = await withinDeadline(runAskService({ mode: 'quiz_review', review, language: input.language }, authorization, deps), signal);
    let response: QuizExplainResponse;
    if (result.status === 'answered' || result.status === 'assessment_review') {
      response = { status: result.status === 'answered' ? 'explained' : 'assessment_review', requestId,
        attemptId: attempt.id, questionId: input.questionId, explanation: result.status === 'answered' ? result : result.explanation };
    } else if (result.status === 'refused') response = { status: 'insufficient_support', requestId, refusal: result };
    else throw new AskFailure('invalid_output', 502, true);
    const checked = quizExplainResponseSchema.parse(response);
    success = true;
    return checked;
  } finally {
    // A duplicate is never a waiter on this work. Only the winning request owns cancellation.
    // If it aborts, the old token cannot release a later claim after lease expiry.
    await store.finish(key, token, success).catch(() => {});
  }
}
