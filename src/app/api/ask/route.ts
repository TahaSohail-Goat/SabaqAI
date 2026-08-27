import { NextRequest, NextResponse } from 'next/server';
import { retrieve, getNearestChapters } from '@/lib/ai/retrieval';
import { evaluateConfidence } from '@/lib/ai/guardrail';
import { generateGroundedAnswer } from '@/lib/ai/generation';
import { validateCitations } from '@/lib/ai/citation';
import { logQuestion } from '@/lib/qa-log';
import type { AskResponse, Language } from '@/lib/types';

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = await req.json();
    const {
      question,
      board = 'PCTB',
      classLevel = 10,
      subject = 'physics',
      language = 'en',
    } = body;

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
            : "This topic is outside your registered board syllabus or not covered in the textbook. Sabaq AI refuses off-syllabus questions instead of guessing.",
        nearestChapters,
        suggestion:
          subject.toLowerCase() === 'physics'
            ? "Try asking about Class 10 Physics topics like 'Ohm's law', 'Electric current', 'Joule's law', 'Electromagnetic induction', or 'Transformer'."
            : 'Try rephrasing with specific textbook chapter terminology.',
      };

      await logQuestion({
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
    });

    // 4. Citation Validation
    const validation = validateCitations(rawAnswer, retrievedChunks);

    if (!validation.ok) {
      const nearestChapters = getNearestChapters(retrievedChunks);
      const refusalResponse: AskResponse = {
        status: 'refused',
        reason: 'ungrounded_output',
        message:
          "The generation could not be rigorously grounded in verified textbook citations. Sabaq AI refuses ungrounded answers to prevent exam misinformation.",
        nearestChapters,
        suggestion: "Please try specifying a particular chapter or concept from the syllabus.",
      };

      await logQuestion({
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
        reason: 'low_similarity',
        message: 'Unable to safely process question against the syllabus database.',
        // Retrieval never completed, so there is nothing to be "nearest" to. Say nothing
        // rather than suggesting chapters we didn't actually score.
        nearestChapters: [],
        suggestion: 'Please try again with a syllabus question.',
      },
      { status: 500 }
    );
  }
}
