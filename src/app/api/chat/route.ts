import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { streamChatReply, ChatGenerationAbortedError } from '@/lib/ai/chat-generation';
import { getConversation, createConversation, appendMessages } from '@/lib/chat/persist';
import { resolveChatModel } from '@/lib/chat/models';
import type { ChatAttachment, ChatResponse } from '@/lib/types';

// Live Gemini/Groq calls plus attacker-controlled binary uploads are a real cost/abuse vector
// /api/ask doesn't have (that route is retrieval-only, no auth check). Login is required here,
// not just via the page's proxy guard, since the proxy explicitly skips everything under
// /api/ (see src/proxy.ts).
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB — conservative under Gemini's ~20MB inline-request ceiling

function errorResponse(message: string, status: number) {
  const body: ChatResponse = { status: 'error', message };
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest) {
  try {
    const { user, profile } = await getCurrentUserAndProfile();
    const admin = getServiceRoleClient();
    if (!user || !admin) {
      return errorResponse('You need to be logged in to use chat.', 401);
    }

    const form = await req.formData();

    const message = form.get('message');
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return errorResponse('A message is required.', 400);
    }
    const trimmedMessage = message.trim();

    const model = resolveChatModel(form.get('modelId'));

    // History comes from the database, not the client — a conversation is real and persisted,
    // so there's no reason to trust (or require) the browser to resend everything it already
    // sent us. conversationId is optional: omitted means "start a new conversation."
    const conversationIdRaw = form.get('conversationId');
    let conversationId = typeof conversationIdRaw === 'string' && conversationIdRaw ? conversationIdRaw : null;

    let history: { role: 'user' | 'model'; text: string }[] = [];
    if (conversationId) {
      const conversation = await getConversation(admin, conversationId, user.id);
      if (!conversation) {
        return errorResponse('That conversation no longer exists.', 404);
      }
      history = conversation.messages;
    }

    let attachment: ChatAttachment | undefined;
    const file = form.get('file');
    if (file instanceof File) {
      if (!model.supportsAttachments) {
        return errorResponse(`${model.label} doesn't support attachments. Switch to a Gemini model or remove the file.`, 400);
      }
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

    // The conversation row (and its id, needed for the response header) can be created up
    // front — its title only depends on the user's message, which we already have, and doing
    // it before streaming starts means the client knows which conversation it's in from the
    // very first byte rather than waiting for the whole reply.
    if (!conversationId) {
      conversationId = await createConversation(admin, user.id, trimmedMessage);
      if (!conversationId) {
        return errorResponse('Could not start a new conversation. Please try again.', 500);
      }
    }
    const finalConversationId = conversationId;

    const encoder = new TextEncoder();
    let fullReply = '';

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // Once the client disconnects (Stop click, or a dropped connection), calling enqueue or
        // close on this controller throws — Web Streams semantics, not a bug. That throw must
        // never be allowed to happen INSIDE the finally block below, because a thrown close()
        // would skip every statement after it in that block, including the persistence call —
        // which is exactly how the first version of this route silently lost every interrupted
        // reply. Persistence is deliberately unconditional on the stream's state.
        const safeEnqueue = (text: string) => {
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            // Client already gone — nothing to deliver, but generation (and fullReply) continues.
          }
        };

        try {
          for await (const piece of streamChatReply({
            message: trimmedMessage,
            history,
            attachment,
            modelId: model.id,
            signal: req.signal,
            promptInput: {
              board: typeof board === 'string' && board ? board : profile?.board,
              classLevel: typeof classLevel === 'string' && classLevel ? Number(classLevel) : profile?.classLevel,
              name: profile?.username || undefined,
              subjects: profile?.subjects,
              examDate: profile?.examDate,
              preferredLanguage: profile?.language,
            },
          })) {
            fullReply += piece;
            safeEnqueue(piece);
          }
        } catch (err) {
          // An interrupted-by-the-student stream isn't a failure — whatever text made it
          // through before the Stop click is still saved below, same as a clean finish.
          if (!(err instanceof ChatGenerationAbortedError) && !req.signal.aborted) {
            console.error('API /api/chat stream error:', err);
            const message = err instanceof Error ? err.message : 'Something went wrong generating a reply.';
            // The client is mid-stream by now (headers already sent), so an error can't switch
            // back to a JSON error response — surface it as visible reply text instead of
            // silently truncating.
            if (!fullReply) {
              safeEnqueue(message);
              fullReply = message;
            }
          }
        } finally {
          try {
            controller.close();
          } catch {
            // Already closed/errored (client disconnected) — fine, persistence below still runs.
          }
          if (fullReply.trim()) {
            await appendMessages(admin, finalConversationId, [
              {
                role: 'user',
                content: trimmedMessage,
                attachmentName: attachment?.name,
                attachmentMimeType: attachment?.mimeType,
              },
              { role: 'model', content: fullReply },
            ]);
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Conversation-Id': finalConversationId,
      },
    });
  } catch (error: unknown) {
    console.error('API /api/chat error:', error);
    return errorResponse('Something went wrong. Please try again.', 500);
  }
}
