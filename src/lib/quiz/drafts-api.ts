// Client wrappers for the server-side in-progress quiz store (quiz_drafts). Replaces the old
// localStorage module — drafts now survive logout and are the same on any device the student
// signs in on. src/lib/persist/page-progress.ts still handles instant same-tab refresh.

import type { QuizDraftRow } from '@/app/api/quiz/drafts/route';
import type { QuizDraftDetail } from '@/app/api/quiz/drafts/[id]/route';

export type { QuizDraftRow, QuizDraftDetail };

/** In-progress quizzes for the signed-in student, newest-updated first. Returns [] on any
 *  failure — a drafts list that can't load should never break the page it's on. */
export async function listQuizDrafts(): Promise<QuizDraftRow[]> {
  try {
    const res = await fetch('/api/quiz/drafts');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.drafts) ? data.drafts : [];
  } catch {
    return [];
  }
}

export async function getQuizDraft(id: string): Promise<QuizDraftDetail | null> {
  try {
    const res = await fetch(`/api/quiz/drafts/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as QuizDraftDetail;
  } catch {
    return null;
  }
}

export async function saveQuizDraftAnswers(id: string, answers: Record<number, number | string>): Promise<void> {
  try {
    await fetch(`/api/quiz/drafts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
  } catch {
    // Best-effort autosave — a dropped PATCH just means this one keystroke isn't synced yet;
    // the next one will carry the full answers object again.
  }
}

export async function deleteQuizDraft(id: string): Promise<void> {
  try {
    await fetch(`/api/quiz/drafts/${id}`, { method: 'DELETE' });
  } catch {
    // best-effort
  }
}
