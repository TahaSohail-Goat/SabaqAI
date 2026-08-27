// Runs the labelled set through LIVE retrieval and the LIVE guardrail — the same code path a
// student hits. Nothing here is simulated, and no number is hardcoded.
//
// Shared by /api/eval and scripts/eval.ts so the dashboard and the CLI can never disagree.

import { retrieve } from '../ai/retrieval';
import { evaluateConfidence } from '../ai/guardrail';
import { EVAL_QUESTIONS, type EvalQuestion } from './questions';

export interface EvalResult {
  id: string;
  question: string;
  lang: string;
  label: EvalQuestion['label'];
  nearMiss: boolean;
  expectedChapter: number[];
  retrievedChapters: number[];
  top1Score: number;
  supportCount: number;
  decision: 'PASS' | 'BORDERLINE' | 'REFUSE';
  /** in-syllabus: right chapter retrieved AND answered. off-syllabus: refused. */
  passedVerification: boolean;
  reason: string | null;
}

export interface EvalSummary {
  totalEvaluated: number;
  inSyllabusTotal: number;
  outSyllabusTotal: number;
  nearMissTotal: number;
  retrievalAccuracy: number;
  offSyllabusRefusalRate: number;
  /** Refusal rate on near-miss questions only. The number worth defending. */
  nearMissRefusalRate: number;
  falseAcceptanceRate: number;
  falseRefusalRate: number;
  thresholds: { PASS_TOP1: number; BORDERLINE_TOP1: number; SUPPORT_SCORE: number };
}

export interface EvalReport {
  summary: EvalSummary;
  results: EvalResult[];
}

const pct = (numerator: number, denominator: number, fallback = 0): number =>
  denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(1)) : fallback;

export async function runEvaluation(
  questions: EvalQuestion[] = EVAL_QUESTIONS,
): Promise<EvalReport> {
  const results: EvalResult[] = [];

  let inSyllabus = 0;
  let retrievedCorrectly = 0;
  let falseRefusals = 0;
  let outSyllabus = 0;
  let refusedCorrectly = 0;
  let falseAcceptances = 0;
  let nearMiss = 0;
  let nearMissRefused = 0;

  for (const item of questions) {
    const chunks = await retrieve({
      normalisedQuery: item.question,
      board: 'PCTB',
      classLevel: 10,
      subject: item.subject,
    });

    const guardrail = evaluateConfidence(chunks);
    const retrievedChapters = [...new Set(chunks.map((c) => c.chapterNo))];
    const answered = guardrail.decision !== 'REFUSE';

    let passedVerification: boolean;

    if (item.label === 'in_syllabus') {
      inSyllabus++;
      const chapterHit = item.expectedChapter.some((c) => retrievedChapters.includes(c));
      if (chapterHit) retrievedCorrectly++;
      if (!answered) falseRefusals++;
      passedVerification = chapterHit && answered;
    } else {
      outSyllabus++;
      if (answered) falseAcceptances++;
      else refusedCorrectly++;

      if (item.nearMiss) {
        nearMiss++;
        if (!answered) nearMissRefused++;
      }
      passedVerification = !answered;
    }

    results.push({
      id: item.id,
      question: item.question,
      lang: item.lang,
      label: item.label,
      nearMiss: item.nearMiss ?? false,
      expectedChapter: item.expectedChapter,
      retrievedChapters,
      top1Score: guardrail.top1,
      supportCount: guardrail.support,
      decision: guardrail.decision,
      passedVerification,
      reason: item.reason ?? null,
    });
  }

  return {
    summary: {
      totalEvaluated: questions.length,
      inSyllabusTotal: inSyllabus,
      outSyllabusTotal: outSyllabus,
      nearMissTotal: nearMiss,
      retrievalAccuracy: pct(retrievedCorrectly, inSyllabus, 100),
      offSyllabusRefusalRate: pct(refusedCorrectly, outSyllabus, 100),
      nearMissRefusalRate: pct(nearMissRefused, nearMiss, 100),
      falseAcceptanceRate: pct(falseAcceptances, outSyllabus),
      falseRefusalRate: pct(falseRefusals, inSyllabus),
      thresholds: {
        PASS_TOP1: Number(process.env.PASS_TOP1 ?? 0.62),
        BORDERLINE_TOP1: Number(process.env.BORDERLINE_TOP1 ?? 0.52),
        SUPPORT_SCORE: Number(process.env.SUPPORT_SCORE ?? 0.5),
      },
    },
    results,
  };
}
