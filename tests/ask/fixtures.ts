import type { AskScope, EvidenceChunk, QuestionUnderstanding, TeachingAnswer } from '../../src/lib/types';
import type { AskProvider } from '../../src/lib/ask/provider';
import type { AskRetrieval } from '../../src/lib/ask/evidence';
import { readAskConfig } from '../../src/lib/ask/config';
import { newTrace } from '../../src/lib/ask/orchestrator';

// Explicitly invented TEST corpus. These rows are never imported by production retrieval.
export const scope: AskScope = { board: 'FBISE', classLevel: 10, subject: 'physics', sourceType: 'textbook', chapterNo: 14 };
export const request = { ...scope, language: 'en' as const, question: "Explain Ohm's law with an example." };
export const seed: EvidenceChunk & { score: number } = {
  id: 'fixture-ohm-core', board: 'FBISE', classLevel: 10, subject: 'physics', sourceId: 'fixture-source', chapterId: 'fixture-chapter',
  sectionId: 'fixture-section', chunkIndex: 2, sourceLanguage: 'en', role: 'seed', chapterNo: 14, chapterTitle: 'TEST Current Electricity',
  section: 'TEST Ohm law', pageFrom: 12, pageTo: 13, sourceType: 'textbook', score: 0.7,
  content: "Ohm's law states V = IR. For a conductor at constant temperature, potential difference is proportional to current. V is measured in volts, I in amperes, R in ohms.",
};
export const neighbor: EvidenceChunk = { ...seed, id: 'fixture-ohm-condition', chunkIndex: 3, score: null, role: 'condition',
  content: "Ohm's law applies only if physical conditions including temperature remain constant. An example uses a resistor in a circuit with a steady temperature.",
};
export function ready(question = request.question): QuestionUnderstanding {
  return { status: 'ready', normalizedQuestion: question, retrievalQuestion: question, inputLanguage: 'en', intent: 'explanation', concepts: ["Ohm's law"], corrections: [], ambiguityReasons: [], clarification: null };
}
export const ambiguous: QuestionUnderstanding = {
  ...ready(), status: 'needs_clarification', normalizedQuestion: null, retrievalQuestion: null, ambiguityReasons: ['Effect is unspecified.'],
  clarification: { question: 'Which effect do you mean?', options: [
    { id: 'heat', label: 'Heating effect', interpretedQuestion: 'Explain the heating effect of current.' },
    { id: 'magnet', label: 'Magnetic effect', interpretedQuestion: 'Explain the magnetic effect of current.' },
  ], allowFreeText: true },
};
export function answer(): TeachingAnswer {
  return { answerable: true, language: 'en', coverage: 'sufficient', statements: [
    { id: 's1', aspect: 'core', text: "Ohm's law relates potential difference to current for a conductor at constant temperature: V = IR.", chunkIds: [seed.id], kind: 'explanation' },
    { id: 's2', aspect: 'example', text: 'Consider a resistor whose temperature stays constant; this illustrates the same relationship between current and potential difference.', chunkIds: [seed.id], kind: 'illustration' },
  ], blocks: [{ kind: 'direct_answer', statementIds: ['s1'] }, { kind: 'example', statementIds: ['s2'] }], missingAspects: [], calculation: null };
}

export function fixtureAdequacy(checked: TeachingAnswer = answer()) {
  return { verdict: checked.coverage === 'partial' ? 'partial' as const : 'complete' as const,
    reasoning: 'addressed' as const, example: checked.statements.some((s) => s.aspect === 'example') ? 'used' as const : 'not_needed' as const,
    reason: 'TEST fixture adequacy verdict, not a live semantic assessment.', missingAspects: checked.missingAspects, repairEvidence: [] };
}

export function fixtureDependencies(options: { understanding?: unknown; output?: unknown; review?: unknown; sufficiency?: unknown; seeds?: EvidenceChunk[]; neighbors?: EvidenceChunk[]; failStage?: string } = {}) {
  const stages: string[] = [];
  const outputs = { understanding: options.understanding ?? ready(), explanation: options.output ?? answer() };
  const provider: AskProvider = {
    get calls() { return stages.length; },
    async json(stage, _instruction, payload) {
      stages.push(stage);
      if (stage === options.failStage) throw new Error('fixture provider failure');
      if (stage === 'understanding') return structuredClone(outputs.understanding);
      if (stage === 'sufficiency') return structuredClone(options.sufficiency ?? { coverage: 'insufficient', coreSupported: false, support: [], missingAspects: ['TEST fixture core unsupported.'] });
      if (stage === 'explanation' || stage === 'repair') return structuredClone(outputs.explanation);
      const checked = (payload as { answer: TeachingAnswer }).answer;
      return { adequacy: fixtureAdequacy(checked), ...(options.review && typeof options.review === 'object' ? options.review : { coherent: true, coreSupported: true, verdicts: checked.statements.map((s) => ({ statementId: s.id, verdict: 'supported', chunkIds: s.chunkIds, reason: 'TEST fixture support only.' })) }) };
    },
    async countTokens() { return 800; },
  };
  const queries: string[] = [];
  const retrieval: AskRetrieval = {
    async seeds(question) { queries.push(question); return structuredClone(options.seeds ?? [seed]); },
    async neighbors() { return structuredClone(options.neighbors ?? [neighbor]); },
  };
  return { provider, retrieval, config: readAskConfig({}), signal: new AbortController().signal, owner: 'fixture-owner', requestId: 'fixture-request', trace: newTrace(), stages, queries };
}
