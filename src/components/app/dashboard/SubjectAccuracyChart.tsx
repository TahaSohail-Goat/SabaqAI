'use client';

import React, { useEffect, useState } from 'react';
import { SUBJECT_LABELS } from '@/lib/subjects';
import type { SubjectMastery } from '@/app/api/dashboard/progress/route';

interface SubjectRow {
  subject: string;
  answered: number;
  correct: number;
  accuracyPct: number;
}

// Ranked-magnitude job, not identity — every bar already carries its own subject-name row
// label, so a 9-hue categorical palette (which this app's --color-subj-* set fails a CVD check
// against at chart scale — physics/chemistry/biology/islamiyat/pakstudies read too close and
// too desaturated for adjacent bars) buys nothing here. One sequential hue, length carries the
// value, exactly the reading a ranked bar list is for.
export default function SubjectAccuracyChart({ subjects }: { subjects: SubjectMastery[] }) {
  const [grown, setGrown] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const rows: SubjectRow[] = subjects
    .map((s) => {
      let answered = 0;
      let correct = 0;
      for (const c of s.chapters) {
        answered += c.answered;
        correct += c.correct;
      }
      return { subject: s.subject, answered, correct, accuracyPct: answered > 0 ? (correct / answered) * 100 : 0 };
    })
    .filter((r) => r.answered > 0)
    .sort((a, b) => b.accuracyPct - a.accuracyPct);

  if (rows.length === 0) {
    return (
      <div className="flex h-full min-h-[140px] items-center justify-center text-center text-xs text-text-2 px-4">
        Answer a few questions in any subject and its accuracy shows up here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const label = SUBJECT_LABELS[r.subject] ?? r.subject;
        const isHovered = hovered === r.subject;
        return (
          <div
            key={r.subject}
            className="group"
            onMouseEnter={() => setHovered(r.subject)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs font-semibold text-navy-2">{label}</span>
              {/* Value at the tip (dataviz mark spec) — sits beside the bar's own end via the
                  flex row below, this is the row's own text-token label, not on the fill. */}
              <span className={`text-[11px] font-bold tabular-nums transition-colors ${isHovered ? 'text-brand-dark' : 'text-navy'}`}>
                {Math.round(r.accuracyPct)}%
              </span>
            </div>
            {/* Track + fill, not raw SVG — a 24px-thick capped bar, 4px rounded data-end, grows
                from a fixed left baseline. Track is a lighter step of the same ramp (dataviz:
                "the unfilled track is a lighter step of the same ramp"), so partial fills still
                read as "on a bar" rather than floating. */}
            <div className="h-2.5 w-full rounded-full bg-brand-light overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: grown ? `${Math.max(2, r.accuracyPct)}%` : '0%',
                  transitionDelay: `${i * 70}ms`,
                  backgroundColor: isHovered ? 'var(--color-brand-dark)' : 'var(--color-brand)',
                }}
                title={`${label}: ${r.correct}/${r.answered} correct (${Math.round(r.accuracyPct)}%)`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
