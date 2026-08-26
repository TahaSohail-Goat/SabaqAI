// THE confidence gate. This is the single most important file in the app.
// Rules (see docs/confidence-guardrails.md):
//   - Decide PASS / BORDERLINE / REFUSE from retrieval scores only.
//   - On REFUSE, the caller must NOT call the LLM.
//   - Fail closed: if anything is wrong, REFUSE — never PASS.
//   - There is no flag that disables this.

import type { RetrievedChunk, GuardrailResult } from '../types';

const PASS_TOP1 = Number(process.env.PASS_TOP1 ?? 0.62);
const BORDERLINE_TOP1 = Number(process.env.BORDERLINE_TOP1 ?? 0.52);
const SUPPORT_SCORE = Number(process.env.SUPPORT_SCORE ?? 0.5);

export function evaluateConfidence(chunks: RetrievedChunk[]): GuardrailResult {
  try {
    if (!chunks || chunks.length === 0) {
      return { decision: 'REFUSE', reason: 'no_candidates', top1: 0, support: 0 };
    }
    const top1 = chunks[0].score;
    const support = chunks.filter((c) => c.score >= SUPPORT_SCORE).length;

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
