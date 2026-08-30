// Server-side quiz grading.
//
// The browser never receives the answer key up front. Two ways this route can find it now:
//   - quizId: looked up for real from quiz_answer_keys (src/lib/quiz/persist.ts) — this also
//     records the attempt (quiz_attempts/quiz_attempt_answers) so it counts toward the
//     student's real history/Dashboard stats.
//   - answerToken: the older signed-token approach (src/lib/quiz/answer-key.ts), still used as
//     a fallback by /api/quiz when persistence isn't possible (demo mode, no logged-in user, or
//     a genuine DB error) — grading still works, it just isn't recorded anywhere.

import { NextRequest, NextResponse } from 'next/server';
import { openAnswerKey } from '@/lib/quiz/answer-key';
import { fetchAnswerKey, persistAttempt } from '@/lib/quiz/persist';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';

export interface GradedQuestion {
  questionId: string;
  selectedIndex: number | null;
  correctIndex: number;
  correct: boolean;
  explanation: string;
}

export async function POST(req: NextRequest) {
  try {
    const { quizId, answerToken, answers } = await req.json();

    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return NextResponse.json(
        { error: 'answers must be an object mapping question id to the selected option index.' },
        { status: 400 }
      );
    }
    const submitted = answers as Record<string, unknown>;
    const selectedFor = (questionId: string): number | null => {
      const raw = submitted[questionId];
      return typeof raw === 'number' && Number.isInteger(raw) ? raw : null;
    };

    if (typeof quizId === 'string' && quizId) {
      const { user } = await getCurrentUserAndProfile();
      const admin = getServiceRoleClient();
      if (!user || !admin) {
        return NextResponse.json({ error: 'You need to be logged in to grade this quiz.' }, { status: 401 });
      }

      const answerKey = await fetchAnswerKey(admin, quizId, user.id);
      if (!answerKey || answerKey.length === 0) {
        return NextResponse.json(
          { error: 'This quiz could not be found. Load a new one and try again.' },
          { status: 404 }
        );
      }

      const results: GradedQuestion[] = answerKey.map((entry) => {
        const selectedIndex = selectedFor(entry.questionId);
        return {
          questionId: entry.questionId,
          selectedIndex,
          correctIndex: entry.correctOptionIndex,
          correct: selectedIndex === entry.correctOptionIndex,
          explanation: entry.explanation,
        };
      });

      await persistAttempt(
        admin,
        quizId,
        user.id,
        results.map((r) => ({ questionId: r.questionId, selectedIndex: r.selectedIndex, correct: r.correct }))
      );

      return NextResponse.json({
        score: results.filter((r) => r.correct).length,
        total: results.length,
        answered: results.filter((r) => r.selectedIndex !== null).length,
        results,
      });
    }

    if (typeof answerToken !== 'string' || !answerToken) {
      return NextResponse.json({ error: 'quizId or answerToken is required.' }, { status: 400 });
    }

    const decodedKey = openAnswerKey(answerToken);
    if (!decodedKey) {
      return NextResponse.json(
        { error: 'This quiz session is invalid or has expired. Load a new quiz and try again.' },
        { status: 400 }
      );
    }

    const results: GradedQuestion[] = decodedKey.map((entry) => {
      const selectedIndex = selectedFor(entry.questionId);
      return {
        questionId: entry.questionId,
        selectedIndex,
        correctIndex: entry.correctIndex,
        correct: selectedIndex === entry.correctIndex,
        explanation: entry.explanation,
      };
    });

    return NextResponse.json({
      score: results.filter((r) => r.correct).length,
      total: results.length,
      answered: results.filter((r) => r.selectedIndex !== null).length,
      results,
    });
  } catch (error) {
    console.error('Quiz grading error:', error);
    return NextResponse.json({ error: 'Failed to grade quiz' }, { status: 500 });
  }
}
