import React, { useEffect, useState } from 'react';
import MasteryBadge from './MasteryBadge';
import type { ChapterMastery } from '@/app/api/dashboard/progress/route';

// Meter fill carries severity, matching each band's badge color — the unfilled track is a
// lighter, neutral step so state reads at a glance without needing the badge too.
const FILL_CLASS: Record<ChapterMastery['band'], string> = {
  strong: 'bg-brand',
  getting_there: 'bg-quiz',
  needs_work: 'bg-error',
  insufficient_data: 'bg-info',
  not_started: 'bg-border-strong',
};

export default function ChapterMasteryRow({ chapter }: { chapter: ChapterMastery }) {
  const { chapterNo, chapterTitle, band, accuracy, answered } = chapter;
  // A 0%-width bar for a chapter with no answered questions yet would misread as "0% mastery" —
  // not_started/insufficient_data show no bar at all, only the badge and the count.
  const showBar = accuracy !== null;
  const targetWidth = Math.round((accuracy ?? 0) * 100);

  // Fills from 0 on mount rather than snapping straight to its value — starts at 0% for one
  // paint, then a rAF flips it to the real width so the CSS transition actually has something
  // to animate between. motion-reduce: skips it entirely for reduced-motion users.
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-navy truncate">
          Ch {chapterNo}{chapterTitle ? `: ${chapterTitle}` : ''}
        </p>
        {showBar ? (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none motion-reduce:duration-0 ${FILL_CLASS[band]}`}
                style={{ width: `${filled ? targetWidth : 0}%` }}
              />
            </div>
            <span className="text-[10px] text-text-2 tabular-nums shrink-0">
              {targetWidth}% · {answered} answered
            </span>
          </div>
        ) : (
          answered > 0 && <p className="text-[10px] text-text-2 mt-1">{answered} answered so far</p>
        )}
      </div>
      <MasteryBadge band={band} className="shrink-0" />
    </div>
  );
}
