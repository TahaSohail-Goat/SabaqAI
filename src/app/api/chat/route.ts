import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { generateChatReply } from '@/lib/ai/chat-generation';
import type { ChatAttachment, ChatResponse, ChatTurn } from '@/lib/types';

// Live Gemini calls plus attacker-controlled binary uploads are a real cost/abuse vector /api/ask
// doesn't have (that route is retrieval-only, no auth check). Login is required here — checked
// here, not just via the page's middleware guard, since middleware explicitly skips everything
// under /api/ (see src/middleware.ts).
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB — conservative under Gemini's ~20MB inline-request ceiling

function errorResponse(message: string, status: number) {
  const body: ChatResponse = { status: 'error', message };
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUserAndProfile();
    if (!user) {
      return errorResponse('You need to be logged in to use chat.', 401);
    }

    const form = await req.formData();

    const message = form.get('message');
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return errorResponse('A message is required.', 400);
    }
    const trimmedMessage = message.trim();

    let history: ChatTurn[] = [];
    const historyRaw = form.get('history');
    if (typeof historyRaw === 'string' && historyRaw.length > 0) {
      try {
        const parsed = JSON.parse(historyRaw);
        if (Array.isArray(parsed)) history = parsed;
      } catch {
        // Malformed history from the client — degrade to no history rather than 500ing.
        history = [];
      }
    }

    let attachment: ChatAttachment | undefined;
    const file = form.get('file');
    if (file instanceof File) {
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return errorResponse('Unsupported file type. Attach a JPEG, PNG, WEBP image, or a PDF.', 400);
      }
      if (file.size > MAX_FILE_BYTES) {
        return errorResponse('File is too large. Attach something under 10MB.', 400);
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      attachment = {
        mimeType: file.type as ChatAttachment['mimeType'],
        name: file.name,
        dataBase64: buffer.toString('base64'),
      };
    }

    const board = form.get('board');
    const classLevel = form.get('classLevel');

    const result = await generateChatReply({
      message: trimmedMessage,
      history,
      attachment,
      promptInput: {
        board: typeof board === 'string' && board ? board : undefined,
        classLevel: typeof classLevel === 'string' && classLevel ? Number(classLevel) : undefined,
      },
    });

    if (!result.ok) {
      return errorResponse(result.reply, 502);
    }

    const successResponse: ChatResponse = { status: 'ok', reply: result.reply };
    return NextResponse.json(successResponse);
  } catch (error: unknown) {
    console.error('API /api/chat error:', error);
    return errorResponse('Something went wrong. Please try again.', 500);
  }
}
