import { z } from 'zod';
import { scopeSchema, teachingSchema, reviewSchema, askResponseSchema } from '../ask/contracts';
import type { QuizExplainResponse } from '../types';

export const quizExplainRequestSchema = z.object({ attemptId: z.uuid(), questionId: z.uuid(), language: z.enum(['en', 'ur']).default('en') }).strict();
export const quizReviewContextSchema = z.object({
  ownerId: z.uuid(), attemptId: z.uuid(), questionId: z.uuid(), version: z.uuid(), scope: scopeSchema,
  question: z.string().min(1).max(4000), questionType: z.enum(['mcq', 'short', 'long']),
  options: z.array(z.string().min(1).max(1600)).max(8), response: z.string().min(1).max(8000),
  expectedAnswer: z.string().min(1).max(8000), credit: z.enum(['incorrect', 'partial']),
}).strict();
export const quizTeachingSchema = teachingSchema.extend({ assessment: z.object({
  verdict: z.enum(['consistent', 'conflict', 'insufficient']), statementIds: z.array(z.string()).max(24),
  responseComparisonIds: z.array(z.string()).max(24), expectedAnswerReasonIds: z.array(z.string()).max(24),
}).strict() });
export const quizSupportSchema = reviewSchema.extend({ assessmentVerdict: z.enum(['consistent', 'conflict', 'insufficient']),
  responseComparisonSupported: z.boolean(), expectedAnswerReasonSupported: z.boolean() });

export const quizExplainResponseSchema = z.custom<QuizExplainResponse>((value) => {
  const common = z.object({ requestId: z.string().min(1) });
  const result = z.discriminatedUnion('status', [
    common.extend({ status: z.literal('explained'), attemptId: z.uuid(), questionId: z.uuid(), explanation: askResponseSchema }),
    common.extend({ status: z.literal('assessment_review'), attemptId: z.uuid(), questionId: z.uuid(), explanation: askResponseSchema }),
    common.extend({ status: z.literal('insufficient_support'), refusal: askResponseSchema }),
    common.extend({ status: z.literal('not_eligible'), reason: z.enum(['not_submitted', 'snapshot_unavailable', 'grading_unavailable', 'grading_changed', 'unanswered', 'correct', 'unsupported_context']) }),
    common.extend({ status: z.literal('error'), code: z.enum(['unauthenticated', 'forbidden', 'not_found', 'duplicate_request', 'cancelled', 'invalid_request', 'invalid_clarification', 'rate_limited', 'configuration', 'unavailable', 'invalid_output', 'timeout']), message: z.string(), retryable: z.boolean(), retryAfterSeconds: z.number().int().positive().optional() }),
  ]).safeParse(value);
  if (!result.success) return false;
  if (result.data.status === 'explained' || result.data.status === 'assessment_review') return result.data.explanation.status === 'answered';
  if (result.data.status === 'insufficient_support') return result.data.refusal.status === 'refused';
  return true;
});
