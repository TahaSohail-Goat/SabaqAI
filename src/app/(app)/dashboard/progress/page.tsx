'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, TrendingUp, Target, ListChecks } from 'lucide-react';
import EmptyState from '@/components/app/EmptyState';
import SectionHeader from '@/components/app/SectionHeader';
import StatCard from '@/components/app/StatCard';
import ChapterMasteryCard from '@/components/app/ChapterMasteryCard';
import MasteryBadge from '@/components/app/MasteryBadge';
import SelectField from '@/components/app/SelectField';
import { SUBJECT_LABELS } from '@/lib/subjects';
import type { ChapterMastery, MasteryBand, SubjectMastery } from '@/app/api/dashboard/progress/route';

const ALL_SUBJECTS = '__all__';
const ALL_BANDS = '__all__';

const BAND_ORDER: MasteryBand[] = ['needs_work', 'getting_there', 'strong', 'insufficient_data', 'not_started'];

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
      <div className="animate-fade-up">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-navy">Progress & mastery</h2>
        <p className="text-xs text-text-2 mt-1.5">
          Per-chapter accuracy computed from your real quiz attempts — never a guess.
        </p>
      </div>

      {subjects === null ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-brand animate-spin mx-auto" />
          <div className="text-sm text-navy-2">Loading your progress...</div>
        </div>
      ) : !hasAnyChapters ? (
        <EmptyState
          icon={TrendingUp}
          title="Nothing to show yet"
          message="No chapters have been ingested for your subjects yet, or you haven't taken a quiz — take one to start building your progress here."
          ctaLabel="Take a quiz"
          ctaHref="/quiz"
        />
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-up">
            <StatCard
              icon={Target}
              label="Overall accuracy"
              value={overallAccuracy !== null ? `${Math.round(overallAccuracy * 100)}%` : '—'}
              hint={overallAccuracy === null ? 'Answer a few questions to see this.' : undefined}
            />
            <StatCard icon={ListChecks} label="Chapters attempted" value={`${chaptersAttempted} / ${allChapters.length}`} />
          </div>

          {/* Band distribution — doubles as a quick filter */}
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

          {/* Filters */}
          <div className="bg-surface border border-border rounded-xl p-4 flex flex-wrap gap-4 animate-fade-up">
            <SelectField id="progress-subject" label="Subject" value={subjectFilter} onChange={setSubjectFilter} className="flex-1 min-w-[180px]">
              <option value={ALL_SUBJECTS}>All subjects</option>
              {availableSubjects.map((s) => (
                <option key={s.subject} value={s.subject}>
                  {SUBJECT_LABELS[s.subject] || s.subject}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="progress-band"
              label="Mastery"
              value={bandFilter}
              onChange={(v) => setBandFilter(v as MasteryBand | typeof ALL_BANDS)}
              className="flex-1 min-w-[180px]"
            >
              <option value={ALL_BANDS}>All</option>
              <option value="needs_work">Needs work</option>
              <option value="getting_there">Getting there</option>
              <option value="strong">Strong</option>
              <option value="insufficient_data">Not enough data</option>
              <option value="not_started">Not started</option>
            </SelectField>
          </div>

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
                          Not started
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
