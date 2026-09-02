// Server-side quiz grading — and the ONLY place a quiz is ever recorded.
//
// Generation (/api/quiz) deliberately never touches the database. It seals everything the quiz
// needs — questions, options, correct answers/rubrics, chunk citations — into an encrypted
// token (src/lib/quiz/answer-key.ts) and hands that to the browser. This route decrypts it,
// grades the submission, and — only when there's an actual submission from a logged-in user —
// persists the quiz (quizzes/quiz_questions/quiz_options/quiz_answer_keys/quiz_answer_rubrics)
// and the attempt (quiz_attempts/quiz_attempt_answers) together, in that order. A quiz that was
// generated but never submitted leaves no database row at all — there's nothing to "take back."
//
// MCQs grade by index match. Short/long answers are free text: one batched Gemini call grades
// every free-text answer in the attempt against its stored model answer/rubric, returning
// partial credit + brief feedback rather than a binary right/wrong.

import { NextRequest, NextResponse } from 'next/server';
import { openQuizToken, type QuizTokenQuestion } from '@/lib/quiz/answer-key';
import { persistQuiz, persistAttempt, type PersistableQuestion, type AttemptResult } from '@/lib/quiz/persist';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getGeminiClient } from '@/lib/gemini';

export interface GradedQuestion {
  questionId: string;
  questionType: 'mcq' | 'short' | 'long';
  selectedIndex: number | null;
  answerText: string | null;
  correctIndex: number | null;
  correct: boolean;
  explanation: string | null;
  pointsAwarded: number | null;
  pointsPossible: number | null;
  feedback: string | null;
}

interface TextGradeItem {
  questionId: string;
  stem: string;
  modelAnswer: string;
  rubric: string;
  maxScore: number;
  answerText: string;
}

/** One batched call grading every free-text answer in the attempt, rather than one call per
 *  question — keeps grading latency to a single extra LLM round-trip regardless of how many
 *  short/long questions the quiz has (up to 12: 10 short + 2 long). */
async function gradeTextAnswers(items: TextGradeItem[]): Promise<Map<string, { pointsAwarded: number; feedback: string }>> {
  const results = new Map<string, { pointsAwarded: number; feedback: string }>();
  if (items.length === 0) return results;

  const ai = getGeminiClient();
  if (!ai) {
    for (const item of items) {
      results.set(item.questionId, { pointsAwarded: 0, feedback: 'Automatic grading is unavailable right now.' });
    }
    return results;
  }

  const prompt = `Grade each student answer below against its model answer and rubric. Award partial credit
where reasonable — the student doesn't need to match the model answer word-for-word, just cover
the substance the rubric asks for. Give brief, constructive feedback (1-2 sentences).

${items
  .map(
    (item, idx) => `[QUESTION ${idx + 1}] id="${item.questionId}" maxScore=${item.maxScore}
Question: ${item.stem}
Model answer: ${item.modelAnswer}
Rubric: ${item.rubric}
Student answer: ${item.answerText || '(left blank)'}`
  )
  .join('\n\n')}

Return strictly a JSON array of objects in this shape:
[{"questionId":"<id>","pointsAwarded":<number between 0 and maxScore>,"feedback":"..."}]`;

  try {
    const res = await ai.models.generateContent({
      model: process.env.CHAT_MODEL || 'gemini-3.5-flash-lite',
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.1 },
    });
    const text = res.text?.trim();
    const cleaned = text?.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = cleaned ? JSON.parse(cleaned) : null;

    if (Array.isArray(parsed)) {
      const byId = new Map(items.map((i) => [i.questionId, i]));
      for (const raw of parsed) {
        const item = byId.get(raw?.questionId);
        if (!item) continue;
        const rawPoints = typeof raw.pointsAwarded === 'number' ? raw.pointsAwarded : 0;
        const pointsAwarded = Math.max(0, Math.min(item.maxScore, rawPoints));
        results.set(item.questionId, {
          pointsAwarded,
          feedback: typeof raw.feedback === 'string' ? raw.feedback : '',
        });
      }
    }
  } catch (err) {
    console.warn('Quiz grading: text-answer grading call failed:', err);
  }

  // Any question the model's response omitted or malformed never gets left silently ungraded.
  for (const item of items) {
    if (!results.has(item.questionId)) {
      results.set(item.questionId, { pointsAwarded: 0, feedback: 'Could not be graded automatically.' });
    }
  }
  return results;
}

async function gradeAll(
  questions: QuizTokenQuestion[],
  selectedFor: (questionId: string) => number | null,
  textFor: (questionId: string) => string | null
): Promise<GradedQuestion[]> {
  const mcqEntries = questions.filter((q): q is Extract<QuizTokenQuestion, { questionType: 'mcq' }> => q.questionType === 'mcq');
  const textEntries = questions.filter((q) => q.questionType !== 'mcq') as Extract<
    QuizTokenQuestion,
    { questionType: 'short' | 'long' }
  >[];

  const textItems: TextGradeItem[] = textEntries.map((e) => ({
    questionId: e.id,
    stem: e.stem,
    modelAnswer: e.modelAnswer,
    rubric: e.rubric,
    maxScore: e.maxScore,
    answerText: textFor(e.id) ?? '',
  }));

  const textGrades = await gradeTextAnswers(textItems);

  const mcqResults: GradedQuestion[] = mcqEntries.map((e) => {
    const selectedIndex = selectedFor(e.id);
    const correct = selectedIndex === e.correctIndex;
    return {
      questionId: e.id,
      questionType: 'mcq',
      selectedIndex,
      answerText: null,
      correctIndex: e.correctIndex,
      correct,
      explanation: e.explanation,
      pointsAwarded: correct ? 1 : 0,
      pointsPossible: 1,
      feedback: null,
    };
  });

  const textResults: GradedQuestion[] = textEntries.map((e) => {
    const answerText = textFor(e.id);
    const grade = textGrades.get(e.id) ?? { pointsAwarded: 0, feedback: null as string | null };
    return {
      questionId: e.id,
      questionType: e.questionType,
      selectedIndex: null,
      answerText,
      correctIndex: null,
      correct: grade.pointsAwarded >= e.maxScore * 0.5,
      explanation: null,
      pointsAwarded: grade.pointsAwarded,
      pointsPossible: e.maxScore,
      feedback: grade.feedback,
    };
  });

  return [...mcqResults, ...textResults];
}

export async function POST(req: NextRequest) {
  try {
    const { quizToken, answers, draftId } = await req.json();

    if (typeof quizToken !== 'string' || !quizToken) {
      return NextResponse.json({ error: 'quizToken is required.' }, { status: 400 });
    }
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return NextResponse.json(
        { error: 'answers must be an object mapping question id to the selected option index or free-text answer.' },
        { status: 400 }
      );
    }

    const token = openQuizToken(quizToken);
    if (!token) {
      return NextResponse.json(
        { error: 'This quiz session is invalid or has expired. Generate a new quiz and try again.' },
        { status: 400 }
      );
    }

    const submitted = answers as Record<string, unknown>;
    const selectedFor = (questionId: string): number | null => {
      const raw = submitted[questionId];
      return typeof raw === 'number' && Number.isInteger(raw) ? raw : null;
    };
    const textFor = (questionId: string): string | null => {
      const raw = submitted[questionId];
      return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
    };

    const questionsByPosition = [...token.questions].sort((a, b) => a.position - b.position);
    const results = await gradeAll(questionsByPosition, selectedFor, textFor);

    // Nothing about this quiz has been recorded yet — /api/quiz never persists. This is the
    // first and only point a quiz + its attempt get written, and only because there's a real
    // submission in hand. A generated-but-abandoned quiz never reaches this code path at all.
    let quizId: string | null = null;
    let saved = false;
    const { user } = await getCurrentUserAndProfile();
    const admin = getServiceRoleClient();

    if (user && admin && token.chapterId) {
      const persistable: PersistableQuestion[] = questionsByPosition.map((q) => ({
        position: q.position,
        stem: q.stem,
        questionType: q.questionType,
        chunkId: q.chunkId,
        options: q.questionType === 'mcq' ? q.options : undefined,
        correctIndex: q.questionType === 'mcq' ? q.correctIndex : undefined,
        explanation: q.questionType === 'mcq' ? q.explanation : undefined,
        modelAnswer: q.questionType !== 'mcq' ? q.modelAnswer : undefined,
        rubric: q.questionType !== 'mcq' ? q.rubric : undefined,
        maxScore: q.questionType !== 'mcq' ? q.maxScore : undefined,
      }));

      const persisted = await persistQuiz(admin, user.id, token.chapterId, token.topicLabel, persistable);

      if (persisted) {
        quizId = persisted.quizId;
        // Token ids and real DB ids are unrelated (the token never touched the database) —
        // match them back up by array order, which both persistQuiz and questionsByPosition
        // preserve as position-ascending.
        const realIdByTokenId = new Map(questionsByPosition.map((q, idx) => [q.id, persisted.questionIds[idx]]));

        const attemptResults: AttemptResult[] = results.map((r) => ({
          questionId: realIdByTokenId.get(r.questionId) ?? r.questionId,
          selectedIndex: r.selectedIndex,
          answerText: r.answerText,
          correct: r.correct,
          pointsAwarded: r.pointsAwarded ?? 0,
          pointsPossible: r.pointsPossible ?? 1,
          feedback: r.feedback,
        }));
        await persistAttempt(admin, quizId, user.id, attemptResults);
        saved = true;

        // The quiz is now real normalized rows (quizzes/quiz_attempts) — drop its parked draft
        // so it moves from "in progress" to "completed" everywhere. Best-effort + ownership-
        // scoped; a stale draft would otherwise just expire on its own.
        if (typeof draftId === 'string' && draftId) {
          const { error: draftDeleteError } = await admin
            .from('quiz_drafts')
            .delete()
            .eq('id', draftId)
            .eq('user_id', user.id);
          if (draftDeleteError) console.warn('Quiz grade: quiz_drafts cleanup failed:', draftDeleteError.message);
        }
      } else {
        console.warn('Quiz grading: quiz persistence failed — this attempt will not be saved to history.');
      }
    }

    return NextResponse.json({
      score: results.filter((r) => r.correct).length,
      total: results.length,
      answered: results.filter((r) => r.selectedIndex !== null || r.answerText !== null).length,
      results,
      saved,
      quizId,
    });
  } catch (error) {
    console.error('Quiz grading error:', error);
    return NextResponse.json({ error: 'Failed to grade quiz' }, { status: 500 });
  }
}
