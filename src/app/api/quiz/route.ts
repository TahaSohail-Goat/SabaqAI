import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { INITIAL_SYLLABUS_CHUNKS, CHAPTER_DIRECTORY } from '@/lib/syllabus-data';
import { getGeminiClient } from '@/lib/gemini';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { sealAnswerKey, type AnswerKeyEntry } from '@/lib/quiz/answer-key';
import { persistQuiz, type PersistableQuestion } from '@/lib/quiz/persist';

interface SourceChunk {
  id: string;
  content: string;
  pageFrom: number | null;
  section: string | null;
  chapterNo: number;
  chapterTitle: string | null;
}

/** Real ingested content — the same content_chunks_expanded view /api/syllabus already reads.
 *  Returns null when Supabase isn't configured at all (caller falls back to the local dev
 *  corpus), or an array (possibly empty) when it is — an empty array here means "genuinely
 *  nothing ingested for this chapter yet," which the caller must treat as a real 404, not fall
 *  through to unrelated hardcoded content pretending to be this chapter's. */
async function fetchChunksFromDb(
  admin: SupabaseClient | null,
  board: string,
  classLevel: number,
  subject: string,
  chapterNo: number
): Promise<SourceChunk[] | null> {
  if (!admin) return null;

  const { data, error } = await admin
    .from('content_chunks_expanded')
    .select('id, content, page_from, section, chapter_no, chapter_title')
    .eq('board', board)
    .eq('class_level', classLevel)
    .eq('subject', subject)
    .eq('chapter_no', chapterNo);

  if (error) {
    console.error('Quiz: content_chunks_expanded query failed:', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    content: r.content,
    pageFrom: r.page_from,
    section: r.section,
    chapterNo: r.chapter_no,
    chapterTitle: r.chapter_title,
  }));
}

/** Real content_chunks rows are gen_random_uuid() — the hand-written fallback bank and local
 *  dev corpus use synthetic ids like "pctb-10-phy-ch14-01" that don't exist as real rows.
 *  Persisting one of those as quiz_questions.chunk_id would violate its foreign key. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isRealChunkId = (id: string) => UUID_RE.test(id);

/** Internal shape, including the answer. Never returned to the browser as-is. */
export interface QuizQuestionData {
  id: string;
  position: number;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  chunkId: string;
  chapterNo: number;
  page: number;
  section: string;
}

/** What the browser actually receives: no correctIndex, no explanation. */
export type PublicQuizQuestion = Omit<QuizQuestionData, 'correctIndex' | 'explanation'>;

/** Strip the answer key out of the questions and seal it into a signed token. Used only as a
 *  fallback when real persistence isn't possible (no Supabase, no signed-in user, or a genuine
 *  DB error) — see respondWithQuiz below, which tries persistQuiz() first. */
function toPublicQuizWithToken(questions: QuizQuestionData[]) {
  const answerKey: AnswerKeyEntry[] = questions.map((q) => ({
    questionId: q.id,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
  }));

  const publicQuestions: PublicQuizQuestion[] = questions.map(
    ({ correctIndex: _correctIndex, explanation: _explanation, ...rest }) => rest
  );

  return { questions: publicQuestions, answerToken: sealAnswerKey(answerKey) };
}

/** Persists the quiz for real when a logged-in user + Supabase are both available, returning a
 *  quizId the browser can grade against later (src/lib/quiz/persist.ts — this is what the
 *  quiz_answer_keys migration comment meant by "lets answer-key.ts be retired once quiz
 *  persistence ships"). Falls back to the signed-token approach on any failure, same resilience
 *  pattern the rest of this app uses rather than hard-failing when persistence isn't possible. */
async function respondWithQuiz(
  questions: QuizQuestionData[],
  ctx: {
    userId: string | null;
    admin: SupabaseClient | null;
    board: string;
    classLevel: number;
    subject: string;
    chapterNo: number;
    chapterTitle: string;
  },
  extra: Record<string, unknown>
) {
  if (ctx.userId && ctx.admin) {
    const persistable: PersistableQuestion[] = questions.map((q) => ({
      position: q.position,
      stem: q.stem,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      chunkId: isRealChunkId(q.chunkId) ? q.chunkId : null,
    }));

    const persisted = await persistQuiz(
      ctx.admin,
      ctx.userId,
      ctx.board,
      ctx.classLevel,
      ctx.subject,
      ctx.chapterNo,
      ctx.chapterTitle,
      persistable
    );

    if (persisted) {
      const publicQuestions: PublicQuizQuestion[] = questions.map((q, idx) => {
        const { correctIndex: _c, explanation: _e, ...rest } = q;
        return { ...rest, id: persisted.questionIds[idx] };
      });
      return NextResponse.json({ questions: publicQuestions, quizId: persisted.quizId, ...extra });
    }
    console.warn('Quiz: persistence failed, falling back to signed-token grading for this request.');
  }

  return NextResponse.json({ ...toPublicQuizWithToken(questions), ...extra });
}

const PRECOMPUTED_QUIZZES: Record<number, QuizQuestionData[]> = {
  14: [
    {
      id: 'q-14-1',
      position: 1,
      stem: "What is the SI unit of electric current?",
      options: ["Volt (V)", "Ampere (A)", "Ohm (Ω)", "Coulomb (C)"],
      correctIndex: 1,
      explanation: "Current is the rate of flow of charge (I = Q/t). Its SI unit is Ampere (A), which equals 1 Coulomb per second.",
      chunkId: 'pctb-10-phy-ch14-01',
      chapterNo: 14,
      page: 91,
      section: '14.1 Electric Current'
    },
    {
      id: 'q-14-2',
      position: 2,
      stem: "According to Ohm's law, what condition must remain constant for current to be directly proportional to potential difference?",
      options: ["The magnetic field", "The temperature and physical state", "The color of the wire", "The atmospheric pressure"],
      correctIndex: 1,
      explanation: "Ohm's law states that V ∝ I only when the temperature and physical state of the conductor remain constant.",
      chunkId: 'pctb-10-phy-ch14-03',
      chapterNo: 14,
      page: 95,
      section: "14.3 Ohm's Law and Resistance"
    },
    {
      id: 'q-14-3',
      position: 3,
      stem: "How is the resistance of a conductor related to its cross-sectional area (A)?",
      options: ["Directly proportional (R ∝ A)", "Inversely proportional (R ∝ 1/A)", "Independent of area", "Proportional to A squared"],
      correctIndex: 1,
      explanation: "Resistance is inversely proportional to cross-sectional area: R = ρ(L/A). Thicker wires offer less resistance.",
      chunkId: 'pctb-10-phy-ch14-04',
      chapterNo: 14,
      page: 98,
      section: '14.4 Factors Affecting Resistance'
    },
    {
      id: 'q-14-4',
      position: 4,
      stem: "According to Joule's Law, how is heat generated in a resistor related to the current flowing through it?",
      options: ["Proportional to current (I)", "Proportional to square of current (I²)", "Inversely proportional to current", "Proportional to square root of current"],
      correctIndex: 1,
      explanation: "Joule's law states that heat generated W = I² · R · t, directly proportional to the square of current.",
      chunkId: 'pctb-10-phy-ch14-05',
      chapterNo: 14,
      page: 102,
      section: "14.6 Joule's Law"
    },
    {
      id: 'q-14-5',
      position: 5,
      stem: "One kilowatt-hour (1 kWh) of electrical energy is equal to how many Joules?",
      options: ["1,000 J", "36,000 J", "3.6 × 10⁶ J (3.6 MJ)", "3.6 × 10³ J"],
      correctIndex: 2,
      explanation: "1 kWh = 1000 W × 3600 seconds = 3,600,000 J = 3.6 × 10⁶ Joules.",
      chunkId: 'pctb-10-phy-ch14-05',
      chapterNo: 14,
      page: 103,
      section: "14.6 Joule's Law and Electrical Energy"
    }
  ],
  15: [
    {
      id: 'q-15-1',
      position: 1,
      stem: "Which rule is used to find the direction of magnetic field lines around a straight current-carrying wire?",
      options: ["Left Hand Rule", "Right Hand Grip Rule", "Lenz's Rule", "Coulomb's Law"],
      correctIndex: 1,
      explanation: "Grasp the wire with thumb pointing in direction of conventional current; curled fingers point along magnetic field lines.",
      chunkId: 'pctb-10-phy-ch15-01',
      chapterNo: 15,
      page: 116,
      section: '15.1 Magnetic Effects of Steady Current'
    },
    {
      id: 'q-15-2',
      position: 2,
      stem: "Lenz's Law is a consequence of which fundamental law of physics?",
      options: ["Conservation of charge", "Conservation of energy", "Conservation of momentum", "Newton's third law"],
      correctIndex: 1,
      explanation: "Lenz's Law states induced current opposes its cause, which complies strictly with the Law of Conservation of Energy.",
      chunkId: 'pctb-10-phy-ch15-02',
      chapterNo: 15,
      page: 124,
      section: '15.4 Electromagnetic Induction & Lenz’s Law'
    },
    {
      id: 'q-15-3',
      position: 3,
      stem: "Why does a transformer NOT operate on direct current (DC)?",
      options: ["DC has too high voltage", "DC does not produce a changing magnetic flux", "DC burns the copper wire", "DC has infinite frequency"],
      correctIndex: 1,
      explanation: "Transformers require changing magnetic flux to induce voltage in the secondary coil; steady DC has zero rate of flux change.",
      chunkId: 'pctb-10-phy-ch15-03',
      chapterNo: 15,
      page: 129,
      section: '15.6 Transformer'
    }
  ]
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const chapterNo = Number(body.chapterNo || 14);
    const subject = String(body.subject || 'physics').toLowerCase();
    // FBISE is the only board this app actually offers (Settings, signup, the crawler all
    // agree on this) — PCTB was hardcoded here before, which meant nothing the crawler ingests
    // could ever be found by this route even once ingestion itself was working.
    const board = body.board || 'FBISE';
    const classLevel = Number(body.classLevel || 10);

    const { user } = await getCurrentUserAndProfile();
    const admin = getServiceRoleClient();

    // Real ingested content first; the hardcoded local corpus is a dev-only fallback for when
    // Supabase isn't configured at all (same pattern /api/syllabus already uses) — never a
    // silent substitute for content that's simply missing for this specific chapter.
    const dbChunks = await fetchChunksFromDb(admin, board, classLevel, subject, chapterNo);
    const matchingChunks: SourceChunk[] =
      dbChunks ??
      INITIAL_SYLLABUS_CHUNKS.filter((c) => c.chapterNo === chapterNo && c.subject.toLowerCase() === subject).map((c) => ({
        id: c.id,
        content: c.content,
        pageFrom: c.pageFrom,
        section: c.section,
        chapterNo: c.chapterNo,
        chapterTitle: c.chapterTitle,
      }));

    if (matchingChunks.length === 0) {
      return NextResponse.json(
        { error: `No ingested content for ${board} Class ${classLevel} ${subject} Chapter ${chapterNo} yet.` },
        { status: 404 }
      );
    }

    const chapterTitle =
      matchingChunks[0].chapterTitle ||
      CHAPTER_DIRECTORY.find((c) => c.chapterNo === chapterNo)?.chapterTitle ||
      `Chapter ${chapterNo}`;
    const persistCtx = { userId: user?.id ?? null, admin, board, classLevel, subject, chapterNo, chapterTitle };

    const ai = getGeminiClient();
    if (ai) {
      try {
        const chunkText = matchingChunks
          .map((c) => `[CHUNK id="${c.id}" page="${c.pageFrom ?? ''}" section="${c.section ?? ''}"]\n${c.content}\n[/CHUNK]`)
          .join('\n\n');

        const prompt = `Based ONLY on the syllabus chunks below, generate 5 multiple choice questions (MCQs) for ${board} Class ${classLevel} ${subject} Chapter ${chapterNo}.
Each MCQ must have exactly 4 options, a 0-indexed correct answer, a brief explanation citing the textbook fact, and the chunkId it was derived from.

CONTEXT:
${chunkText}

Return strictly a JSON array of objects in this shape:
[
  {
    "id": "q-1",
    "position": 1,
    "stem": "Question text here?",
    "options": ["A", "B", "C", "D"],
    "correctIndex": 0,
    "explanation": "Why this is correct according to the syllabus...",
    "chunkId": "pctb-10-phy-ch14-01"
  }
]`;

        const res = await ai.models.generateContent({
          model: process.env.CHAT_MODEL || 'gemini-3.5-flash-lite',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        });

        const text = res.text?.trim();
        if (text) {
          const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Validate each question's citation against the chunks we actually retrieved.
            // A question citing a chunk id that doesn't exist is DISCARDED, never reassigned:
            // substituting a real chunk would give a hallucinated question real-looking
            // provenance, which is worse than dropping it.
            const mappedQuestions: QuizQuestionData[] = parsed
              .map((q, idx) => {
                const matchedChunk = matchingChunks.find((c) => c.id === q.chunkId);
                if (!matchedChunk) {
                  console.warn(
                    `Quiz: discarding question ${q.id ?? idx} — cites unknown chunk "${q.chunkId}"`
                  );
                  return null;
                }
                if (!q.stem || !Array.isArray(q.options) || typeof q.correctIndex !== 'number') {
                  console.warn(`Quiz: discarding question ${q.id ?? idx} — malformed`);
                  return null;
                }
                return {
                  id: q.id || `gen-q-${idx}`,
                  position: 0, // renumbered after filtering
                  stem: q.stem,
                  options: q.options,
                  correctIndex: q.correctIndex,
                  explanation: q.explanation,
                  chunkId: matchedChunk.id,
                  chapterNo: matchedChunk.chapterNo,
                  page: matchedChunk.pageFrom ?? 0,
                  section: matchedChunk.section ?? '',
                };
              })
              .filter((q): q is QuizQuestionData => q !== null)
              .map((q, idx) => ({ ...q, position: idx + 1 }));

            if (mappedQuestions.length > 0) {
              return await respondWithQuiz(mappedQuestions, persistCtx, {
                chapterNo,
                subject,
                discarded: parsed.length - mappedQuestions.length,
              });
            }
            console.warn('Quiz: every generated question failed citation validation.');
          }
        }
      } catch (err) {
        console.warn('Gemini quiz generation fallback:', err);
      }
    }

    // Hand-written fallback bank, used only when generation is unavailable or produced nothing
    // that validated — and ONLY for a chapter it actually covers (14/15 today). Substituting a
    // different chapter's questions here (the old "|| PRECOMPUTED_QUIZZES[14]" behavior) would
    // silently show a student the wrong chapter's content while the response still claimed the
    // chapter they asked for — a real, honest "unavailable" beats a mislabeled quiz.
    const fallbackQuestions = PRECOMPUTED_QUIZZES[chapterNo];
    if (fallbackQuestions) {
      return await respondWithQuiz(fallbackQuestions, persistCtx, {
        chapterNo,
        subject,
        isFallback: true,
        note: 'Fallback question bank — live generation unavailable for this request.',
      });
    }

    return NextResponse.json(
      { error: 'Quiz generation is temporarily unavailable for this chapter. Please try again shortly.' },
      { status: 503 }
    );
  } catch (error) {
    console.error('Quiz API error:', error);
    return NextResponse.json({ error: 'Failed to generate quiz' }, { status: 500 });
  }
}
