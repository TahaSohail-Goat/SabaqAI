// Grounded generation. Only called when the guardrail returns PASS or BORDERLINE.
// The prompt receives ONLY retrieved chunks + the question. No outside knowledge.
// Output is parsed against GroundedAnswer — never scraped from prose.

import type { GroundedAnswer, RetrievedChunk, Language } from '../types';
import { getGeminiClient } from '../gemini';
import { buildSystemInstruction, buildUserPrompt } from '../../prompts/grounded-answer';

export async function generateGroundedAnswer(args: {
  question: string;
  language: Language;
  chunks: RetrievedChunk[];
}): Promise<GroundedAnswer> {
  const { question, language, chunks } = args;

  if (!chunks || chunks.length === 0) {
    return {
      answerable: false,
      language,
      statements: [],
      notCovered: 'No relevant chunks found in the syllabus.'
    };
  }

  const ai = getGeminiClient();
  const chatModel = process.env.CHAT_MODEL || 'gemini-3.5-flash-lite';
  const promptInput = { question, language, chunks };

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: chatModel,
        contents: buildUserPrompt(promptInput),
        config: {
          systemInstruction: buildSystemInstruction(promptInput),
          responseMimeType: 'application/json',
          temperature: 0.1,
        }
      });

      const responseText = response.text?.trim();
      if (responseText) {
        // Strip markdown fences if any
        const cleaned = responseText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(cleaned) as GroundedAnswer;
        if (typeof parsed.answerable === 'boolean' && Array.isArray(parsed.statements)) {
          return parsed;
        }
      }
    } catch (err) {
      console.error('Gemini generation failed:', err);
    }
  } else {
    console.error(
      'No AI client configured (set GEMINI_API_KEY). Refusing rather than fabricating an answer.'
    );
  }

  // Generation was unavailable or failed. Return an UNANSWERABLE result so the route refuses.
  //
  // There was previously a "fallback" here that sliced the top chunk into sentences and returned
  // answerable: true. That is the single most dangerous thing this app could do — it renders as a
  // real answer, complete with a citation, but it is a raw paragraph dump that never read the
  // question. On stage, a rate-limited key would have silently turned every answer into that.
  // An honest refusal is always the correct failure mode here.
  return {
    answerable: false,
    language,
    statements: [],
    notCovered: 'The answer service is unavailable, so no grounded answer could be produced.',
  };
}
