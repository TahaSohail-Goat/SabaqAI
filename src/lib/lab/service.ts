import type { LabEvidence, LabResponse, LabRun } from '../types';
import { LAB_FEEDBACK_PROMPT, LAB_PROPOSAL_PROMPT } from '../../prompts/lab';
import { ensureFreshRequest, feedbackSchema, LabFailure, labRequestSchema, proposalSchema, requireLabScope } from './contracts';
import { comparison, normalizeInput, settingsAsInput, solve } from './engine';
import { defaultGuidance, unsupportedQuestion, UNSUPPORTED_MESSAGE, validateFeedback, validateProposal } from './guidance';
import { EXPERIMENTS } from './registry';
import { inputHash, readRun, readSession, signProof, type RunProof, type SessionProof } from './tokens';
import type { LabProvider } from './provider';
import type { LabReceiptStore } from './receipts';

export interface LabDependencies {
  context: { userId: string | null; profile: { board: string; classLevel: number; subjects: string[] } | null };
  evidence(signal: AbortSignal): Promise<LabEvidence>;
  provider(): LabProvider;
  receipts: LabReceiptStore;
  signal: AbortSignal;
  key?: string;
}
export async function labDeadline<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new LabFailure('The lab request timed out or was cancelled. Try again.', 504, true);
  let abort: () => void = () => {};
  const timeout = new Promise<never>((_, reject) => {
    abort = () => reject(new LabFailure('The lab request timed out or was cancelled. Try again.', 504, true));
    signal.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([promise, timeout]); } finally { signal.removeEventListener('abort', abort); }
}
function requireEvidence(evidence: LabEvidence, id: LabRun['result']['settings']['experimentId']) {
  if (!evidence.available[id]) throw new LabFailure(evidence.reasons[id] ?? 'Required evidence is unavailable. Retry after checking the chapter source.', 503, true);
}
function publicRun(proof: RunProof, key?: string): LabRun {
  return { id: proof.id, sessionId: proof.sessionId, inputVersion: proof.inputVersion, inputHash: proof.inputHash,
    evidenceVersion: proof.evidenceVersion, registryVersion: proof.registryVersion, result: solve(proof.input),
    prediction: proof.prediction, reasoning: proof.reasoning, question: proof.question, mode: proof.mode, token: signProof(proof, key) };
}
export async function executeLab(raw: unknown, deps: LabDependencies): Promise<LabResponse> {
  const owner = requireLabScope(deps.context);
  const parsed = labRequestSchema.safeParse(raw);
  if (!parsed.success) throw new LabFailure('Check your settings, units and prediction, then try again. Only the listed lab fields are accepted.', 400);
  const request = parsed.data;
  ensureFreshRequest(request.issuedAt);
  const session = readSession(request.sessionToken, owner, deps.key);
  const envelope = { requestId: request.requestId, inputVersion: request.inputVersion };
  // Reload source rows before cache/model access; an old receipt cannot authorize changed science.
  const evidence = await labDeadline(deps.evidence(deps.signal), deps.signal);
  if (request.action === 'run') {
    requireEvidence(evidence, request.input.experimentId);
    try {
      const next = solve(request.input);
      if (request.baseRunToken) {
        const baseline = readRun(request.baseRunToken, session, deps.key);
        comparison(solve(baseline.input), next);
      }
    } catch (error) { if (error instanceof LabFailure) throw error; throw new LabFailure('Check the parameter bounds, units and comparison settings. Change exactly one value when comparing.', 400); }
  } else if (request.action === 'explain') {
    const proof = readRun(request.runToken, session, deps.key);
    requireEvidence(evidence, proof.input.experimentId);
    if (request.inputVersion !== proof.inputVersion) throw new LabFailure('The response belongs to older settings. Run the current settings first.', 409);
    if (request.compareToken) comparison(solve(readRun(request.compareToken, session, deps.key).input), solve(proof.input));
  } else if (!Object.values(evidence.available).some(Boolean)) throw new LabFailure('No experiment currently has its required scientific evidence. See docs/lab-evidence.md.');

  const hash = inputHash(request);
  const cached = await labDeadline(deps.receipts.claim(owner, request.requestId, hash, deps.signal), deps.signal);
  if (cached) return cached;
  let response: LabResponse;
  try {
    response = await labDeadline(perform(request, session, evidence, deps, envelope), deps.signal);
  } catch (error) {
    const failure = error instanceof LabFailure ? error : new LabFailure('The lab request could not finish. Check the local stack and retry.', 503, true);
    await deps.receipts.finish(owner, request.requestId, hash, { status: 'error', requestId: request.requestId, message: failure.message, retryable: failure.retryable });
    throw failure;
  }
  await deps.receipts.finish(owner, request.requestId, hash, response);
  return response;
}
async function perform(request: ReturnType<typeof labRequestSchema.parse>, session: SessionProof, evidence: LabEvidence, deps: LabDependencies,
  envelope: { requestId: string; inputVersion: string }): Promise<LabResponse> {
  if (request.action === 'run') {
    // A signed, bounded input is retained; results are always recomputed, never trusted from a client.
    const input = settingsAsInput(normalizeInput(request.input));
    const proof: RunProof = { ...session, kind: 'run', id: request.requestId, inputVersion: request.inputVersion,
      inputHash: inputHash(input), input, prediction: request.mode === 'exploration' ? null : request.prediction,
      mode: request.mode, reasoning: request.reasoning, question: request.question };
    return { ...envelope, status: 'run', run: publicRun(proof, deps.key) };
  }
  if (request.action === 'propose') {
    if (unsupportedQuestion(request.question)) return { ...envelope, status: 'unsupported', message: UNSUPPORTED_MESSAGE };
    try {
      const raw = await labDeadline(deps.provider().json(LAB_PROPOSAL_PROMPT,
        { question: request.question, experiments: EXPERIMENTS.filter((e) => evidence.available[e.id]),
          textbook: evidence.citations.map((c) => ({ id: c.chunkId, passage: c.excerpt })) }, proposalSchema), deps.signal);
      const proposal = validateProposal(raw, request.question);
      if (proposal.status === 'proposal') requireEvidence(evidence, proposal.input.experimentId);
      return { ...envelope, ...proposal };
    } catch {
      return { ...envelope, status: 'guidance_unavailable', message: 'Personalized AI guidance is unavailable or returned an invalid proposal. You can still choose a catalogue experiment, confirm the suggested settings, and run the reviewed model.' };
    }
  }
  const proof = readRun(request.runToken, session, deps.key), run = publicRun(proof, deps.key);
  const baseline = request.compareToken ? publicRun(readRun(request.compareToken, session, deps.key), deps.key) : undefined;
  const experiment = EXPERIMENTS.find((entry) => entry.id === run.result.settings.experimentId)!;
  let guidance = defaultGuidance(run);
  // Unsupported questions keep a truthful limitation and reviewed results, without a model call.
  if (proof.question && unsupportedQuestion(proof.question)) guidance.message = UNSUPPORTED_MESSAGE + ' Showing the selected experiment’s reviewed explanation.';
  else {
    try {
      const raw = await labDeadline(deps.provider().json(LAB_FEEDBACK_PROMPT,
        { question: proof.question || experiment.prediction.prompt, run: { id: run.id, inputVersion: run.inputVersion,
          solverVersion: run.result.solverVersion, evidenceVersion: run.evidenceVersion, settings: run.result.settings,
          results: Object.fromEntries(experiment.observations.map((field) => [field, run.result[field]])), turningTime: run.result.turningTime,
          prediction: run.prediction, reasoning: run.reasoning, mode: run.mode },
          baseline: baseline ? { id: baseline.id, settings: baseline.result.settings,
            results: Object.fromEntries(experiment.observations.map((field) => [field, baseline.result[field]])) } : null,
          experiment, textbook: evidence.citations.map((c) => ({ id: c.chunkId, passage: c.excerpt })) }, feedbackSchema), deps.signal);
      guidance = validateFeedback(raw, run, baseline);
    } catch { /* Preserve the reviewed explanation; model prose is never a fallback answer. */ }
  }
  return { ...envelope, status: 'feedback', runId: run.id, guidance };
}
