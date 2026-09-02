// One in-progress quiz draft — GET to resume it, PATCH to autosave answers, DELETE to discard.
//
// The token stored on the row is never decrypted here: everything the /quiz page needs to
// render is in the plain columns, and the token is an opaque pass-through it hands back to
// /api/quiz/grade on submit. quiz_answer_keys / rubrics stay out of the browser exactly as
// before — the stored `questions` column is the browser-safe list /api/quiz already returns.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { TOKEN_TTL_MS } from '@/lib/quiz/answer-key';

export interface QuizDraftDetail {
  id: string;
  subject: string;
  chapterNo: number;
  chapterTitle: string | null;
  questions: unknown[];
  answers: Record<string, number | string>;
  quizToken: string;
  isPartial: boolean;
  effectiveCounts: { mcq: number; short: number; long: number } | null;
  generatedAt: string;
  expired: boolean;
}

async function ownedDraft(id: string, userId: string) {
  const admin = getServiceRoleClient();
  if (!admin) return { admin: null, row: null };
  const { data } = await admin
    .from('quiz_drafts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  // Not-found and not-yours are the same 404.
  if (!data || data.user_id !== userId) return { admin, row: null };
  return { admin, row: data as any };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await getCurrentUserAndProfile();
    if (!user) return NextResponse.json({ error: 'You need to be logged in.' }, { status: 401 });

    const { row } = await ownedDraft(id, user.id);
    if (!row) return NextResponse.json({ error: 'This quiz draft could not be found.' }, { status: 404 });

    const detail: QuizDraftDetail = {
      id: row.id,
      subject: row.subject_code,
      chapterNo: row.chapter_no,
      chapterTitle: row.chapter_title || null,
      questions: Array.isArray(row.questions) ? row.questions : [],
      answers: (row.answers ?? {}) as Record<string, number | string>,
      quizToken: row.quiz_token,
      isPartial: !!row.is_partial,
      effectiveCounts: row.effective_counts ?? null,
      generatedAt: row.generated_at,
      expired: Date.now() - new Date(row.generated_at).getTime() > TOKEN_TTL_MS,
    };
    return NextResponse.json(detail);
  } catch (error) {
    console.error('Quiz draft GET error:', error);
    return NextResponse.json({ error: 'Could not load this quiz draft.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await getCurrentUserAndProfile();
    if (!user) return NextResponse.json({ error: 'You need to be logged in.' }, { status: 401 });

    const body = await req.json();
    const answers = body?.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return NextResponse.json({ error: 'answers must be an object.' }, { status: 400 });
    }

    const { admin, row } = await ownedDraft(id, user.id);
    if (!admin || !row) return NextResponse.json({ error: 'This quiz draft could not be found.' }, { status: 404 });

    const { error } = await admin
      .from('quiz_drafts')
      .update({ answers, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Quiz draft PATCH failed:', error.message);
      return NextResponse.json({ error: 'Could not save your progress.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Quiz draft PATCH error:', error);
    return NextResponse.json({ error: 'Could not save your progress.' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await getCurrentUserAndProfile();
    if (!user) return NextResponse.json({ error: 'You need to be logged in.' }, { status: 401 });

    const { admin, row } = await ownedDraft(id, user.id);
    if (!admin || !row) return NextResponse.json({ error: 'This quiz draft could not be found.' }, { status: 404 });

    const { error } = await admin.from('quiz_drafts').delete().eq('id', id);
    if (error) {
      console.error('Quiz draft DELETE failed:', error.message);
      return NextResponse.json({ error: 'Could not discard this quiz draft.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Quiz draft DELETE error:', error);
    return NextResponse.json({ error: 'Could not discard this quiz draft.' }, { status: 500 });
  }
}
