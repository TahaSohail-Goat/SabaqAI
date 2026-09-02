import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GoogleGenAI } from '@google/genai';
import { INITIAL_SYLLABUS_CHUNKS, CHAPTER_DIRECTORY } from '@/lib/syllabus-data';
import { getGeminiClient } from '@/lib/gemini';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { sealQuizToken, type QuizTokenQuestion } from '@/lib/quiz/answer-key';
import { resolveChapterId, fetchRecentStems, type QuestionType } from '@/lib/quiz/persist';

interface SourceChunk {
  id: string;
  content: string;
  pageFrom: number | null;
  section: string | null;
  chapterNo: number;
  chapterTitle: string | null;
}

/** Real ingested content — the same content_chunks_expanded view /api/quiz/scope reads.
 *  Returns null when Supabase isn't configured at all (caller falls back to the local dev
 *  corpus), or an array (possibly empty) when it is — an empty array here means "genuinely
 *  nothing ingested for this chapter/topic yet," which the caller must treat as a real 404,
 *  not fall through to unrelated hardcoded content pretending to be this chapter's. */
async function fetchChunksFromDb(
  admin: SupabaseClient | null,
  board: string,
  classLevel: number,
  subject: string,
  chapterNo: number
): Promise<SourceChunk[] | null> {
  if (!admin) return null;

  // Quizzes must be grounded in textbook prose only — never model papers or past papers, which
  // are exam question-and-answer content, not syllabus material to derive fresh questions from.
  const { data, error } = await admin
    .from('content_chunks_expanded')
    .select('id, content, page_from, section, chapter_no, chapter_title')
    .eq('board', board)
    .eq('class_level', classLevel)
    .eq('subject', subject)
    .eq('chapter_no', chapterNo)
    .eq('source_type', 'textbook');

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

/** Real content_chunks rows are gen_random_uuid() — the local dev corpus uses synthetic ids
 *  like "pctb-10-phy-ch14-01" that don't exist as real rows. Persisting one of those as
 *  quiz_questions.chunk_id would violate its foreign key. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isRealChunkId = (id: string) => UUID_RE.test(id);

/** Internal shape, including the answer/rubric. Never returned to the browser as-is. */
export interface QuizQuestionData {
  id: string;
  position: number;
  stem: string;
  questionType: QuestionType;
  chunkId: string;
  chapterNo: number;
  page: number;
  section: string;
  // MCQ only.
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  // short/long only.
  modelAnswer?: string;
  rubric?: string;
  maxScore?: number;
}

/** What the browser actually receives: no correctIndex/explanation/modelAnswer/rubric. */
export type PublicQuizQuestion = Omit<QuizQuestionData, 'correctIndex' | 'explanation' | 'modelAnswer' | 'rubric'>;

const SHORT_MAX_SCORE = 2;
const LONG_MAX_SCORE = 5;

const CHAPTER_PROFILE = { mcq: 50, short: 10, long: 2 };

const CHARS_PER_MCQ = 250;
const CHARS_PER_TEXT_Q = 500;
const MIN_MCQ = 5;

/** Scales the target question counts down when a chapter's ingested content is too thin to
 *  safely support the full profile — forcing the full 50/10/2 against a short chapter is what
 *  produces near-duplicate or barely-grounded questions. Returns null when even the floor
 *  (MIN_MCQ worth of MCQs) can't be supported, meaning the caller should refuse outright rather
 *  than generate anything. */
function scaleCounts(
  totalChars: number,
  profile: { mcq: number; short: number; long: number }
): { mcq: number; short: number; long: number; partial: boolean } | null {
  const required = profile.mcq * CHARS_PER_MCQ + (profile.short + profile.long) * CHARS_PER_TEXT_Q;
  if (totalChars >= required) return { ...profile, partial: false };

  const minRequired = MIN_MCQ * CHARS_PER_MCQ;
  if (totalChars < minRequired) return null;

  const ratio = totalChars / required;
  return {
    mcq: profile.mcq > 0 ? Math.min(profile.mcq, Math.max(MIN_MCQ, Math.round(profile.mcq * ratio))) : 0,
    short: profile.short > 0 ? Math.min(profile.short, Math.round(profile.short * ratio)) : 0,
    long: profile.long > 0 ? Math.min(profile.long, Math.round(profile.long * ratio)) : 0,
    partial: true,
  };
}

function batchSizes(total: number, maxPerBatch: number): number[] {
  const sizes: number[] = [];
  let remaining = total;
  while (remaining > 0) {
    const size = Math.min(maxPerBatch, remaining);
    sizes.push(size);
    remaining -= size;
  }
  return sizes;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Max questions asked for per Gemini call. Gemini's free tier caps requests at 15/minute
// (a separate, tighter limit than the input-token quota) — a chapter-scope quiz that split
// MCQs into 5 batches of 10 fired 7 concurrent calls (5 MCQ + short + long) per generation,
// which alone ate nearly the whole per-minute request budget and left no headroom for retries
// or other app features (chat/ask) sharing the same quota. Larger, fewer batches trade a
// slightly higher per-call truncation risk (mitigated by callGemini's one retry) for staying
// well under the request-count ceiling.
const MCQ_MAX_PER_BATCH = 25;

// Per-batch context budgets, in characters. Handing every batch the FULL chapter's chunk set
// (as opposed to just shuffling the order) multiplies token usage by the number of concurrent
// batches — a ~130K-char chapter with several MCQ batches ran concurrent calls each carrying
// the whole chapter, which blew through Gemini's free-tier per-minute input-token quota (250K
// tokens/min) in one request. Sampling a bounded slice per batch keeps total usage sane while
// still giving each batch (and each regeneration) a different, shuffled view of the corpus.
const MCQ_BATCH_CHAR_BUDGET = 16000;
const TEXT_BATCH_CHAR_BUDGET = 12000;

function sampleChunksForBudget<T extends { content: string }>(chunks: T[], charBudget: number): T[] {
  const shuffled = shuffle(chunks);
  const picked: T[] = [];
  let total = 0;
  for (const c of shuffled) {
    if (total >= charBudget && picked.length > 0) break;
    picked.push(c);
    total += c.content.length;
  }
  return picked;
}

async function callGeminiOnce(ai: GoogleGenAI, model: string, prompt: string): Promise<unknown[] | null> {
  try {
    const res = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.35 },
    });
    const text = res.text?.trim();
    if (!text) return null;
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    console.warn('Quiz batch generation failed:', err);
    return null;
  }
}

/** One retry on top of callGeminiOnce — occasional truncated/malformed JSON from the model is
 *  common enough at this batch volume that a single retry meaningfully improves how often a
 *  batch actually contributes its full question count, without adding much latency (batches
 *  already run in parallel, so one retry costs one extra round-trip for the batches that need
 *  it, not a serial multiplier across all of them). */
async function callGemini(ai: GoogleGenAI, model: string, prompt: string): Promise<unknown[] | null> {
  const first = await callGeminiOnce(ai, model, prompt);
  if (first && first.length > 0) return first;
  return callGeminiOnce(ai, model, prompt);
}

/** Validates each generated question's citation against the chunks that batch was actually
 *  shown. A question citing a chunk id that doesn't exist is DISCARDED, never reassigned —
 *  substituting a real chunk would give a hallucinated question real-looking provenance,
 *  which is worse than dropping it. */
function validateMcq(parsed: unknown[], chunks: SourceChunk[]): QuizQuestionData[] {
  return parsed
    .map((raw, idx) => {
      const q = raw as any;
      const matchedChunk = chunks.find((c) => c.id === q.chunkId);
      if (!matchedChunk) {
        console.warn(`Quiz: discarding MCQ ${q.id ?? idx} — cites unknown chunk "${q.chunkId}"`);
        return null;
      }
      if (!q.stem || !Array.isArray(q.options) || typeof q.correctIndex !== 'number') {
        console.warn(`Quiz: discarding MCQ ${q.id ?? idx} — malformed`);
        return null;
      }
      const question: QuizQuestionData = {
        // Never trust the model's own "id" field for uniqueness — it numbers each batch/type
        // independently (every batch tends to start again at "q-1"), so keeping it verbatim
        // produces id collisions across question types that corrupt answer-token grading.
        id: `mcq-${idx}-${Math.random().toString(36).slice(2, 10)}`,
        position: 0,
        stem: q.stem,
        questionType: 'mcq',
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation ?? '',
        chunkId: matchedChunk.id,
        chapterNo: matchedChunk.chapterNo,
        page: matchedChunk.pageFrom ?? 0,
        section: matchedChunk.section ?? '',
      };
      return question;
    })
    .filter((q): q is QuizQuestionData => q !== null);
}

function validateText(
  parsed: unknown[],
  chunks: SourceChunk[],
  type: 'short' | 'long',
  maxScore: number
): QuizQuestionData[] {
  return parsed
    .map((raw, idx) => {
      const q = raw as any;
      const matchedChunk = chunks.find((c) => c.id === q.chunkId);
      if (!matchedChunk) {
        console.warn(`Quiz: discarding ${type} question ${q.id ?? idx} — cites unknown chunk "${q.chunkId}"`);
        return null;
      }
      if (!q.stem || !q.modelAnswer) {
        console.warn(`Quiz: discarding ${type} question ${q.id ?? idx} — malformed`);
        return null;
      }
      const question: QuizQuestionData = {
        // Same reasoning as validateMcq above — never trust the model's self-assigned id.
        id: `${type}-${idx}-${Math.random().toString(36).slice(2, 10)}`,
        position: 0,
        stem: q.stem,
        questionType: type,
        modelAnswer: q.modelAnswer,
        rubric: q.rubric ?? '',
        maxScore,
        chunkId: matchedChunk.id,
        chapterNo: matchedChunk.chapterNo,
        page: matchedChunk.pageFrom ?? 0,
        section: matchedChunk.section ?? '',
      };
      return question;
    })
    .filter((q): q is QuizQuestionData => q !== null);
}

async function generateQuestions(
  ai: GoogleGenAI,
  model: string,
  type: QuestionType,
  count: number,
  chunks: SourceChunk[],
  board: string,
  classLevel: number,
  subject: string,
  chapterNo: number,
  avoidStems: string[]
): Promise<QuizQuestionData[]> {
  if (count <= 0) return [];

  const chunkText = chunks
    .map((c) => `[CHUNK id="${c.id}" page="${c.pageFrom ?? ''}" section="${c.section ?? ''}"]\n${c.content}\n[/CHUNK]`)
    .join('\n\n');
  const scopeDesc = `Chapter ${chapterNo}`;
  const avoidBlock =
    avoidStems.length > 0
      ? `\n\nDo not repeat or closely paraphrase any of these previously-asked questions:\n${avoidStems
          .map((s) => `- ${s}`)
          .join('\n')}`
      : '';

  const prompt =
    type === 'mcq'
      ? `Based ONLY on the syllabus chunks below, generate ${count} multiple choice questions (MCQs) for ${board} Class ${classLevel} ${subject}, ${scopeDesc}.
Each MCQ must have exactly 4 options, a 0-indexed correct answer, a brief explanation citing the textbook fact, and the chunkId it was derived from.${avoidBlock}

CONTEXT:
${chunkText}

Return strictly a JSON array of objects in this shape:
[{"id":"q-1","stem":"Question text here?","options":["A","B","C","D"],"correctIndex":0,"explanation":"Why this is correct according to the syllabus...","chunkId":"<a chunk id from above>"}]`
      : `Based ONLY on the syllabus chunks below, generate ${count} ${
          type === 'short' ? 'short-answer (2-3 sentence)' : 'long-answer (detailed, multi-paragraph)'
        } questions for ${board} Class ${classLevel} ${subject}, ${scopeDesc}.
For each question, provide a model answer and a brief grading rubric (what a correct answer must cover), and the chunkId it was derived from.${avoidBlock}

CONTEXT:
${chunkText}

Return strictly a JSON array of objects in this shape:
[{"id":"q-1","stem":"Question text here?","modelAnswer":"The ideal answer...","rubric":"Must mention X, Y, Z...","chunkId":"<a chunk id from above>"}]`;

  const parsed = await callGemini(ai, model, prompt);
  if (!parsed) return [];

  return type === 'mcq'
    ? validateMcq(parsed, chunks)
    : validateText(parsed, chunks, type, type === 'short' ? SHORT_MAX_SCORE : LONG_MAX_SCORE);
}

const MAX_DRAFTS_PER_USER = 20;

/** Parks a freshly generated quiz as a resumable draft (quiz_drafts) for a logged-in student,
 *  so it survives logout and shows up on another device. Best-effort: a failure here never
 *  blocks the quiz response — the student can still take it right now, it just won't be
 *  resumable elsewhere, same resilience posture as persistQuiz(). NOT a "quiz taken" record:
 *  the row is deleted on submit (/api/quiz/grade) or when this chapter is regenerated. */
async function parkDraft(
  ctx: {
    admin: SupabaseClient | null;
    userId: string | null;
    board: string;
    classLevel: number;
    subject: string;
    chapterNo: number;
    chapterTitle: string;
    partial: boolean;
    effectiveCounts: { mcq: number; short: number; long: number };
  },
  quizToken: string,
  publicQuestions: PublicQuizQuestion[]
): Promise<string | null> {
  const { admin, userId } = ctx;
  if (!admin || !userId) return null;

  try {
    const { data, error } = await admin
      .from('quiz_drafts')
      .upsert(
        {
          user_id: userId,
          board_code: ctx.board,
          class_level: ctx.classLevel,
          subject_code: ctx.subject,
          chapter_no: ctx.chapterNo,
          chapter_title: ctx.chapterTitle,
          quiz_token: quizToken,
          questions: publicQuestions,
          answers: {},
          is_partial: ctx.partial,
          effective_counts: ctx.effectiveCounts,
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,board_code,class_level,subject_code,chapter_no' }
      )
      .select('id')
      .single();

    if (error || !data) {
      console.warn('Quiz: quiz_drafts upsert failed:', error?.message);
      return null;
    }

    // Keep the parked-draft list bounded per student.
    const { data: extra } = await admin
      .from('quiz_drafts')
      .select('id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(MAX_DRAFTS_PER_USER, MAX_DRAFTS_PER_USER + 50);
    if (extra && extra.length > 0) {
      await admin.from('quiz_drafts').delete().in('id', extra.map((r) => r.id));
    }

    return data.id as string;
  } catch (err) {
    console.warn('Quiz: quiz_drafts upsert threw:', err);
    return null;
  }
}

/** Builds the response for a freshly generated quiz. Does NOT touch quizzes/quiz_questions/etc
 *  — the quiz is only persisted as real normalized rows when the student submits an attempt
 *  (/api/quiz/grade), which the sealed token carries everything necessary for. It IS parked as
 *  a disposable quiz_drafts row (see parkDraft) so a logged-in student can resume it later. */
async function respondWithQuiz(
  questions: QuizQuestionData[],
  ctx: {
    chapterId: string | null;
    admin: SupabaseClient | null;
    userId: string | null;
    board: string;
    classLevel: number;
    subject: string;
    chapterNo: number;
    chapterTitle: string;
    partial: boolean;
    effectiveCounts: { mcq: number; short: number; long: number };
  },
  extra: Record<string, unknown>
) {
  const tokenQuestions: QuizTokenQuestion[] = questions.map((q) =>
    q.questionType === 'mcq'
      ? {
          id: q.id,
          position: q.position,
          stem: q.stem,
          questionType: 'mcq',
          chunkId: isRealChunkId(q.chunkId) ? q.chunkId : null,
          options: q.options!,
          correctIndex: q.correctIndex!,
          explanation: q.explanation ?? '',
        }
      : {
          id: q.id,
          position: q.position,
          stem: q.stem,
          questionType: q.questionType,
          chunkId: isRealChunkId(q.chunkId) ? q.chunkId : null,
          modelAnswer: q.modelAnswer ?? '',
          rubric: q.rubric ?? '',
          maxScore: q.maxScore ?? SHORT_MAX_SCORE,
        }
  );

  const quizToken = sealQuizToken({ chapterId: ctx.chapterId, topicLabel: null, questions: tokenQuestions });

  const publicQuestions: PublicQuizQuestion[] = questions.map(
    ({ correctIndex: _correctIndex, explanation: _explanation, modelAnswer: _modelAnswer, rubric: _rubric, ...rest }) => rest
  );

  const draftId = await parkDraft(
    {
      admin: ctx.admin,
      userId: ctx.userId,
      board: ctx.board,
      classLevel: ctx.classLevel,
      subject: ctx.subject,
      chapterNo: ctx.chapterNo,
      chapterTitle: ctx.chapterTitle,
      partial: ctx.partial,
      effectiveCounts: ctx.effectiveCounts,
    },
    quizToken,
    publicQuestions
  );

  return NextResponse.json({ questions: publicQuestions, quizToken, draftId, ...extra });
}

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
    // Supabase isn't configured at all (same pattern /api/quiz/scope already uses) — never a
    // silent substitute for content that's simply missing for this specific chapter.
    const dbChunks = await fetchChunksFromDb(admin, board, classLevel, subject, chapterNo);
    const matchingChunks: SourceChunk[] =
      dbChunks ??
      INITIAL_SYLLABUS_CHUNKS.filter((c) => c.chapterNo === chapterNo && c.subject.toLowerCase() === subject).map(
        (c) => ({
          id: c.id,
          content: c.content,
          pageFrom: c.pageFrom,
          section: c.section,
          chapterNo: c.chapterNo,
          chapterTitle: c.chapterTitle,
        })
      );

    if (matchingChunks.length === 0) {
      return NextResponse.json(
        { error: `No ingested textbook content for ${board} Class ${classLevel} ${subject} Chapter ${chapterNo} yet.` },
        { status: 404 }
      );
    }

    const totalChars = matchingChunks.reduce((sum, c) => sum + c.content.length, 0);
    const counts = scaleCounts(totalChars, CHAPTER_PROFILE);
    if (!counts) {
      return NextResponse.json(
        {
          error:
            'Not enough ingested content to safely generate a quiz for this chapter yet. Try a different one, or check back once more content has been ingested.',
        },
        { status: 404 }
      );
    }

    const chapterTitle =
      matchingChunks[0].chapterTitle ||
      CHAPTER_DIRECTORY.find((c) => c.chapterNo === chapterNo)?.chapterTitle ||
      `Chapter ${chapterNo}`;

    let chapterId: string | null = null;
    if (admin) {
      chapterId = await resolveChapterId(admin, board, classLevel, subject, chapterNo, chapterTitle);
    }

    let recentStems: string[] = [];
    if (user && admin && chapterId) {
      recentStems = await fetchRecentStems(admin, user.id, chapterId, null);
    }

    const ai = getGeminiClient();
    if (!ai) {
      return NextResponse.json(
        { error: 'Quiz generation is temporarily unavailable — the generation service is not configured.' },
        { status: 503 }
      );
    }

    const model = process.env.CHAT_MODEL || 'gemini-3.5-flash-lite';

    // Each batch gets its own bounded, shuffled sample of the retrieved chunks — both to keep
    // total token usage across concurrent batches sane (see sampleChunksForBudget above) and,
    // combined with the recent-stems "avoid these" instruction, to keep repeat generations for
    // the same chapter meaningfully different from one another.
    const mcqPromises = batchSizes(counts.mcq, MCQ_MAX_PER_BATCH).map((size) =>
      generateQuestions(
        ai, model, 'mcq', size, sampleChunksForBudget(matchingChunks, MCQ_BATCH_CHAR_BUDGET),
        board, classLevel, subject, chapterNo, recentStems
      )
    );
    const shortPromise = generateQuestions(
      ai, model, 'short', counts.short, sampleChunksForBudget(matchingChunks, TEXT_BATCH_CHAR_BUDGET),
      board, classLevel, subject, chapterNo, recentStems
    );
    const longPromise = generateQuestions(
      ai, model, 'long', counts.long, sampleChunksForBudget(matchingChunks, TEXT_BATCH_CHAR_BUDGET),
      board, classLevel, subject, chapterNo, recentStems
    );

    const [mcqBatches, shortQuestions, longQuestions] = await Promise.all([
      Promise.all(mcqPromises),
      shortPromise,
      longPromise,
    ]);

    const mcqQuestions = mcqBatches.flat();
    // Reading order: MCQs first, then short answer, then long answer.
    const allQuestions = [...mcqQuestions, ...shortQuestions, ...longQuestions].map((q, idx) => ({
      ...q,
      position: idx + 1,
    }));

    if (allQuestions.length === 0) {
      return NextResponse.json(
        { error: 'Quiz generation is temporarily unavailable for this request. Please try again shortly.' },
        { status: 503 }
      );
    }

    const requestedTotal = CHAPTER_PROFILE.mcq + CHAPTER_PROFILE.short + CHAPTER_PROFILE.long;
    const partial = counts.partial || allQuestions.length < requestedTotal;
    const effectiveCounts = { mcq: mcqQuestions.length, short: shortQuestions.length, long: longQuestions.length };

    return respondWithQuiz(
      allQuestions,
      {
        chapterId,
        admin,
        userId: user?.id ?? null,
        board,
        classLevel,
        subject,
        chapterNo,
        chapterTitle,
        partial,
        effectiveCounts,
      },
      {
        chapterNo,
        subject,
        partial,
        requestedCounts: CHAPTER_PROFILE,
        effectiveCounts,
      }
    );
  } catch (error) {
    console.error('Quiz API error:', error);
    return NextResponse.json({ error: 'Failed to generate quiz' }, { status: 500 });
  }
}
