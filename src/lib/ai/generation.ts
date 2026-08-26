// Grounded generation. Only called when the guardrail returns PASS or BORDERLINE.
// The prompt receives ONLY retrieved chunks + the question. No outside knowledge.
// Output is parsed against GroundedAnswer — never scraped from prose.

import type { GroundedAnswer, RetrievedChunk, Language } from '../types';

export async function generateGroundedAnswer(_args: {
  question: string;
  language: Language;
  chunks: RetrievedChunk[];
}): Promise<GroundedAnswer> {
  // If you ever add a console.log here, it must NOT fire on a refusal question.
  // That is your proof the gate works — see build-plan Day 3.
  //
  // 1. Build the prompt from src/prompts/grounded-answer.md, inserting the chunks as
  //    delimited [CHUNK id=...] blocks and the question in a separate section.
  // 2. Call the chat model, requesting JSON output.
  // 3. Parse and validate against GroundedAnswer. Retry once on invalid JSON, then throw.
  throw new Error('generateGroundedAnswer() not implemented — build on Day 3');
}
