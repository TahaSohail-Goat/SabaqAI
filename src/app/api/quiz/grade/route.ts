// Server-side quiz grading.
//
// The browser never received the answer key — only an opaque signed token (see
// src/lib/quiz/answer-key.ts). It sends that token back with the student's answers, and grading
// happens here. Correct answers and explanations are returned only now, after submission.

import { NextRequest, NextResponse } from 'next/server';
import { openAnswerKey } from '@/lib/quiz/answer-key';

export interface GradedQuestion {
  questionId: string;
  selectedIndex: number | null;
  correctIndex: number;
  correct: boolean;
  explanation: string;
}

export async function POST(req: NextRequest) {
  try {
    const { answerToken, answers } = await req.json();

    if (typeof answerToken !== 'string' || !answerToken) {
      return NextResponse.json({ error: 'answerToken is required.' }, { status: 400 });
    }
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return NextResponse.json(
        { error: 'answers must be an object mapping question id to the selected option index.' },
        { status: 400 }
      );
    }

    const answerKey = openAnswerKey(answerToken);
    if (!answerKey) {
      return NextResponse.json(
        { error: 'This quiz session is invalid or has expired. Load a new quiz and try again.' },
        { status: 400 }
      );
    }

    const submitted = answers as Record<string, unknown>;
    const results: GradedQuestion[] = answerKey.map((entry) => {
      const raw = submitted[entry.questionId];
      const selectedIndex = typeof raw === 'number' && Number.isInteger(raw) ? raw : null;
      return {
        questionId: entry.questionId,
        selectedIndex,
        correctIndex: entry.correctIndex,
        correct: selectedIndex === entry.correctIndex,
        explanation: entry.explanation,
      };
    });

    const score = results.filter((r) => r.correct).length;

    return NextResponse.json({
      score,
      total: results.length,
      answered: results.filter((r) => r.selectedIndex !== null).length,
      results,
    });
  } catch (error) {
    console.error('Quiz grading error:', error);
    return NextResponse.json({ error: 'Failed to grade quiz' }, { status: 500 });
  }
}
