// Open chat generation — the codebase's first multimodal Gemini call. Sibling to
// src/lib/ai/generation.ts, but deliberately NOT shared with it: that one is grounded-only,
// single-shot, chunk-in/JSON-out. This one is multi-turn (a Content[] history) and may carry an
// inline file part (image or PDF) on the current turn.

import type { Content, Part } from '@google/genai';
import type { ChatAttachment, ChatTurn } from '../types';
import { getGeminiClient } from '../gemini';
import { buildChatSystemInstruction, type ChatPromptInput } from '../../prompts/chat';

export interface ChatGenerationArgs {
  message: string;
  history: ChatTurn[];
  attachment?: ChatAttachment;
  promptInput: ChatPromptInput;
}

export interface ChatGenerationResult {
  ok: boolean;
  reply: string;
}

export async function generateChatReply(args: ChatGenerationArgs): Promise<ChatGenerationResult> {
  const { message, history, attachment, promptInput } = args;

  const ai = getGeminiClient();
  if (!ai) {
    console.error('No AI client configured (set GEMINI_API_KEY). Refusing rather than fabricating a reply.');
    return { ok: false, reply: 'Chat is not available right now — the AI service is not configured.' };
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

  const chatModel = process.env.CHAT_MODEL || 'gemini-2.5-flash';

  try {
    const response = await ai.models.generateContent({
      model: chatModel,
      contents,
      config: {
        systemInstruction: buildChatSystemInstruction(promptInput),
        temperature: 0.6,
      },
    });

    const text = response.text?.trim();
    if (text) {
      return { ok: true, reply: text };
    }
  } catch (err) {
    console.error('Gemini chat generation failed:', err);
  }

  return { ok: false, reply: 'Something went wrong generating a reply. Please try again.' };
}
