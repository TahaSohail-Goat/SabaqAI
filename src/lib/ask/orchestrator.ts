import type { AskResponse, AskScope, Language, QuestionUnderstanding, AskInterpretation, EvidenceChunk, TeachingAnswer, GroundedAskResult, QuizReviewContext } from '../types';
import { evaluateConfidence } from '../ai/guardrail';
import { getNearestChapters } from '../ai/retrieval';
import { askRequestSchema, scopeSchema, understandingSchema, teachingSchema, reviewSchema } from './contracts';
import { AskFailure, checkDeadline, type AskConfig } from './config';
import { protectedSpans, preservationFailures, optionPreservationFailures } from './preservation';
import { issueClarification, resumeClarification } from './clarification';
import { assembleEvidence, independentSeeds, makeBoundary, scoredEvidence, type AskRetrieval } from './evidence';
import { checkTeaching, checkReview, citationsFor } from './validation';
import type { AskProvider } from './provider';
import { QUESTION_UNDERSTANDING_PROMPT, UNDERSTANDING_VERSION } from '../../prompts/question-understanding';
import { TEACHING_PROMPT, TEACHING_VERSION } from '../../prompts/grounded-answer';
import { SUPPORT_PROMPT, SUPPORT_VERSION, REPAIR_PROMPT } from '../../prompts/ask-support-review';
import { QUIZ_TEACHING_RULES, QUIZ_SUPPORT_RULES, QUIZ_REVIEW_VERSION } from '../../prompts/quiz-review';
import { quizTeachingSchema, quizSupportSchema } from '../quiz/explain-contracts';

export interface AskTrace {
  mode?: 'student_question' | 'quiz_review';
  understanding?: string; retrievalQueries: number; seeds: number; expanded: number; context: number;
  gate?: string; gateReason?: string; coverage?: string; truncated?: boolean; tokens?: number;
  citationRejections: number; supportRejections: number; repairs: number;
  durations: Record<string, number>; sourceIds: string[];
}
export interface AskDependencies {
  provider: AskProvider; retrieval: AskRetrieval; config: AskConfig; signal: AbortSignal;
  requestId: string; owner: string; trace: AskTrace;
  log?: (entry: { scope: AskScope; language: Language; evidence: EvidenceChunk[]; decision: 'PASS' | 'BORDERLINE' | 'REFUSE'; reason?: string; top1: number; support: number; cited: string[] }) => Promise<void>;
}

export function runAsk(value: unknown, deps: AskDependencies): Promise<AskResponse>;
export function runAsk(value: unknown, deps: AskDependencies, assessment: QuizReviewContext): Promise<GroundedAskResult>;
export async function runAsk(value: unknown, deps: AskDependencies, assessment?: QuizReviewContext): Promise<GroundedAskResult> {
  const { provider, retrieval, config, signal, requestId, owner, trace } = deps;
  trace.mode = assessment ? 'quiz_review' : 'student_question';
  let calls = 0;
  const json: AskProvider['json'] = async (...args) => {
    checkDeadline(signal);
    if (calls >= config.calls) throw new AskFailure('unavailable', 503, true);
    calls++;
    return provider.json(...args);
  };
  const parsed = askRequestSchema.safeParse(value);
  if (!parsed.success) throw new AskFailure('invalid_request', 400);
  const input = parsed.data;
  const scopeResult = scopeSchema.safeParse({ board: input.board, classLevel: input.classLevel, subject: input.subject, sourceType: input.sourceType, ...(input.chapterNo === undefined ? {} : { chapterNo: input.chapterNo }), ...(input.sourceId ? { sourceId: input.sourceId } : {}) });
  if (!scopeResult.success || input.question.length > config.maxInput) throw new AskFailure('invalid_request', 400);
  const scope = scopeResult.data;
  // Only the server-side service supplies this third argument. HTTP inputs are strict and
  // cannot select this mode, skip understanding or supply assessment keys.
  const assessmentContext = assessment ? { questionType: assessment.questionType, options: assessment.options,
    submittedResponse: assessment.response, expectedAnswer: assessment.expectedAnswer, credit: assessment.credit } : undefined;
  const instruction = TEACHING_PROMPT + (assessment ? QUIZ_TEACHING_RULES : '');
  const outputSchema = assessment ? quizTeachingSchema : teachingSchema;
  let question = input.question, attempt = 1;
  let understanding: QuestionUnderstanding | undefined;
  const stage = async <T>(name: string, action: () => Promise<T>) => {
    checkDeadline(signal); const start = Date.now();
    try { return await action(); } finally { trace.durations[name] = (trace.durations[name] ?? 0) + Date.now() - start; }
  };
  if (input.clarification) {
    const context = resumeClarification(input.clarification.context, input.question, scope, input.language, owner);
    attempt = context.attempt + 1;
    if (attempt > 2) throw new AskFailure('invalid_clarification', 400);
    if (input.clarification.optionId) {
      const selected = context.understanding.clarification?.options.find((o) => o.id === input.clarification!.optionId);
      if (!selected) throw new AskFailure('invalid_clarification', 400);
      question = selected.interpretedQuestion;
      understanding = { ...context.understanding, status: 'ready', normalizedQuestion: question, retrievalQuestion: question, ambiguityReasons: [], clarification: null };
    } else {
      question = input.clarification.freeText!;
      if (question.length > config.maxInput) throw new AskFailure('invalid_request', 400);
    }
  }
  if (!understanding && config.understanding) {
    try {
      understanding = understandingSchema.parse(await stage('understanding', () => json('understanding', QUESTION_UNDERSTANDING_PROMPT, {
        version: UNDERSTANDING_VERSION, scope, answerLanguage: input.language, question,
        originalQuestion: input.question, protectedSpans: protectedSpans(question), isFreeTextClarification: Boolean(input.clarification),
      }, understandingSchema)));
    } catch (error) {
      trace.understanding = 'error';
      if (error instanceof AskFailure) throw error;
      throw new AskFailure('invalid_output', 502, true);
    }
  }
  understanding ??= { status: 'ready', normalizedQuestion: question, retrievalQuestion: question, inputLanguage: 'other', intent: 'other', concepts: [], corrections: [], ambiguityReasons: [], clarification: null };
  if (understanding.status === 'ready' && [understanding.normalizedQuestion!, understanding.retrievalQuestion!].some((q) => preservationFailures(question, q).length)) {
    understanding = { ...understanding, status: 'needs_clarification', normalizedQuestion: null, retrievalQuestion: null,
      ambiguityReasons: ['A meaningful quantity, condition or scientific term changed.'],
      clarification: { question: 'Please write the complete question again, keeping its quantities, units and conditions.', options: [], allowFreeText: true } };
  }
  trace.understanding = assessment ? 'structured_assessment' : understanding.status;
  if (understanding.status === 'needs_clarification') {
    if (attempt >= 2) throw new AskFailure('invalid_clarification', 400);
    const clarification = understanding.clarification!;
    if (clarification.options.some((o) => optionPreservationFailures(question, o.interpretedQuestion).length)) throw new AskFailure('invalid_output', 502, true);
    return { status: 'needs_clarification', requestId, originalQuestion: input.question, question: clarification.question,
      options: clarification.options.map(({ id, label }) => ({ id, label })), allowFreeText: true,
      context: issueClarification({ originalQuestion: input.question, scope, language: input.language, owner, attempt, understanding }, config.ttl) };
  }
  const interpretation: AskInterpretation = { originalQuestion: input.question, normalizedQuestion: understanding.normalizedQuestion!, retrievalQuestion: understanding.retrievalQuestion! };
  trace.retrievalQueries = 1;
  const seeds = independentSeeds(await stage('retrieval', () => retrieval.seeds(interpretation.retrievalQuestion, scope, config, signal, { concepts: understanding.concepts, durations: trace.durations, allowUnselectedSource: Boolean(assessment) })), scope).slice(0, config.seeds);
  trace.seeds = seeds.length;
  const neighbors = config.expansion && seeds.length ? await stage('expansion', () => retrieval.neighbors(seeds, scope, config, signal)) : [];
  trace.expanded = neighbors.length;
  const assembled = await stage('evidence_selection', async () => assembleEvidence(seeds, neighbors, scope, understanding.concepts, config, interpretation.retrievalQuestion));
  const evidence = assembled.evidence;
  let boundary = makeBoundary(scope, evidence, assembled.truncated);
  const envelope = { version: TEACHING_VERSION, originalQuestion: input.question, confirmedQuestion: interpretation.normalizedQuestion,
    retrievalQuestion: interpretation.retrievalQuestion, answerLanguage: input.language, scope, questionIntent: understanding.intent, boundary, evidence,
    ...(assessment ? { assessmentContext, assessmentVersion: QUIZ_REVIEW_VERSION } : {}) };
  // Only the exact final evidence payload authorizes the gate and citation allowlist.
  // Pre-gate normalization interprets input; no model call of any kind occurs after REFUSE.
  if (evidence.length) {
    trace.tokens = await stage('token_count', () => provider.countTokens(instruction, envelope));
    if (trace.tokens > config.tokens) {
      // One bounded reduction/recount: measured tokens inform selection, but only the second
      // exact count authorizes this final payload. Never cut a question, formula or chunk in half.
      const ratio = Math.max(0, (config.tokens - 2500) / trace.tokens);
      const targetBytes = Math.floor(Buffer.byteLength(JSON.stringify(evidence), 'utf8') * ratio);
      do { evidence.pop(); } while (evidence.length && Buffer.byteLength(JSON.stringify(evidence), 'utf8') > targetBytes);
      boundary = makeBoundary(scope, evidence, true); envelope.boundary = boundary;
      if (evidence.length) {
        trace.tokens = await stage('token_recount', () => provider.countTokens(instruction, envelope));
        if (trace.tokens > config.tokens) throw new AskFailure('invalid_output', 502, true);
      }
    }
  }
  trace.context = evidence.length; trace.truncated = boundary.truncated; trace.sourceIds = boundary.sourceIds;
  const scored = scoredEvidence(evidence);
  const gate = evaluateConfidence(scored);
  trace.gate = gate.decision; trace.gateReason = gate.reason;
  const log = (reason?: string, cited: string[] = []) => deps.log?.({ scope, language: input.language, evidence, decision: gate.decision, reason, top1: gate.top1, support: gate.support, cited });
  const refuse = (reason: 'no_candidates' | 'low_similarity' | 'ungrounded_output'): AskResponse => ({
    status: 'refused', requestId, interpretation, reason, nearestChapters: getNearestChapters(scored),
    message: input.language === 'ur' ? 'منتخب مواد میں اس سوال کے لیے کافی ثبوت نہیں ملے، اس لیے ہم اندازہ نہیں لگائیں گے۔' : 'The retrieved material does not support a reliable answer to this question, so we will not guess.',
    suggestion: input.language === 'ur' ? 'براہ کرم سوال کو مزید واضح کریں یا متعلقہ باب منتخب کریں۔' : 'Try a more specific question or explicitly select a relevant chapter.',
  });
  if (gate.decision === 'REFUSE') { await log(gate.reason); return refuse(gate.reason ?? 'low_similarity'); }
  let raw = await stage('explanation', () => json('explanation', instruction, envelope, outputSchema));
  let answer: TeachingAnswer;
  let assessmentVerdict: 'consistent' | 'conflict' | 'insufficient' | undefined;
  let assessmentReferences: { responseComparisonIds: string[]; expectedAnswerReasonIds: string[] } | undefined;
  try {
    if (assessment) {
      const checked = quizTeachingSchema.parse(raw);
      assessmentVerdict = checked.assessment.verdict;
      const groups = [checked.assessment.statementIds, checked.assessment.responseComparisonIds, checked.assessment.expectedAnswerReasonIds];
      if (assessmentVerdict === 'insufficient') { await log('ungrounded_output'); return refuse('ungrounded_output'); }
      if (groups.some((ids) => !ids.length || new Set(ids).size !== ids.length || ids.some((id) => !checked.statements.some((s) => s.id === id)))) {
        await log('ungrounded_output'); return refuse('ungrounded_output');
      }
      assessmentReferences = { responseComparisonIds: checked.assessment.responseComparisonIds, expectedAnswerReasonIds: checked.assessment.expectedAnswerReasonIds };
      const { assessment: _assessment, ...teaching } = checked;
      raw = teaching;
    }
    let checked = checkTeaching(raw, evidence, input.language, interpretation.normalizedQuestion);
    if (checked.failures.length) {
      trace.citationRejections = checked.failures.filter((f) => f.includes('citation')).length;
      if (!config.repair) { await log('ungrounded_output'); return refuse('ungrounded_output'); }
      trace.repairs++;
      raw = await stage('repair', () => json('repair', REPAIR_PROMPT, { envelope, previous: raw, failures: checked.failures }, teachingSchema));
      checked = checkTeaching(raw, evidence, input.language, interpretation.normalizedQuestion);
      if (checked.failures.length) { await log('ungrounded_output'); return refuse('ungrounded_output'); }
    }
    answer = checked.answer;
  } catch (error) {
    if (error instanceof AskFailure) throw error;
    throw new AskFailure('invalid_output', 502, true);
  }
  if (!answer.answerable) { await log('ungrounded_output'); return refuse('ungrounded_output'); }
  if (config.review) {
    let review;
    try {
      const rawReview = await stage('support_review', () => json('review', SUPPORT_PROMPT + (assessment ? QUIZ_SUPPORT_RULES : ''), { version: SUPPORT_VERSION, confirmedQuestion: interpretation.normalizedQuestion, answer,
        // Other allowed passages may expose a missing condition/conflict, but cannot rescue
        // an unsupported claim: each verdict's references must still be in that claim's IDs.
        evidence, scope, ...(assessment ? { assessmentContext, assessmentReferences, proposedAssessmentVerdict: assessmentVerdict } : {}) }, assessment ? quizSupportSchema : reviewSchema));
      let reviewValue = rawReview;
      if (assessment) {
        const { assessmentVerdict: verdict, responseComparisonSupported, expectedAnswerReasonSupported, ...support } = quizSupportSchema.parse(rawReview);
        if (verdict === 'insufficient' || verdict !== assessmentVerdict || !responseComparisonSupported || !expectedAnswerReasonSupported) { await log('ungrounded_output'); return refuse('ungrounded_output'); }
        reviewValue = support;
      }
      review = checkReview(reviewValue, answer);
    } catch (error) {
      if (error instanceof AskFailure) throw error;
      throw new AskFailure('invalid_output', 502, true);
    }
    trace.supportRejections = review.verdicts.filter((v) => v.verdict !== 'supported').length;
    if (!review.coreSupported || !review.coherent || trace.supportRejections) {
      // Never blindly filter a causal chain. Repair needs another complete validation/review;
      // the four-call cap intentionally disallows a second review after support failure.
      await log('ungrounded_output'); return refuse('ungrounded_output');
    }
  }
  const citations = citationsFor(answer, evidence);
  if (!citations.ok) { await log('ungrounded_output'); return refuse('ungrounded_output'); }
  boundary = { ...boundary, coverage: answer.coverage,
    coveredAspects: answer.statements.map((s) => ({ aspect: s.aspect, chunkIds: s.chunkIds })),
    missingRequestedAspects: answer.missingAspects };
  trace.coverage = boundary.coverage;
  await log(undefined, citations.citations.map((c) => c.chunkId));
  const explanation: Extract<AskResponse, { status: 'answered' }> = { status: 'answered', requestId, interpretation, confidence: { band: gate.decision === 'PASS' ? 'high' : 'medium', top1: gate.top1, support: gate.support },
    language: input.language, statements: answer.statements, blocks: answer.blocks, citations: citations.citations, boundary,
    notCovered: answer.missingAspects.length ? `${input.language === 'ur' ? 'حاصل شدہ مواد میں ان پہلوؤں کے لیے کافی ثبوت نہیں: ' : 'The retrieved material does not establish: '}${answer.missingAspects.join('; ')}` : null,
    supportReview: config.review ? 'model_reviewed' : 'disabled' };
  return assessmentVerdict === 'conflict' ? { status: 'assessment_review', explanation } : explanation;
}

export function newTrace(): AskTrace {
  return { retrievalQueries: 0, seeds: 0, expanded: 0, context: 0, citationRejections: 0, supportRejections: 0, repairs: 0, durations: {}, sourceIds: [] };
}
