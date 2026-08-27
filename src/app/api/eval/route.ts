// Evaluation metrics. Every number here is computed from live retrieval + the live guardrail.
// Nothing is hardcoded — see docs/evaluation.md.
//
// This route calls retrieval once per question, so it is slow and consumes embedding quota.
// Do not load it automatically on page mount or in a hot path.

import { NextResponse } from 'next/server';
import { runEvaluation } from '@/lib/evaluation/run';

export async function GET() {
  try {
    const report = await runEvaluation();
    return NextResponse.json(report);
  } catch (error) {
    console.error('Evaluation API error:', error);
    return NextResponse.json({ error: 'Failed to run evaluation' }, { status: 500 });
  }
}
