// Open chat generation — streams text deltas so the UI can render progressively and so a
// student can interrupt a reply mid-generation (see chat/page.tsx's Stop button). Two providers:
// Gemini (multimodal — the only one that can see an attached image/PDF) and Groq (text-only,
// but noticeably faster — see src/lib/chat/models.ts for why both exist).

import type { Content, Part } from '@google/genai';
import type { ChatAttachment, ChatTurn } from '../types';
import { getGeminiClient } from '../gemini';
import { buildChatSystemInstruction, type ChatPromptInput } from '../../prompts/chat';
import { resolveChatModel } from '../chat/models';

export interface ChatGenerationArgs {
  message: string;
  history: ChatTurn[];
  attachment?: ChatAttachment;
  promptInput: ChatPromptInput;
  modelId?: string;
  signal?: AbortSignal;
}

/** Thrown to distinguish "the request was cancelled" from a genuine provider failure. */
export class ChatGenerationAbortedError extends Error {}

/**
 * Streams reply text as it's generated. Callers accumulate the yielded pieces themselves (for
 * persisting the full reply once the stream ends, or the partial reply if it's interrupted).
 */
export async function* streamChatReply(args: ChatGenerationArgs): AsyncGenerator<string> {
  const { message, history, attachment, promptInput, modelId, signal } = args;
  const model = resolveChatModel(modelId);
  const systemInstruction = buildChatSystemInstruction(promptInput);

  if (model.provider === 'gemini') {
    yield* streamGemini({ message, history, attachment, systemInstruction, modelId: model.id, signal });
  } else {
    yield* streamGroq({ message, history, systemInstruction, modelId: model.id, signal });
  }
}

async function* streamGemini(args: {
  message: string;
  history: ChatTurn[];
  attachment?: ChatAttachment;
  systemInstruction: string;
  modelId: string;
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const { message, history, attachment, systemInstruction, modelId, signal } = args;

  const ai = getGeminiClient();
  if (!ai) {
    console.error('No AI client configured (set GEMINI_API_KEY). Refusing rather than fabricating a reply.');
    throw new Error('Chat is not available right now — the AI service is not configured.');
  }

  // Prior turns are replayed TEXT-ONLY: attachment bytes from earlier turns are never resent
  // (see ChatTurn's comment in src/lib/types.ts), only the current turn may carry inlineData.
  const contents: Content[] = history.map((turn) => ({
    role: turn.role,
    parts: [{ text: turn.text }],
  }));

  const currentParts: Part[] = [{ text: message }];
  if (attachment) {
    currentParts.push({ inlineData: { mimeType: attachment.mimeType, data: attachment.dataBase64 } });
  }
  contents.push({ role: 'user', parts: currentParts });

  try {
    const stream = await ai.models.generateContentStream({
      model: modelId,
      contents,
      config: { systemInstruction, temperature: 0.6, abortSignal: signal },
    });

    for await (const chunk of stream) {
      if (signal?.aborted) throw new ChatGenerationAbortedError();
      if (chunk.text) yield chunk.text;
    }
  } catch (err) {
    if (signal?.aborted || err instanceof ChatGenerationAbortedError) {
      throw new ChatGenerationAbortedError();
    }
    console.error('Gemini chat generation failed:', err);
    throw new Error('Something went wrong generating a reply. Please try again.');
  }
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function* streamGroq(args: {
  message: string;
  history: ChatTurn[];
  systemInstruction: string;
  modelId: string;
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const { message, history, systemInstruction, modelId, signal } = args;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('Chat is not available right now — the AI service is not configured.');
  }

  const messages = [
    { role: 'system', content: systemInstruction },
    ...history.map((turn) => ({ role: turn.role === 'model' ? 'assistant' : 'user', content: turn.text })),
    { role: 'user', content: message },
  ];

  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId, messages, temperature: 0.6, stream: true }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw new ChatGenerationAbortedError();
    console.error('Groq chat generation failed:', err);
    throw new Error('Something went wrong generating a reply. Please try again.');
  }

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    console.error(`Groq chat generation failed (${response.status}):`, detail.slice(0, 400));
    throw new Error('Something went wrong generating a reply. Please try again.');
  }

  // OpenAI-compatible SSE: lines of `data: {...}`, terminated by `data: [DONE]`.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;

        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // Malformed/partial SSE frame — skip it rather than aborting the whole reply over one bad chunk.
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) throw new ChatGenerationAbortedError();
    throw err;
  }
}
