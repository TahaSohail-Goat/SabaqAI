import type { AskResponse, AskScope, Language, QuestionUnderstanding, AskInterpretation, EvidenceChunk, TeachingAnswer, GroundedAskResult, QuizReviewContext, SemanticEvidenceDecision } from '../types';
import { evaluateConfidence, needsEvidenceAssessment } from '../ai/guardrail';
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
import { checkSufficiency, sufficiencySchema, SUFFICIENCY_PROMPT } from './sufficiency';
import { AskTransientProviderFailure, type ProviderRetryCode } from './transport';

export interface AskTrace {
  mode?: 'student_question' | 'quiz_review';
  understanding?: string; retrievalQueries: number; seeds: number; expanded: number; context: number;
  gate?: string; gateReason?: string; coverage?: string; truncated?: boolean; tokens?: number;
  sufficiency?: 'sufficient' | 'partial' | 'insufficient';
  adequacy?: 'complete' | 'partial' | 'inadequate';
  repairSkipped?: 'budget' | 'no_evidence' | 'already_repaired';
  transportRetries?: number;
  providerRetryCode?: ProviderRetryCode;
  provider?: 'gemini' | 'groq';
  tokenCountMode?: 'exact' | 'estimate_with_usage_check';
  sourcesOnly?: boolean;
  sourceCitationCount?: number;
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
  let transportRetried = false;
  const withTransportRetry = async <T>(action: () => Promise<T>, hasBudget = () => true): Promise<T> => {
    try { return await action(); } catch (error) {
      checkDeadline(signal);
      if (!(error instanceof AskTransientProviderFailure) || transportRetried || !hasBudget()) throw error;
      transportRetried = true;
      trace.transportRetries = 1; trace.providerRetryCode = error.retryCode;
      // One retry across the ENTIRE request, not per stage. Each model attempt is counted;
      // the original signal/deadline and the repair's two-slot reservation remain binding.
      return action();
    }
  };
  const json: AskProvider['json'] = async (...args) => withTransportRetry(async () => {
    checkDeadline(signal);
    if (calls >= config.calls) throw new AskFailure('unavailable', 503, true);
    calls++;
    try { return await provider.json(...args); }
    finally { trace.provider = provider.providerName; trace.tokenCountMode = provider.tokenCountMode; }
  }, () => calls < config.calls);
  const countTokens: AskProvider['countTokens'] = (...args) => withTransportRetry(() => provider.countTokens(...args));
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
    evidenceAssessment: null as SemanticEvidenceDecision | null,
    ...(assessment ? { assessmentContext, assessmentVersion: QUIZ_REVIEW_VERSION } : {}) };
  // Only the exact final evidence payload authorizes the gate and citation allowlist.
  // Pre-gate normalization interprets input; no model call of any kind occurs after REFUSE.
  if (evidence.length) {
    trace.tokens = await stage('token_count', () => countTokens(instruction, envelope));
    if (trace.tokens > config.tokens) {
      // One bounded reduction/recount. Gemini counts exactly; Groq planning estimates are
      // additionally checked against actual provider usage. Never cut a chunk in half.
      const ratio = Math.max(0, (config.tokens - 2500) / trace.tokens);
      const targetBytes = Math.floor(Buffer.byteLength(JSON.stringify(evidence), 'utf8') * ratio);
      do { evidence.pop(); } while (evidence.length && Buffer.byteLength(JSON.stringify(evidence), 'utf8') > targetBytes);
      boundary = makeBoundary(scope, evidence, true); envelope.boundary = boundary;
      if (evidence.length) {
        trace.tokens = await stage('token_recount', () => countTokens(instruction, envelope));
        if (trace.tokens > config.tokens) throw new AskFailure('invalid_output', 502, true);
      }
    }
  }
  trace.context = evidence.length; trace.truncated = boundary.truncated; trace.sourceIds = boundary.sourceIds;
  const scored = scoredEvidence(evidence);
  let sufficiency: SemanticEvidenceDecision | undefined;
  // Low cosine is a triage signal, not proof that the text cannot answer the question.
  // Assess only the exact budgeted, scoped payload BEFORE the final gate. Independent
  // review is mandatory for this path; neither an error nor a disabled review can admit it.
  if (config.review && needsEvidenceAssessment(scored)) {
    try {
      sufficiency = await stage('evidence_sufficiency', async () => checkSufficiency(
        await json('sufficiency', SUFFICIENCY_PROMPT, {
          confirmedQuestion: interpretation.normalizedQuestion, scope, evidence,
        }, sufficiencySchema), evidence));
      trace.sufficiency = sufficiency.coverage;
      if (sufficiency.coverage !== 'insufficient') {
        envelope.evidenceAssessment = sufficiency;
        // The assessment is a plan, not new textbook evidence. Measure the final teaching
        // envelope again rather than silently adding unbudgeted instructions after counting.
        trace.tokens = await stage('assessment_token_count', () => countTokens(instruction, envelope));
        if (trace.tokens > config.tokens) throw new AskFailure('invalid_output', 502, true);
      }
    } catch (error) {
      if (error instanceof AskFailure) throw error;
      throw new AskFailure('invalid_output', 502, true);
    }
  }
  const gate = evaluateConfidence(scored, sufficiency);
  trace.gate = gate.decision; trace.gateReason = gate.reason;
  const log = (reason?: string, cited: string[] = []) => deps.log?.({ scope, language: input.language, evidence, decision: gate.decision, reason, top1: gate.top1, support: gate.support, cited });
  const refuse = (reason: 'no_candidates' | 'low_similarity' | 'ungrounded_output'): AskResponse => ({
    status: 'refused', requestId, interpretation, reason, nearestChapters: getNearestChapters(scored),
    message: reason === 'low_similarity'
      ? (input.language === 'ur' ? 'تلاش کے نتائج اعتماد کی حد سے کم تھے۔ متن کی معنوی کفایت کا جائزہ نہیں لیا گیا۔' : 'The search results did not meet the retrieval confidence requirement. Whether the text answers your question was not assessed.')
      : reason === 'no_candidates'
        ? (input.language === 'ur' ? 'منتخب دائرے میں قابل استعمال اقتباسات حاصل نہیں ہوئے۔' : 'No usable passages were retrieved within your selected scope.')
        : (input.language === 'ur' ? 'منتخب مواد سے قابل اعتماد جواب کی تصدیق نہیں ہو سکی، اس لیے ہم اندازہ نہیں لگائیں گے۔' : 'We could not validate a supported answer from the retrieved passages, so we will not guess.'),
    suggestion: input.language === 'ur' ? 'براہ کرم سوال کو مزید واضح کریں یا متعلقہ باب منتخب کریں۔' : 'Try a more specific question or explicitly select a relevant chapter.',
  });
  if (gate.decision === 'REFUSE') { await log(gate.reason); return refuse(gate.reason ?? 'low_similarity'); }
  // Adequacy cannot be established by citation identity alone or by a disabled review.
  if (!config.review) { await log('ungrounded_output'); return refuse('ungrounded_output'); }
  let raw = await stage('explanation', () => json('explanation', instruction, envelope, outputSchema));
  let answer: TeachingAnswer;
  let assessmentVerdict: 'consistent' | 'conflict' | 'insufficient' | undefined;
  let assessmentReferences: { responseComparisonIds: string[]; expectedAnswerReasonIds: string[] } | undefined;
  const parseCandidate = (value: unknown) => {
    if (assessment) {
      const checked = quizTeachingSchema.parse(value);
      if (assessmentVerdict && checked.assessment.verdict !== assessmentVerdict) return null;
      assessmentVerdict = checked.assessment.verdict;
      const groups = [checked.assessment.statementIds, checked.assessment.responseComparisonIds, checked.assessment.expectedAnswerReasonIds];
      if (assessmentVerdict === 'insufficient') return null;
      if (groups.some((ids) => !ids.length || new Set(ids).size !== ids.length || ids.some((id) => !checked.statements.some((s) => s.id === id)))) {
        return null;
      }
      assessmentReferences = { responseComparisonIds: checked.assessment.responseComparisonIds, expectedAnswerReasonIds: checked.assessment.expectedAnswerReasonIds };
      const { assessment: _assessment, ...teaching } = checked;
      value = teaching;
    }
    const checked = checkTeaching(value, evidence, input.language, interpretation.normalizedQuestion);
    if (sufficiency?.coverage === 'partial' && checked.answer.answerable) {
      checked.answer = { ...checked.answer, coverage: 'partial', missingAspects: [...new Set([...sufficiency.missingAspects, ...checked.answer.missingAspects])] };
    }
    return checked;
  };
  const repair = async (previous: unknown, failures: unknown) => {
    checkDeadline(signal);
    const payload = { envelope, previous, failures };
    const measured = await stage('repair_token_count', () => countTokens(REPAIR_PROMPT, payload));
    if (measured > config.tokens) throw new AskFailure('invalid_output', 502, true);
    trace.repairs++;
    return stage('repair', () => json('repair', REPAIR_PROMPT + (assessment ? QUIZ_TEACHING_RULES : ''), payload, outputSchema));
  };
  try {
    let checked = parseCandidate(raw);
    if (!checked) { await log('ungrounded_output'); return refuse('ungrounded_output'); }
    if (checked.failures.length) {
      trace.citationRejections = checked.failures.filter((f) => f.includes('citation')).length;
      if (!config.repair || calls + 2 > config.calls) { await log('ungrounded_output'); return refuse('ungrounded_output'); }
      raw = await repair(raw, checked.failures);
      checked = parseCandidate(raw);
      if (!checked || checked.failures.length) { await log('ungrounded_output'); return refuse('ungrounded_output'); }
    }
    answer = checked.answer;
  } catch (error) {
    if (error instanceof AskFailure) throw error;
    throw new AskFailure('invalid_output', 502, true);
  }
  if (!answer.answerable) { await log('ungrounded_output'); return refuse('ungrounded_output'); }
  for (;;) {
    let review;
    try {
      const rawReview = await stage(trace.repairs ? 'support_review_after_repair' : 'support_review', () => json('review', SUPPORT_PROMPT + (assessment ? QUIZ_SUPPORT_RULES : ''), { version: SUPPORT_VERSION, confirmedQuestion: interpretation.normalizedQuestion, originalQuestion: input.question, questionIntent: understanding.intent, answer,
        // Other allowed passages may expose a missing condition/conflict, but cannot rescue
        // an unsupported claim: each verdict's references must still be in that claim's IDs.
        evidence, scope, ...(assessment ? { assessmentContext, assessmentReferences, proposedAssessmentVerdict: assessmentVerdict } : {}) }, assessment ? quizSupportSchema : reviewSchema));
      let reviewValue = rawReview;
      if (assessment) {
        const { assessmentVerdict: verdict, responseComparisonSupported, expectedAnswerReasonSupported, ...support } = quizSupportSchema.parse(rawReview);
        if (verdict === 'insufficient' || verdict !== assessmentVerdict || !responseComparisonSupported || !expectedAnswerReasonSupported) { await log('ungrounded_output'); return refuse('ungrounded_output'); }
        reviewValue = support;
      }
      review = checkReview(reviewValue, answer, evidence, { question: interpretation.normalizedQuestion, kind: understanding.intent });
    } catch (error) {
      if (error instanceof AskFailure) throw error;
      throw new AskFailure('invalid_output', 502, true);
    }
    trace.supportRejections = review.verdicts.filter((v) => v.verdict !== 'supported').length;
    trace.adequacy = review.adequacy.verdict;
    if (!review.coreSupported || !review.coherent || trace.supportRejections) {
      // Adequacy repair cannot rescue unsupported academic content or missing evidence.
      await log('ungrounded_output'); return refuse('ungrounded_output');
    }
    if (review.adequacy.verdict === 'inadequate') {
      if (trace.repairs || !review.adequacy.repairEvidence.length || calls + 2 > config.calls) {
        trace.repairSkipped = trace.repairs ? 'already_repaired' : !review.adequacy.repairEvidence.length ? 'no_evidence' : 'budget';
        await log('ungrounded_output'); return refuse('ungrounded_output');
      }
      // Reserve BOTH repair and a fresh independent review. Neither may exceed the original cap.
      try {
        const previousLimitations = [...answer.missingAspects];
        const repaired = parseCandidate(await repair(raw, review.adequacy));
        if (!repaired || repaired.failures.length || !repaired.answer.answerable) { await log('ungrounded_output'); return refuse('ungrounded_output'); }
        answer = repaired.answer;
        if (previousLimitations.length) answer = { ...answer, coverage: 'partial', missingAspects: [...new Set([...previousLimitations, ...answer.missingAspects])] };
      } catch (error) {
        if (error instanceof AskFailure) throw error;
        throw new AskFailure('invalid_output', 502, true);
      }
      continue;
    }
    if (review.adequacy.verdict === 'partial') {
      answer = { ...answer, coverage: 'partial', missingAspects: [...new Set([...answer.missingAspects, ...review.adequacy.missingAspects])] };
    }
    break;
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
