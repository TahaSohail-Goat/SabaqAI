'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import type { AskOptionsResponse, AskSourceOption, AskSourceType, AskUnit } from '@/lib/types';
import { useScope } from '@/components/app/ScopeContext';
import { SUBJECTS, SUBJECT_LABELS } from '@/lib/subjects';
import { ASK_SOURCE_META, ASK_SOURCE_TYPES } from '@/lib/ask/source-meta';
import SyllabusPdfReader from '@/components/app/SyllabusPdfReader';

const EMPTY_SOURCES: AskSourceOption[] = ASK_SOURCE_TYPES.map((sourceType) => ({ sourceType, units: [] }));
const RECENT_KEY = 'sabaqai-syllabus-recent';
// Higher now that the list scrolls internally (see the rail below) — there's no reason to
// forget an opened document just because it's the 7th one, once scrolling makes room for it.
const RECENT_MAX = 15;

// Subject code -> the --color-subj-* utility (see globals.css @theme). Static map so Tailwind's
// scanner sees every class literally; matches the suffixes already used in src/app/(app)/eval.
const SUBJECT_DOT: Record<string, string> = {
  physics: 'bg-subj-physics',
  chemistry: 'bg-subj-chemistry',
  biology: 'bg-subj-biology',
  mathematics: 'bg-subj-maths',
  english: 'bg-subj-english',
  urdu: 'bg-subj-urdu',
  computer_science: 'bg-subj-cs',
  islamiyat: 'bg-subj-islamiyat',
  pakistan_studies: 'bg-subj-pakstudies',
};

interface RecentItem {
  subject: string;
  sourceType: AskSourceType;
  chapterNo: number;
  chapterTitle: string | null;
}

const sameUnit = (a: RecentItem, s: string, st: AskSourceType, n: number) =>
  a.subject === s && a.sourceType === st && a.chapterNo === n;

// The Syllabus Explorer. Same data and reader as before (subject -> source type -> unit ->
// scrolling source PDF, zoom, fullscreen) — only the picker layout changed: subjects are a
// left rail, source type is a segmented control, the units are a visible list, and recently
// opened documents fill the rail below the subject list. Class + board come from the profile.
export default function SyllabusPage() {
  const { board, classLevel, subject, setSubject } = useScope();

  const [sources, setSources] = useState<AskSourceOption[]>(EMPTY_SOURCES);
  const [loading, setLoading] = useState(true);
  const [sourceType, setSourceType] = useState<AskSourceType | null>(null);
  const [unit, setUnit] = useState<AskUnit | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);

  // A recent-item click on a different subject can't select the unit until that subject's
  // options have loaded — stash it here and apply it in the fetch handler.
  const pendingRef = useRef<{ sourceType: AskSourceType; chapterNo: number } | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(RECENT_KEY);
      if (stored) setRecent(JSON.parse(stored));
    } catch {
      /* private mode / corrupt value — start empty */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setUnit(null);

    fetch(`/api/ask/options?board=${encodeURIComponent(board)}&classLevel=${classLevel}&subject=${encodeURIComponent(subject)}`)
      .then((res) => res.json())
      .then((data: AskOptionsResponse) => {
        if (cancelled) return;
        setSources(data.sources);

        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) {
          const src = data.sources.find((s) => s.sourceType === pending.sourceType);
          const u = src?.units.find((x) => x.chapterNo === pending.chapterNo);
          if (u) {
            setSourceType(pending.sourceType);
            setUnit(u);
            return;
          }
        }
        // Land on the first source type that actually has something — no dead "choose a
        // source" step when there's an obvious default.
        const firstAvailable = data.sources.find((s) => s.units.length > 0);
        setSourceType(firstAvailable ? firstAvailable.sourceType : null);
      })
      .catch(() => {
        if (cancelled) return;
        setSources(EMPTY_SOURCES);
        setSourceType(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [board, classLevel, subject]);

  // Record every opened document in the recents rail (most-recent first, deduped, capped).
  useEffect(() => {
    if (!unit || !sourceType) return;
    setRecent((prev) => {
      const next: RecentItem[] = [
        { subject, sourceType, chapterNo: unit.chapterNo, chapterTitle: unit.chapterTitle },
        ...prev.filter((r) => !sameUnit(r, subject, sourceType, unit.chapterNo)),
      ].slice(0, RECENT_MAX);
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* best effort */
      }
      return next;
    });
  }, [unit, sourceType, subject]);

  const availableSources = sources.filter((s) => s.units.length > 0);
  const activeSource = availableSources.find((s) => s.sourceType === sourceType) ?? null;
  const units = activeSource?.units ?? [];
  const meta = sourceType ? ASK_SOURCE_META[sourceType] : null;

  const unitIndex = unit ? units.findIndex((u) => u.chapterNo === unit.chapterNo) : -1;
  const prevUnit = unitIndex > 0 ? units[unitIndex - 1] : null;
  const nextUnit = unitIndex >= 0 && unitIndex < units.length - 1 ? units[unitIndex + 1] : null;

  const unitLabel = (u: AskUnit) => u.chapterTitle ?? `${meta?.unitNoun ?? 'Item'} ${u.chapterNo}`;

  // The heading over the reader: always leads with the unit number, unless the title already
  // carries it (model papers are titled e.g. "Model Paper 2025 — chemistry").
  const readerTitle = (u: AskUnit) => {
    const t = u.chapterTitle?.trim();
    const noun = meta?.unitNoun ?? 'Item';
    if (t && t.includes(String(u.chapterNo))) return t;
    return t ? `${noun} ${u.chapterNo} · ${t}` : `${noun} ${u.chapterNo}`;
  };

  const openRecent = (r: RecentItem) => {
    if (r.subject === subject) {
      const src = sources.find((s) => s.sourceType === r.sourceType);
      const u = src?.units.find((x) => x.chapterNo === r.chapterNo);
      if (u) {
        setSourceType(r.sourceType);
        setUnit(u);
      }
      return;
    }
    pendingRef.current = { sourceType: r.sourceType, chapterNo: r.chapterNo };
    setSubject(r.subject);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)] gap-6 lg:gap-8">
      {/* Subject rail + recents */}
      <aside className="space-y-6">
        <div>
          <span className="hidden lg:block text-[10px] font-bold text-text-2 uppercase tracking-wider mb-1.5 ml-1">
            Subjects
          </span>
          <div className="flex lg:flex-col gap-1.5 lg:gap-0.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
            {SUBJECTS.map((s) => {
              const active = s.code === subject;
              return (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => setSubject(s.code)}
                  aria-pressed={active}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors ${
                    active ? 'bg-selected-surface text-selected-text' : 'text-navy-2 hover:bg-surface-2'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SUBJECT_DOT[s.code] ?? 'bg-text-3'}`} />
                  <span className="truncate">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="hidden lg:block">
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-text-2 uppercase tracking-wider mb-1.5 ml-1">
            <Clock className="w-3 h-3" />
            Recent
          </span>
          {recent.length === 0 ? (
            <p className="text-[11px] text-text-3 px-3 leading-relaxed">
              Documents you open show up here so you can jump back to them.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto pr-0.5">
              {recent.map((r) => {
                const rMeta = ASK_SOURCE_META[r.sourceType];
                return (
                  <button
                    key={`${r.subject}-${r.sourceType}-${r.chapterNo}`}
                    type="button"
                    onClick={() => openRecent(r)}
                    className="text-left px-3 py-1.5 rounded-lg hover:bg-surface-2 transition-colors"
                  >
                    <span className="block text-[12px] font-medium text-navy-2 truncate">
                      {r.chapterTitle ?? `${rMeta.unitNoun} ${r.chapterNo}`}
                    </span>
                    <span className="block text-[10px] text-text-3 truncate">
                      {SUBJECT_LABELS[r.subject] ?? r.subject} · {rMeta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* Content pane */}
      <section className="min-w-0">
        {loading ? (
          <div className="bg-surface border border-border rounded-2xl p-12 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-brand/20 border-t-brand animate-spin mx-auto" />
          </div>
        ) : availableSources.length === 0 ? (
          <div className="bg-surface-muted border border-border rounded-2xl p-8 text-center text-sm text-text-2">
            Nothing has been added yet for {board} Class {classLevel} {SUBJECT_LABELS[subject] ?? subject}.
          </div>
        ) : !unit ? (
          /* Browse: pick a source type, then a chapter/paper */
          <div className="space-y-4">
            {availableSources.length > 1 && (
              <div className="inline-flex rounded-xl border border-border bg-surface-2 p-0.5">
                {availableSources.map((s) => {
                  const sMeta = ASK_SOURCE_META[s.sourceType];
                  const Icon = sMeta.icon;
                  const active = s.sourceType === sourceType;
                  return (
                    <button
                      key={s.sourceType}
                      type="button"
                      onClick={() => setSourceType(s.sourceType)}
                      aria-pressed={active}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        active ? 'bg-selected-surface text-selected-text' : 'text-navy-2 hover:bg-surface'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {sMeta.label}
                      <span className={`text-[10px] font-mono ${active ? 'text-selected-text/70' : 'text-text-3'}`}>
                        {s.units.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <p className="text-xs text-text-2 px-1">
              {SUBJECT_LABELS[subject] ?? subject} · {meta?.label} · {units.length}{' '}
              {(meta?.unitNoun ?? 'item').toLowerCase()}
              {units.length === 1 ? '' : 's'}
            </p>

            <ul className="bg-surface border border-border rounded-2xl divide-y divide-border/60 overflow-hidden">
              {units.map((u) => (
                <li key={u.chapterNo}>
                  <button
                    type="button"
                    onClick={() => setUnit(u)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-surface-2 transition-colors group"
                  >
                    <span className="text-[11px] font-mono text-text-3 w-8 flex-shrink-0">{u.chapterNo}</span>
                    <span className="flex-1 min-w-0 text-[13px] font-medium text-navy truncate">
                      {unitLabel(u)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-text-3 group-hover:text-brand flex-shrink-0 transition-colors" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          /* Read: the selected unit's source PDF */
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setUnit(null)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-dark transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                All {(meta?.label ?? 'items').toLowerCase()}
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => prevUnit && setUnit(prevUnit)}
                  disabled={!prevUnit}
                  title={prevUnit ? unitLabel(prevUnit) : undefined}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-navy-2 hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => nextUnit && setUnit(nextUnit)}
                  disabled={!nextUnit}
                  title={nextUnit ? unitLabel(nextUnit) : undefined}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-navy-2 hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-2xl p-5 sticky top-24 h-[calc(100vh-9rem)] flex flex-col">
              <SyllabusPdfReader
                key={`${sourceType}-${unit.chapterNo}`}
                pdfUrl={unit.pdfUrl}
                title={readerTitle(unit)}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
