import { NextResponse } from 'next/server';
import { retrieve } from '@/lib/ai/retrieval';
import { evaluateConfidence } from '@/lib/ai/guardrail';

export interface EvalItem {
  id: string;
  lang: string;
  label: 'in_syllabus' | 'out_of_syllabus';
  subject: string;
  question: string;
  expectedChapter: number[];
  reason?: string;
}

export const EVAL_QUESTIONS: EvalItem[] = [
  {
    id: 'is-001',
    lang: 'en',
    label: 'in_syllabus',
    subject: 'physics',
    question: "What is Ohm's law?",
    expectedChapter: [14]
  },
  {
    id: 'is-002',
    lang: 'roman_ur',
    label: 'in_syllabus',
    subject: 'physics',
    question: "Ohm ka qanoon kya hai aur resistance ki tareef karein?",
    expectedChapter: [14]
  },
  {
    id: 'is-003',
    lang: 'en',
    label: 'in_syllabus',
    subject: 'physics',
    question: "State Joule's law of heating and write its formula.",
    expectedChapter: [14]
  },
  {
    id: 'is-004',
    lang: 'en',
    label: 'in_syllabus',
    subject: 'physics',
    question: "Explain electromagnetic induction and Faraday's law.",
    expectedChapter: [15]
  },
  {
    id: 'is-005',
    lang: 'roman_ur',
    label: 'in_syllabus',
    subject: 'physics',
    question: "Transformer direct current (DC) par kyun kaam nahi karta?",
    expectedChapter: [15]
  },
  {
    id: 'is-006',
    lang: 'en',
    label: 'in_syllabus',
    subject: 'physics',
    question: "Define half-life of a radioactive isotope.",
    expectedChapter: [18]
  },
  {
    id: 'oos-001',
    lang: 'en',
    label: 'out_of_syllabus',
    subject: 'physics',
    question: "Explain the mechanism of an organic SN2 reaction.",
    expectedChapter: [],
    reason: "Chemistry topic, different subject"
  },
  {
    id: 'oos-002',
    lang: 'en',
    label: 'out_of_syllabus',
    subject: 'physics',
    question: "What is the time complexity of quicksort algorithm in computer science?",
    expectedChapter: [],
    reason: "Computer Science algorithm, not Matric Physics"
  },
  {
    id: 'oos-003',
    lang: 'en',
    label: 'out_of_syllabus',
    subject: 'physics',
    question: "How do human kidneys perform ultrafiltration?",
    expectedChapter: [],
    reason: "Biology topic, not Matric Physics"
  },
  {
    id: 'oos-004',
    lang: 'roman_ur',
    label: 'out_of_syllabus',
    subject: 'physics',
    question: "Photosynthesis ka dark reaction kahan hota hai?",
    expectedChapter: [],
    reason: "Botany/Biology in Roman Urdu"
  },
  {
    id: 'oos-005',
    lang: 'en',
    label: 'out_of_syllabus',
    subject: 'physics',
    question: "Calculate the stock option pricing using Black-Scholes formula.",
    expectedChapter: [],
    reason: "Financial Mathematics, off-syllabus"
  }
];

export async function GET() {
  try {
    const results = [];

    let inSyllabusCount = 0;
    let inSyllabusRetrievedCorrectly = 0;
    let inSyllabusPassedGate = 0;
    let falseRefusals = 0;

    let outSyllabusCount = 0;
    let outSyllabusRefusedCorrectly = 0;
    let falseAcceptances = 0;

    for (const item of EVAL_QUESTIONS) {
      const chunks = await retrieve({
        normalisedQuery: item.question,
        board: 'PCTB',
        classLevel: 10,
        subject: item.subject,
      });

      const guardrail = evaluateConfidence(chunks);
      const topChunk = chunks[0] ?? null;
      const topScore = guardrail.top1;
      const retrievedChapters = Array.from(new Set(chunks.map((c) => c.chapterNo)));

      if (item.label === 'in_syllabus') {
        inSyllabusCount++;
        const chapterHit = item.expectedChapter.some((c) => retrievedChapters.includes(c));
        if (chapterHit) {
          inSyllabusRetrievedCorrectly++;
        }

        const isPassed = guardrail.decision === 'PASS' || guardrail.decision === 'BORDERLINE';
        if (isPassed) {
          inSyllabusPassedGate++;
        } else {
          falseRefusals++;
        }

        results.push({
          id: item.id,
          question: item.question,
          lang: item.lang,
          label: item.label,
          expectedChapter: item.expectedChapter,
          retrievedChapters,
          top1Score: topScore,
          supportCount: guardrail.support,
          decision: guardrail.decision,
          passedVerification: chapterHit && isPassed,
          reason: item.reason || null,
        });
      } else {
        outSyllabusCount++;
        const isRefused = guardrail.decision === 'REFUSE';
        if (isRefused) {
          outSyllabusRefusedCorrectly++;
        } else {
          falseAcceptances++;
        }

        results.push({
          id: item.id,
          question: item.question,
          lang: item.lang,
          label: item.label,
          expectedChapter: item.expectedChapter,
          retrievedChapters,
          top1Score: topScore,
          supportCount: guardrail.support,
          decision: guardrail.decision,
          passedVerification: isRefused, // For off-syllabus, success means REFUSE
          reason: item.reason || null,
        });
      }
    }

    const retrievalAccuracy = inSyllabusCount > 0 ? (inSyllabusRetrievedCorrectly / inSyllabusCount) * 100 : 100;
    const offSyllabusRefusalRate = outSyllabusCount > 0 ? (outSyllabusRefusedCorrectly / outSyllabusCount) * 100 : 100;
    const falseAcceptanceRate = outSyllabusCount > 0 ? (falseAcceptances / outSyllabusCount) * 100 : 0;
    const falseRefusalRate = inSyllabusCount > 0 ? (falseRefusals / inSyllabusCount) * 100 : 0;

    return NextResponse.json({
      summary: {
        totalEvaluated: EVAL_QUESTIONS.length,
        inSyllabusTotal: inSyllabusCount,
        outSyllabusTotal: outSyllabusCount,
        retrievalAccuracy: Number(retrievalAccuracy.toFixed(1)),
        offSyllabusRefusalRate: Number(offSyllabusRefusalRate.toFixed(1)),
        falseAcceptanceRate: Number(falseAcceptanceRate.toFixed(1)),
        falseRefusalRate: Number(falseRefusalRate.toFixed(1)),
        thresholds: {
          PASS_TOP1: Number(process.env.PASS_TOP1 ?? 0.62),
          BORDERLINE_TOP1: Number(process.env.BORDERLINE_TOP1 ?? 0.52),
          SUPPORT_SCORE: Number(process.env.SUPPORT_SCORE ?? 0.50),
        },
      },
      results,
    });
  } catch (error) {
    console.error('Evaluation API error:', error);
    return NextResponse.json({ error: 'Failed to run evaluation' }, { status: 500 });
  }
}
