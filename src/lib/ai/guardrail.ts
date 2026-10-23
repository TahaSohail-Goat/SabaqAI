// THE confidence gate. This is the single most important file in the app.
// Rules (see docs/confidence-guardrails.md):
//   - Legacy callers use scores; scoped Ask may supply a validated pre-gate evidence assessment.
//   - On REFUSE, the caller must NOT call the LLM.
//   - Fail closed: if anything is wrong, REFUSE — never PASS.
//   - There is no flag that disables this.

import type { RetrievedChunk, GuardrailResult, SemanticEvidenceDecision } from '../types';

// Legacy score thresholds are retained. This change does not calibrate them against a corpus;
// uncertain scoped Ask candidates can instead supply an excerpt-validated evidence assessment.
const PASS_TOP1 = Number(process.env.PASS_TOP1 ?? 0.55);
const BORDERLINE_TOP1 = Number(process.env.BORDERLINE_TOP1 ?? 0.45);
const SUPPORT_SCORE = Number(process.env.SUPPORT_SCORE ?? 0.5);

function validScores(chunks: RetrievedChunk[]): boolean {
  return [PASS_TOP1, BORDERLINE_TOP1, SUPPORT_SCORE].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)
    && BORDERLINE_TOP1 <= PASS_TOP1 && Array.isArray(chunks)
    && chunks.every((c) => c && Number.isFinite(c.score) && c.score >= -1 && c.score <= 1);
}

// This is candidate triage, NOT a final refusal. A model may assess the bounded evidence
// before evaluateConfidence, but no model call is permitted after its final REFUSE.
export function needsEvidenceAssessment(chunks: RetrievedChunk[]): boolean {
  return validScores(chunks) && chunks.length > 0 && Math.max(...chunks.map((c) => c.score)) < PASS_TOP1;
}

export function evaluateConfidence(chunks: RetrievedChunk[], assessment?: SemanticEvidenceDecision): GuardrailResult {
  try {
    if (!validScores(chunks)) {
      return { decision: 'REFUSE', reason: 'low_similarity', top1: 0, support: 0 };
    }
    if (!chunks || chunks.length === 0) {
      return { decision: 'REFUSE', reason: 'no_candidates', top1: 0, support: 0 };
    }
    const top1 = chunks[0].score;
    const support = chunks.filter((c) => c.score >= SUPPORT_SCORE).length;

    if (assessment !== undefined) {
      const ids = new Set(chunks.map((c) => c.id));
      const byId = new Map(chunks.map((c) => [c.id, c]));
      if (!['sufficient', 'partial', 'insufficient'].includes(assessment.coverage)
        || !Array.isArray(assessment.supportingChunkIds) || !Array.isArray(assessment.missingAspects)
        || !Array.isArray(assessment.supportingExcerpts) || !assessment.supportingExcerpts.length
        || assessment.supportingExcerpts.some((ref) => typeof ref.quote !== 'string' || ref.quote.trim().length < 24
          || !assessment.supportingChunkIds.includes(ref.chunkId)
          || !byId.get(ref.chunkId)?.content?.replace(/\s+/gu, ' ').includes(ref.quote.replace(/\s+/gu, ' ').trim()))
        || assessment.supportingChunkIds.some((id) => !assessment.supportingExcerpts.some((ref) => ref.chunkId === id))
        || assessment.missingAspects.some((label) => typeof label !== 'string' || !label.trim())
        || assessment.coverage === 'insufficient' || !assessment.supportingChunkIds.length
        || assessment.supportingChunkIds.some((id) => !ids.has(id))
        || new Set(assessment.supportingChunkIds).size !== assessment.supportingChunkIds.length
        || (assessment.coverage === 'partial') !== Boolean(assessment.missingAspects.length)) {
        return { decision: 'REFUSE', reason: 'ungrounded_output', top1, support };
      }
      // A semantic assessment never promotes similarity or claims high confidence.
      // The caller must still generate, validate citations and independently review support.
      return { decision: 'BORDERLINE', top1, support };
    }

    if (top1 >= PASS_TOP1 && support >= 2) {
      return { decision: 'PASS', top1, support };
    }
    if (top1 >= BORDERLINE_TOP1) {
      return { decision: 'BORDERLINE', top1, support };
    }
    return { decision: 'REFUSE', reason: 'low_similarity', top1, support };
  } catch {
    // Fail closed. A scoring error must never become a confident answer.
    return { decision: 'REFUSE', reason: 'low_similarity', top1: 0, support: 0 };
  }
}
