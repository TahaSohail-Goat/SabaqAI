'use client';

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { CalendarClock, Flag, Moon, Plus, Trash2, ChevronLeft, RefreshCw, Award, Sparkles, ArrowRight, Play, X } from 'lucide-react';
import { useScope } from '@/components/app/ScopeContext';
import EmptyState from '@/components/app/EmptyState';
import SectionHeader from '@/components/app/SectionHeader';
import StatCard from '@/components/app/StatCard';
import SelectField from '@/components/app/SelectField';
import MasteryBadge from '@/components/app/MasteryBadge';
import ActionBadge from '@/components/app/ActionBadge';
import { SUBJECT_LABELS } from '@/lib/subjects';
import { listQuizDrafts, deleteQuizDraft, type QuizDraftRow } from '@/lib/quiz/drafts-api';
import type { PlanSummary } from '@/app/api/dashboard/plan/route';
import type { PlanAction, PlanDetail, PlanItem } from '@/app/api/dashboard/plan/[id]/route';

interface Chapter {
  chapterNo: number;
  chapterTitle: string | null;
}

type View = 'list' | 'create' | 'detail';
type ScopePreset = 'single' | 'half' | 'full' | 'custom';

function urgencyClass(daysRemaining: number): string {
  if (daysRemaining <= 2) return 'bg-error-bg text-error';
  if (daysRemaining <= 6) return 'bg-quiz-light text-quiz';
  return 'bg-brand-light text-brand-dark';
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTimestamp(iso: string | number): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Full-scope resume link — see the arrivedViaLink comment in the quiz page. */
function draftResumeHref(d: QuizDraftRow): string {
  return `/quiz?draft=${encodeURIComponent(d.id)}&subject=${encodeURIComponent(d.subjectCode)}&chapterNo=${d.chapterNo}`;
}

function quizScorePill(score: number, total: number): string {
  const pct = total > 0 ? (score / total) * 100 : 0;
  if (pct >= 70) return 'bg-brand-light text-brand-dark';
  if (pct >= 40) return 'bg-quiz-light text-quiz';
  return 'bg-error-bg text-error';
}

interface GroupedPlanItem {
  chapterNo: number;
  chapterTitle: string | null;
  band: PlanItem['band'];
  actions: PlanAction[];
  rationale: string;
}

/** A chapter can carry two slots on the same day (e.g. Study + Quiz for a weak chapter) — group
 *  them into one block with both action badges rather than repeating the chapter title/rationale
 *  twice. Order (and therefore priority) is preserved: each chapter's block appears at its first
 *  slot's position. */
function groupDayItems(items: PlanItem[]): GroupedPlanItem[] {
  const groups: GroupedPlanItem[] = [];
  const byChapter = new Map<number, GroupedPlanItem>();
  for (const item of items) {
    const existing = byChapter.get(item.chapterNo);
    if (existing) {
      existing.actions.push(item.action);
      continue;
    }
    const group: GroupedPlanItem = { chapterNo: item.chapterNo, chapterTitle: item.chapterTitle, band: item.band, actions: [item.action], rationale: item.rationale };
    byChapter.set(item.chapterNo, group);
    groups.push(group);
  }
  return groups;
}

/** Lets the day timeline scroll horizontally with a plain mouse wheel (translating vertical
 *  wheel delta into scrollLeft, since browsers don't do that by default without Shift held) and
 *  by click-and-drag — the visible OS scrollbar is hidden (.no-scrollbar) since these two
 *  gestures are the intended way to move through it.
 *
 *  A callback ref, not useRef + a mount-only effect: the scrollable div only exists once
 *  `detail` has loaded (DetailView shows a loading state first), so an effect with `[]` deps
 *  would fire once against `ref.current === null` and never attach anything once the real node
 *  appears. A callback ref re-fires every time React attaches/detaches the node, which is
 *  exactly when listeners need to be (re)attached. */
function useHorizontalScroll<T extends HTMLElement>() {
  const cleanupRef = useRef<(() => void) | null>(null);
  return useCallback((el: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };

    // Only start a real drag (and only then capture the pointer) once the pointer has moved
    // past a small threshold. Capturing on pointerdown unconditionally re-targets the click
    // compat-event to this container, which swallows clicks on links/buttons inside the
    // timeline (the "Practice quiz" link never navigated).
    const DRAG_THRESHOLD = 5;
    let pointerId: number | null = null;
    let dragging = false;
    let startX = 0;
    let startScrollLeft = 0;
    const onPointerDown = (e: PointerEvent) => {
      pointerId = e.pointerId;
      dragging = false;
      startX = e.clientX;
      startScrollLeft = el.scrollLeft;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (pointerId === null) return;
      const dx = e.clientX - startX;
      if (!dragging) {
        if (Math.abs(dx) <= DRAG_THRESHOLD) return;
        dragging = true;
        el.setPointerCapture(pointerId);
      }
      el.scrollLeft = startScrollLeft - dx;
      e.preventDefault();
    };
    const onPointerUp = () => {
      if (dragging && pointerId !== null) {
        try {
          el.releasePointerCapture(pointerId);
        } catch {
          // capture may already be gone (pointercancel etc) — harmless
        }
      }
      dragging = false;
      pointerId = null;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointerleave', onPointerUp);
    cleanupRef.current = () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointerleave', onPointerUp);
    };
  }, []);
}

export default function PlanPage() {
  const { board, classLevel, profile } = useScope();
  const enrolledSubjects = profile?.subjects?.length ? profile.subjects : [];

  const [view, setView] = useState<View>('list');
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);

  const [formSubject, setFormSubject] = useState<string>(enrolledSubjects[0] ?? '');
  const [formChapters, setFormChapters] = useState<Chapter[]>([]);
  const [formFrom, setFormFrom] = useState<number | null>(null);
  const [formTo, setFormTo] = useState<number | null>(null);
  const [formScope, setFormScope] = useState<ScopePreset>('single');
  const [formDate, setFormDate] = useState<string>(profile?.examDate ?? '');
  const [formBuffer, setFormBuffer] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadPlans = () => {
    setPlans(null);
    fetch('/api/dashboard/plan')
      .then((res) => res.json())
      .then((data) => setPlans(data.plans ?? []))
      .catch(() => setPlans([]));
  };

  useEffect(() => {
    loadPlans();
  }, []);

  // Chapters for the form's subject — same endpoint the Quiz page uses.
  useEffect(() => {
    if (view !== 'create' || !formSubject) return;
    setFormChapters([]);
    setFormFrom(null);
    setFormTo(null);
    setFormScope('single');
    const params = new URLSearchParams({ board, classLevel: String(classLevel), subject: formSubject });
    fetch(`/api/quiz/scope?${params}`)
      .then((res) => res.json())
      .then((data) => {
        const chs: Chapter[] = data.chapters || [];
        setFormChapters(chs);
        if (chs.length > 0) {
          setFormFrom(chs[0].chapterNo);
          setFormTo(chs[0].chapterNo);
        }
      })
      .catch(() => setFormChapters([]));
  }, [view, formSubject, board, classLevel]);

  const openCreate = () => {
    setFormSubject(enrolledSubjects[0] ?? '');
    setFormDate(profile?.examDate ?? '');
    setFormBuffer(true);
    setFormScope('single');
    setFormError(null);
    setView('create');
  };

  const selectScope = (preset: ScopePreset) => {
    setFormScope(preset);
    if (preset === 'custom' || formChapters.length === 0) return;
    const min = formChapters[0].chapterNo;
    const max = formChapters[formChapters.length - 1].chapterNo;
    if (preset === 'single') {
      setFormFrom(min);
      setFormTo(min);
    } else if (preset === 'full') {
      setFormFrom(min);
      setFormTo(max);
    } else {
      setFormFrom(min);
      setFormTo(formChapters[Math.ceil(formChapters.length / 2) - 1].chapterNo);
    }
  };

  const submitCreate = async () => {
    if (formFrom === null || formTo === null || !formDate) return;
    setCreating(true);
    setFormError(null);
    try {
      const res = await fetch('/api/dashboard/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: formSubject,
          fromChapterNo: formFrom,
          toChapterNo: formTo,
          examDate: formDate,
          reserveBufferDay: formBuffer,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Could not create this plan.');
        return;
      }
      loadPlans();
      openDetail(data.id);
    } catch {
      setFormError('Could not reach the server. Check your connection.');
    } finally {
      setCreating(false);
    }
  };

  const openDetail = (id: string) => {
    setView('detail');
    setDetail(null);
    setDetailError(null);
    fetch(`/api/dashboard/plan/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setDetailError(data.error);
          return;
        }
        setDetail(data);
      })
      .catch(() => setDetailError('Could not reach the server.'));
  };

  const deletePlan = async (id: string) => {
    await fetch(`/api/dashboard/plan/${id}`, { method: 'DELETE' }).catch(() => {});
    setView('list');
    loadPlans();
  };

  const minDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    // NOT d.toISOString().slice(0, 10) — that converts to UTC first, which silently rolls the
    // date back by one for anyone in a positive UTC offset (Pakistan is +5, this app's entire
    // audience) during the first few hours after local midnight: "tomorrow" in their own
    // timezone reads back as "today" in UTC. That let the date picker offer a date the server's
    // own (correctly local) validation then rejected as not far enough in the future.
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between animate-fade-up">
        <p className="text-xs text-text-2 max-w-md">
          A computed schedule, not a generated one. Every day traces back to your real scores.
        </p>
        {view !== 'list' && (
          <button
            type="button"
            onClick={() => setView('list')}
            className="flex items-center gap-1.5 text-xs font-semibold text-navy-2 hover:text-navy transition cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to plans
          </button>
        )}
      </div>

      {view === 'list' && (
        <ListView plans={plans} onCreate={openCreate} onOpen={openDetail} />
      )}

      {view === 'create' && (
        <CreateView
          enrolledSubjects={enrolledSubjects}
          formSubject={formSubject}
          setFormSubject={setFormSubject}
          formChapters={formChapters}
          formFrom={formFrom}
          setFormFrom={setFormFrom}
          formTo={formTo}
          setFormTo={setFormTo}
          formScope={formScope}
          formDate={formDate}
          setFormDate={setFormDate}
          formBuffer={formBuffer}
          setFormBuffer={setFormBuffer}
          minDate={minDate}
          formError={formError}
          creating={creating}
          onSelectScope={selectScope}
          onSubmit={submitCreate}
        />
      )}

      {view === 'detail' && (
        <DetailView detail={detail} error={detailError} onDelete={deletePlan} />
      )}
    </div>
  );
}

function ListView({
  plans,
  onCreate,
  onOpen,
}: {
  plans: PlanSummary[] | null;
  onCreate: () => void;
  onOpen: (id: string) => void;
}) {
  if (plans === null) {
    return (
      <div className="bg-surface border border-border rounded-xl p-12 text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-brand animate-spin mx-auto" />
        <div className="text-sm text-navy-2">Loading your plans...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <button
        type="button"
        onClick={onCreate}
        className="flex items-center gap-2 px-5 py-2.5 bg-brand hover:bg-brand-dark text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" />
        New plan
      </button>

      {plans.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No plans yet"
          message="Pick a subject, a chapter range, and an exam date to get a day-by-day schedule that focuses on your weak chapters first."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {plans.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen(p.id)}
              className="text-left bg-surface border border-border rounded-2xl p-4 hover:shadow-sm transition space-y-2 cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-navy">{SUBJECT_LABELS[p.subject] || p.subject}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${urgencyClass(p.daysRemaining)}`}>
                  {p.daysRemaining <= 0 ? 'Today' : `${p.daysRemaining} day${p.daysRemaining === 1 ? '' : 's'} left`}
                </span>
              </div>
              <p className="text-[11px] text-text-2">
                Ch {p.fromChapterNo}
                {p.toChapterNo !== p.fromChapterNo ? `–${p.toChapterNo}` : ''} · Exam {formatDate(p.examDate)}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateView({
  enrolledSubjects,
  formSubject,
  setFormSubject,
  formChapters,
  formFrom,
  setFormFrom,
  formTo,
  setFormTo,
  formScope,
  formDate,
  setFormDate,
  formBuffer,
  setFormBuffer,
  minDate,
  formError,
  creating,
  onSelectScope,
  onSubmit,
}: {
  enrolledSubjects: string[];
  formSubject: string;
  setFormSubject: (v: string) => void;
  formChapters: Chapter[];
  formFrom: number | null;
  setFormFrom: (v: number) => void;
  formTo: number | null;
  setFormTo: (v: number) => void;
  formScope: ScopePreset;
  formDate: string;
  setFormDate: (v: string) => void;
  formBuffer: boolean;
  setFormBuffer: (v: boolean) => void;
  minDate: string;
  formError: string | null;
  creating: boolean;
  onSelectScope: (preset: ScopePreset) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-5 animate-fade-up max-w-xl">
      <SelectField id="plan-subject" label="Subject" value={formSubject} onChange={setFormSubject}>
        {enrolledSubjects.map((s) => (
          <option key={s} value={s}>
            {SUBJECT_LABELS[s] || s}
          </option>
        ))}
      </SelectField>

      {formChapters.length === 0 ? (
        <p className="text-xs text-text-2">No textbook chapters are available for this subject yet.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-text-2 uppercase tracking-wide">Scope</p>
            <div className="flex flex-wrap gap-2">
              <PresetButton label="Single chapter" active={formScope === 'single'} onClick={() => onSelectScope('single')} />
              <PresetButton label="Half book" active={formScope === 'half'} onClick={() => onSelectScope('half')} />
              <PresetButton label="Full book" active={formScope === 'full'} onClick={() => onSelectScope('full')} />
              <PresetButton label="Custom" active={formScope === 'custom'} onClick={() => onSelectScope('custom')} />
            </div>
          </div>

          {formScope === 'custom' && (
            <div className="flex gap-4 animate-fade-up">
              <SelectField id="plan-from" label="From chapter" value={String(formFrom ?? '')} onChange={(v) => setFormFrom(Number(v))} className="flex-1">
                {formChapters.map((c) => (
                  <option key={c.chapterNo} value={c.chapterNo}>
                    Ch {c.chapterNo}{c.chapterTitle ? `: ${c.chapterTitle}` : ''}
                  </option>
                ))}
              </SelectField>
              <SelectField id="plan-to" label="To chapter" value={String(formTo ?? '')} onChange={(v) => setFormTo(Number(v))} className="flex-1">
                {formChapters.map((c) => (
                  <option key={c.chapterNo} value={c.chapterNo}>
                    Ch {c.chapterNo}{c.chapterTitle ? `: ${c.chapterTitle}` : ''}
                  </option>
                ))}
              </SelectField>
            </div>
          )}
        </>
      )}

      <div className="space-y-1.5">
        <label htmlFor="plan-date" className="text-xs font-bold text-text-2 uppercase tracking-wide">
          Exam date
        </label>
        <input
          id="plan-date"
          type="date"
          min={minDate}
          value={formDate}
          onChange={(e) => setFormDate(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-xs font-medium bg-surface-2 border border-border-strong text-navy-2 focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-navy-2 cursor-pointer">
        <input type="checkbox" checked={formBuffer} onChange={(e) => setFormBuffer(e.target.checked)} className="rounded border-border-strong" />
        Reserve a light-review day right before the exam (no new material)
      </label>

      {formError && (
        <div className="text-xs text-navy bg-quiz-light border border-quiz-border rounded-lg px-3 py-2">{formError}</div>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={creating || formFrom === null || formTo === null || !formDate}
        className="px-6 py-2 bg-brand hover:bg-brand-dark disabled:bg-disabled disabled:text-disabled-text text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer"
      >
        {creating ? 'Building your plan…' : 'Build plan'}
      </button>
    </div>
  );
}

function PresetButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
        active
          ? 'bg-brand border-brand text-white shadow-sm'
          : 'bg-surface-2 border-border-strong text-navy-2 hover:bg-border'
      }`}
    >
      {label}
    </button>
  );
}

function DetailView({
  detail,
  error,
  onDelete,
}: {
  detail: PlanDetail | null;
  error: string | null;
  onDelete: (id: string) => void;
}) {
  const scrollRef = useHorizontalScroll<HTMLDivElement>();

  if (error) {
    return <EmptyState icon={CalendarClock} title="Plan unavailable" message={error} />;
  }
  if (!detail) {
    return (
      <div className="bg-surface border border-border rounded-xl p-12 text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-brand animate-spin mx-auto" />
        <div className="text-sm text-navy-2">Building your schedule...</div>
      </div>
    );
  }
  if (detail.expired) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Flag}
          title="This exam has passed"
          message={`Its exam date (${formatDate(detail.examDate)}) is in the past.`}
        />
        <PlanQuizHistory detail={detail} />
        <button
          type="button"
          onClick={() => onDelete(detail.id)}
          className="flex items-center gap-1.5 text-xs font-medium text-error hover:text-error transition mx-auto cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete this plan
        </button>
      </div>
    );
  }

  const totalActions = detail.days.reduce((sum, d) => sum + d.items.length, 0);
  // Not toChapterNo - fromChapterNo + 1 — that's the size of the NUMBER range, which silently
  // overcounts if any chapter number in it doesn't actually exist (a real gap, or a chapter
  // that was removed). The union of every chapter that actually got scheduled (or was reported
  // skipped) is the true count of real chapters this plan covers.
  const chaptersCovered = new Set<number>([
    ...detail.days.flatMap((d) => d.items.map((i) => i.chapterNo)),
    ...detail.skipped.map((s) => s.chapterNo),
  ]).size;

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={CalendarClock} label="Days until exam" value={String(Math.max(detail.daysRemaining, 0))} />
        <StatCard icon={Flag} label="Chapters covered" value={String(chaptersCovered)} />
        <StatCard icon={Award} label="Study/quiz sessions" value={String(totalActions)} />
      </div>

      {detail.skipped.length > 0 && (
        <div className="text-xs text-navy bg-quiz-light border border-quiz-border rounded-lg px-3.5 py-2.5 space-y-1">
          <p className="font-semibold">Not everything fit in the time you have:</p>
          {detail.skipped.map((s) => (
            <p key={s.chapterNo}>
              Ch {s.chapterNo}{s.chapterTitle ? `: ${s.chapterTitle}` : ''}. {s.reason}
            </p>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="no-scrollbar flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 cursor-grab active:cursor-grabbing select-none">
        {detail.days.map((day) => (
          <div
            key={day.date}
            className={`shrink-0 w-[220px] rounded-2xl border p-4 space-y-3 ${
              day.isExamDay
                ? 'bg-brand-light border-brand'
                : day.isBufferDay
                ? 'bg-surface-muted border-border'
                : 'bg-surface border-border'
            }`}
          >
            <div className="flex items-center gap-2">
              {day.isExamDay ? <Flag className="w-4 h-4 text-brand-dark" /> : day.isBufferDay ? <Moon className="w-4 h-4 text-text-2" /> : null}
              <p className={`text-xs font-bold ${day.isExamDay ? 'text-brand-dark' : 'text-navy'}`}>{formatDate(day.date)}</p>
            </div>

            {day.isExamDay ? (
              <p className="text-[11px] font-semibold text-brand-dark">Exam day. Good luck!</p>
            ) : day.isBufferDay ? (
              <p className="text-[11px] text-text-2">Rest &amp; light review. No new material today.</p>
            ) : day.items.length === 0 ? (
              <p className="text-[11px] text-text-2">Free day.</p>
            ) : (
              <div className="space-y-2.5">
                {groupDayItems(day.items).map((group) => (
                  <div key={group.chapterNo} className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {group.actions.map((action) => (
                        <ActionBadge key={action} action={action} />
                      ))}
                      <MasteryBadge band={group.band} />
                    </div>
                    <p className="text-[11px] font-semibold text-navy">
                      Ch {group.chapterNo}{group.chapterTitle ? `: ${group.chapterTitle}` : ''}
                    </p>
                    <p className="text-[10px] text-text-2 leading-snug">{group.rationale}</p>
                    {(group.actions.includes('quiz') || group.actions.includes('review')) && (
                      <Link
                        href={`/quiz?subject=${detail.subject}&chapterNo=${group.chapterNo}`}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-brand hover:text-brand-dark transition"
                      >
                        <Sparkles className="w-3 h-3" />
                        Practice quiz
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <PlanQuizHistory detail={detail} />

      <button
        type="button"
        onClick={() => onDelete(detail.id)}
        className="flex items-center gap-1.5 text-xs font-medium text-error hover:text-error transition cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete this plan
      </button>
    </div>
  );
}

/** This plan's own quiz track, distinct from the app-wide /quiz/history: quizzes still in
 *  progress (parked server-side, so cross-device) on top, then graded attempts the student has
 *  submitted toward this plan (in-scope chapters, since the plan was created). */
function PlanQuizHistory({ detail }: { detail: PlanDetail }) {
  const attempts = detail.quizAttempts;
  const [drafts, setDrafts] = useState<QuizDraftRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    listQuizDrafts().then((all) => {
      if (cancelled) return;
      setDrafts(
        all.filter(
          (d) =>
            d.boardCode === detail.board &&
            d.classLevel === detail.classLevel &&
            d.subjectCode === detail.subject &&
            d.chapterNo >= detail.fromChapterNo &&
            d.chapterNo <= detail.toChapterNo
        )
      );
    });
    return () => {
      cancelled = true;
    };
  }, [detail.board, detail.classLevel, detail.subject, detail.fromChapterNo, detail.toChapterNo]);

  const discardDraft = (id: string) => {
    deleteQuizDraft(id);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  const empty = attempts.length === 0 && drafts.length === 0;

  return (
    <div className="space-y-2.5">
      <SectionHeader
        title="Quizzes for this plan"
        subtitle="In-progress and graded quizzes on this plan's chapters, since you created it."
      />

      {empty ? (
        <div className="bg-surface-muted border border-border rounded-xl p-4 text-xs text-text-2">
          None yet. Use the <span className="font-semibold text-navy-2">Practice quiz</span> links in the schedule above to start one.
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-text-2 uppercase tracking-wider">
                In progress ({drafts.length})
              </p>
              {drafts.map((d) => {
                const stale = d.expired;
                return (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 bg-surface border border-border rounded-xl p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-navy truncate">
                        Ch {d.chapterNo}
                        {d.chapterTitle ? `: ${d.chapterTitle}` : ''}
                      </p>
                      <p className="text-[11px] text-text-2">
                        {d.answeredCount}/{d.totalQuestions} answered · started {formatTimestamp(d.generatedAt)}
                        {stale && <span className="text-quiz"> · session expired</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={draftResumeHref(d)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-brand hover:bg-brand-dark text-white text-[11px] font-semibold rounded-lg transition"
                      >
                        <Play className="w-3 h-3" />
                        Resume
                      </Link>
                      <button
                        type="button"
                        onClick={() => discardDraft(d.id)}
                        title="Discard this draft"
                        className="p-1.5 rounded-lg text-text-2 hover:bg-error-bg hover:text-error transition"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {attempts.length > 0 && (
            <div className="space-y-2">
              {drafts.length > 0 && (
                <p className="text-[10px] font-bold text-text-2 uppercase tracking-wider">Completed ({attempts.length})</p>
              )}
              {attempts.map((a) => (
                <Link
                  key={a.id}
                  href={`/quiz/history/${a.id}`}
                  className="group flex items-center justify-between gap-3 bg-surface border border-border rounded-xl p-3 hover:shadow-sm transition"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-navy truncate">
                      Ch {a.chapterNo}
                      {a.chapterTitle ? `: ${a.chapterTitle}` : ''}
                    </p>
                    <p className="text-[11px] text-text-2">
                      {formatTimestamp(a.submittedAt)} · {a.answered}/{a.total} answered
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${quizScorePill(a.score, a.total)}`}>
                      {a.score}/{a.total}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-text-2 group-hover:text-brand transition" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
