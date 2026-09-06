import { NextRequest, NextResponse } from 'next/server';
import { retrieve, getNearestChapters } from '@/lib/ai/retrieval';
import { evaluateConfidence } from '@/lib/ai/guardrail';
import { generateGroundedAnswer } from '@/lib/ai/generation';
import { validateCitations } from '@/lib/ai/citation';
import { logQuestion } from '@/lib/qa-log';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import type { AskResponse, Language } from '@/lib/types';

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = await req.json();
    const {
      question,
      // FBISE is the only board this app actually offers (Settings, signup, the crawler all
      // agree) — PCTB was hardcoded here before, same mismatch bug Quiz/Syllabus also had.
      board = 'FBISE',
      classLevel = 10,
      subject = 'physics',
      language = 'en',
      // Which book/paper the student picked on /ask — see /api/ask/options. Both optional so
      // this route still works unscoped for any other caller; the /ask page itself always
      // sends both once a student has made a selection.
      sourceType,
      chapterNo,
    } = body;

    // Best-effort attribution for qa_log, so "Questions asked" can actually be counted per
    // student on the Dashboard — Ask itself still works fully for anonymous/demo sessions,
    // this just doesn't get attributed to anyone in that case.
    const { user } = await getCurrentUserAndProfile();
    const userId = user?.id ?? null;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return NextResponse.json(
        { error: 'Question is required' },
        { status: 400 }
      );
    }

    const trimmedQuestion = question.trim();

    // 1. Vector / Keyword retrieval filtered by curriculum
    const retrievedChunks = await retrieve({
      normalisedQuery: trimmedQuestion,
      board,
      classLevel: Number(classLevel),
      subject,
      sourceType: typeof sourceType === 'string' && sourceType ? sourceType : undefined,
      chapterNo: typeof chapterNo === 'number' ? chapterNo : undefined,
    });

    // 2. Confidence Gate
    const guardrail = evaluateConfidence(retrievedChunks);

    // CRITICAL: On REFUSE, the LLM is NEVER called.
    if (guardrail.decision === 'REFUSE') {
      const nearestChapters = getNearestChapters(retrievedChunks);
      const refusalResponse: AskResponse = {
        status: 'refused',
        reason: guardrail.reason || 'low_similarity',
        message:
          language === 'ur'
            ? 'یہ سوال آپ کے بورڈ سلیبس میں شامل نہیں ہے، اس لیے ہم نے اندازہ لگانے کے بجائے جواب روک دیا۔'
            : "This isn't part of your registered board syllabus, or it isn't covered in the textbook yet, so we're not going to guess.",
        nearestChapters,
        suggestion:
          nearestChapters.length > 0
            ? `Try asking about ${nearestChapters[0].chapterTitle ?? `Chapter ${nearestChapters[0].chapterNo}`} instead, or rephrase with specific textbook terminology.`
            : 'Try rephrasing with specific textbook chapter terminology.',
      };

      await logQuestion({
        userId,
        subject,
        questionLanguage: language,
        top1Score: guardrail.top1,
        supportCount: guardrail.support,
        decision: 'REFUSE',
        refusalReason: guardrail.reason || 'low_similarity',
        retrievedChunks,
        latencyMs: Date.now() - startedAt,
      });

      return NextResponse.json(refusalResponse);
    }

    // 3. Grounded Generation (only on PASS or BORDERLINE)
    const rawAnswer = await generateGroundedAnswer({
      question: trimmedQuestion,
      language: (language as Language) || 'en',
      chunks: retrievedChunks,
      board,
      classLevel: Number(classLevel),
      subject,
    });

    // 4. Citation Validation
    const validation = validateCitations(rawAnswer, retrievedChunks);

    if (!validation.ok) {
      const nearestChapters = getNearestChapters(retrievedChunks);
      const refusalResponse: AskResponse = {
        status: 'refused',
        reason: 'ungrounded_output',
        message:
          "The answer that came back couldn't be tied closely enough to specific textbook citations, so it's been held back rather than risk exam misinformation.",
        nearestChapters,
        suggestion: "Please try specifying a particular chapter or concept from the syllabus.",
      };

      await logQuestion({
        userId,
        subject,
        questionLanguage: language,
        top1Score: guardrail.top1,
        supportCount: guardrail.support,
        decision: guardrail.decision,
        refusalReason: 'ungrounded_output',
        retrievedChunks,
        latencyMs: Date.now() - startedAt,
      });

      return NextResponse.json(refusalResponse);
    }

    const successResponse: AskResponse = {
      status: 'answered',
      confidence: {
        band: guardrail.decision === 'PASS' ? 'high' : 'medium',
        top1: guardrail.top1,
        support: guardrail.support,
      },
      language: rawAnswer.language || (language as Language),
      statements: validation.statements,
      citations: validation.citations,
      notCovered: rawAnswer.notCovered || null,
    };

    await logQuestion({
      userId,
      subject,
      questionLanguage: language,
      top1Score: guardrail.top1,
      supportCount: guardrail.support,
      decision: guardrail.decision,
      retrievedChunks,
      citedChunkIds: validation.citations.map((c) => c.chunkId),
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(successResponse);
  } catch (error: unknown) {
    console.error('API /api/ask error:', error);
    return NextResponse.json(
      {
        status: 'refused',
        // Not an actual guardrail decision (retrieval never completed, so there's nothing to
        // score) — reusing 'low_similarity' here is a label of convenience, not a claim, since
        // it's the only reason value that doesn't imply a specific check ran and failed.
        reason: 'low_similarity',
        message: "Something went wrong on our end and we couldn't get an answer this time.",
        // Retrieval never completed, so there is nothing to be "nearest" to. Say nothing
        // rather than suggesting chapters we didn't actually score.
        nearestChapters: [],
        suggestion: 'Please try asking again in a moment.',
      },
      { status: 500 }
    );
  }
}
