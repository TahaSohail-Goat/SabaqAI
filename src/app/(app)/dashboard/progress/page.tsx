'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, TrendingUp, ListChecks } from 'lucide-react';
import EmptyState from '@/components/app/EmptyState';
import SectionHeader from '@/components/app/SectionHeader';
import ChapterMasteryCard from '@/components/app/ChapterMasteryCard';
import MasteryBadge from '@/components/app/MasteryBadge';
import SelectField from '@/components/app/SelectField';
import { SUBJECT_LABELS } from '@/lib/subjects';
import type { ChapterMastery, MasteryBand, SubjectMastery } from '@/app/api/dashboard/progress/route';

const ALL_SUBJECTS = '__all__';
const ALL_BANDS = '__all__';

const BAND_ORDER: MasteryBand[] = ['needs_work', 'getting_there', 'strong', 'insufficient_data', 'not_started'];

// A short, honest read on the overall number — never a claim beyond what the number itself
// says, just a warmer way of saying it than a bare percentage.
function encouragement(pct: number): string {
  if (pct >= 80) return "You're doing great across the board.";
  if (pct >= 50) return "Solid work so far, keep it up.";
  return "Still early days. A bit more practice will move this fast.";
}

export default function ProgressPage() {
  const [subjects, setSubjects] = useState<SubjectMastery[] | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string>(ALL_SUBJECTS);
  const [bandFilter, setBandFilter] = useState<MasteryBand | typeof ALL_BANDS>(ALL_BANDS);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/dashboard/progress')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setSubjects(data.subjects ?? []);
      })
      .catch(() => {
        if (!cancelled) setSubjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const allChapters: ChapterMastery[] = useMemo(() => (subjects ?? []).flatMap((s) => s.chapters), [subjects]);
  const hasAnyChapters = allChapters.length > 0;

  // Real counts, computed from what's actually loaded — never hardcoded (this is the same
  // invariant the rest of the app follows: no plausible-looking placeholder numbers).
  const bandCounts = useMemo(() => {
    const counts: Record<MasteryBand, number> = {
      needs_work: 0, getting_there: 0, strong: 0, insufficient_data: 0, not_started: 0,
    };
    for (const c of allChapters) counts[c.band] += 1;
    return counts;
  }, [allChapters]);

  const { overallAccuracy, chaptersAttempted } = useMemo(() => {
    let totalAnswered = 0;
    let totalCorrect = 0;
    let attempted = 0;
    for (const c of allChapters) {
      if (c.answered > 0) attempted += 1;
      totalAnswered += c.answered;
      totalCorrect += c.correct;
    }
    return {
      overallAccuracy: totalAnswered > 0 ? totalCorrect / totalAnswered : null,
      chaptersAttempted: attempted,
    };
  }, [allChapters]);

  const overallPct = overallAccuracy !== null ? Math.round(overallAccuracy * 100) : null;

  const availableSubjects = (subjects ?? []).filter((s) => s.chapters.length > 0);

  const visibleSubjects = useMemo(() => {
    return availableSubjects
      .filter((s) => subjectFilter === ALL_SUBJECTS || s.subject === subjectFilter)
      .map((s) => ({
        ...s,
        chapters: s.chapters.filter((c) => bandFilter === ALL_BANDS || c.band === bandFilter),
      }))
      .filter((s) => s.chapters.length > 0);
  }, [availableSubjects, subjectFilter, bandFilter]);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Plain-English explainer, not a repeated page title (Topbar already carries that) —
          this is what actually needs saying: what the page shows and what the colors mean,
          up front, instead of leaving it to be inferred from badges and tooltips. */}
      <p className="text-xs text-text-2 leading-relaxed max-w-2xl animate-fade-up">
        Every quiz you take updates this page, chapter by chapter.{' '}
        <span className="font-semibold text-brand-dark">Green</span> means you&apos;ve got it,{' '}
        <span className="font-semibold text-quiz">yellow</span> means a bit more practice would
        help, and <span className="font-semibold text-error">red</span> means it needs real
        attention. Chapters with fewer than 5 answers don&apos;t get a color yet, since one or
        two lucky guesses can&apos;t really tell you anything.
      </p>

      {subjects === null ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-brand animate-spin mx-auto" />
          <div className="text-sm text-navy-2">Loading your progress...</div>
        </div>
      ) : !hasAnyChapters ? (
        <EmptyState
          icon={TrendingUp}
          title="Nothing to show yet"
          message="Take a quiz to start building your progress here. This page fills in automatically as you answer questions."
          ctaLabel="Take a quiz"
          ctaHref="/quiz"
        />
      ) : (
        <>
          {/* Headline stat — the one number that matters most gets real visual weight instead
              of sitting in a generic stat card the same size as everything else. */}
          <div className="bg-surface border border-border rounded-2xl p-6 flex flex-wrap items-center gap-6 animate-fade-up">
            <OverallRing pct={overallPct} />
            <div className="flex-1 min-w-[200px] space-y-1">
              <p className="text-xs font-bold text-text-2 uppercase tracking-wide">Overall accuracy</p>
              <p className="font-display text-3xl font-semibold text-navy leading-none">
                {overallPct !== null ? `${overallPct}%` : 'No data yet'}
              </p>
              <p className="text-xs text-text-2 mt-1.5">
                {overallPct !== null ? encouragement(overallPct) : 'Answer a few quiz questions to see this.'}
              </p>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl bg-surface-muted px-4 py-3">
              <ListChecks className="w-4 h-4 text-brand" />
              <div>
                <p className="text-sm font-bold text-navy leading-none">
                  {chaptersAttempted} / {allChapters.length}
                </p>
                <p className="text-[10px] text-text-2 mt-1">chapters attempted</p>
              </div>
            </div>
          </div>

          {/* Band distribution — doubles as the only mastery filter (the "Mastery" dropdown
              this used to sit next to was the exact same filter twice, just less visual). */}
          <div className="flex flex-wrap gap-2 animate-fade-up">
            <button
              type="button"
              onClick={() => setBandFilter(ALL_BANDS)}
              className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${
                bandFilter === ALL_BANDS
                  ? 'bg-brand text-white border-brand'
                  : 'bg-surface-2 text-navy-2 border-border-strong hover:bg-border'
              }`}
            >
              All ({allChapters.length})
            </button>
            {BAND_ORDER.filter((b) => bandCounts[b] > 0).map((band) => (
              <button key={band} type="button" onClick={() => setBandFilter(band)} className="focus-visible:outline-none">
                <MasteryBadge
                  band={band}
                  className={`cursor-pointer transition ${bandFilter === band ? 'ring-2 ring-offset-1 ring-brand' : 'opacity-80 hover:opacity-100'}`}
                  suffix={` (${bandCounts[band]})`}
                />
              </button>
            ))}
          </div>

          {availableSubjects.length > 1 && (
            <SelectField id="progress-subject" label="Subject" value={subjectFilter} onChange={setSubjectFilter} className="max-w-xs animate-fade-up">
              <option value={ALL_SUBJECTS}>All subjects</option>
              {availableSubjects.map((s) => (
                <option key={s.subject} value={s.subject}>
                  {SUBJECT_LABELS[s.subject] || s.subject}
                </option>
              ))}
            </SelectField>
          )}

          {visibleSubjects.length === 0 ? (
            <EmptyState icon={TrendingUp} title="No chapters match these filters" message="Try a different subject or mastery filter." />
          ) : (
            <div className="space-y-6">
              {visibleSubjects.map((s, sIdx) => {
                // A ring card carries no extra information for a chapter with zero attempts —
                // 30+ of those in a row is just noise. Real data gets full cards; untouched
                // chapters collapse into a compact chip row so the page reads by what's actually
                // known, not by how many chapters happen to exist.
                const attempted = s.chapters.filter((c) => c.band !== 'not_started');
                const notStarted = s.chapters.filter((c) => c.band === 'not_started');

                return (
                  <div key={s.subject} className="space-y-2.5 animate-fade-up" style={{ animationDelay: `${sIdx * 60}ms` }}>
                    <SectionHeader title={SUBJECT_LABELS[s.subject] || s.subject} />
                    {attempted.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {attempted.map((c) => (
                          <ChapterMasteryCard key={c.chapterNo} chapter={c} />
                        ))}
                      </div>
                    )}
                    {notStarted.length > 0 && (
                      <div className="bg-surface-muted border border-border rounded-xl p-3 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-text-2 uppercase tracking-wide mr-1">
                          Not started yet
                        </span>
                        {notStarted.map((c) => (
                          <span
                            key={c.chapterNo}
                            title={c.chapterTitle ?? undefined}
                            className="text-[10px] font-medium text-text-2 bg-surface border border-border rounded-full px-2 py-0.5"
                          >
                            Ch {c.chapterNo}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// The headline ring — larger and bolder than a ChapterMasteryCard's, since this is the one
// number on the page meant to be read from across the room, not compared chapter-to-chapter.
function OverallRing({ pct }: { pct: number | null }) {
  const size = 88;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const hasScore = pct !== null;
  const offset = circumference * (1 - (filled && hasScore ? pct / 100 : 0));
  const toneClass = pct === null ? 'text-border-strong' : pct >= 80 ? 'text-brand' : pct >= 50 ? 'text-quiz' : 'text-error';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-current text-surface-2" />
        {hasScore && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={`stroke-current transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none motion-reduce:duration-0 ${toneClass}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display text-xl font-bold text-navy tabular-nums">{hasScore ? `${pct}%` : '—'}</span>
      </div>
    </div>
  );
}
