import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { transcribeAudio } from '@/lib/ai/transcription';
import type { TranscribeResponse } from '@/lib/types';

// Same login-required posture as /api/chat: a real API call against attacker-controlled binary
// uploads, gated here (not just by the page's proxy guard, which skips everything under
// /api/ — see src/proxy.ts).
const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20MB — comfortably covers a multi-minute voice note

function errorResponse(message: string, status: number) {
  const body: TranscribeResponse = { status: 'error', message };
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUserAndProfile();
    if (!user) {
      return errorResponse('You need to be logged in to use voice input.', 401);
    }

    const form = await req.formData();
    const file = form.get('audio');
    if (!(file instanceof File)) {
      return errorResponse('No audio was received.', 400);
    }
    if (file.size === 0) {
      return errorResponse('That recording was empty. Please try again.', 400);
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return errorResponse('That recording is too long. Keep voice notes under a couple of minutes.', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await transcribeAudio(buffer, file.type || 'audio/webm', file.name || 'voice-note.webm');

    if (!text) {
      return errorResponse("Couldn't make out any speech in that recording. Please try again.", 422);
    }

    const successResponse: TranscribeResponse = { status: 'ok', text };
    return NextResponse.json(successResponse);
  } catch (error: unknown) {
    console.error('API /api/chat/transcribe error:', error);
    return errorResponse('Voice transcription is unavailable right now. Please type your message instead.', 502);
  }
}
