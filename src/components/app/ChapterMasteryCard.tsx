import React from 'react';
import MasteryRing from './MasteryRing';
import MasteryBadge from './MasteryBadge';
import type { ChapterMastery } from '@/app/api/dashboard/progress/route';

// Left-accent border repeats the ring/badge color as a supplementary flourish — never the only
// signal (the ring, badge icon, and label text all already carry the same information).
const ACCENT_CLASS: Record<ChapterMastery['band'], string> = {
  strong: 'border-l-brand',
  getting_there: 'border-l-quiz',
  needs_work: 'border-l-error',
  insufficient_data: 'border-l-info',
  not_started: 'border-l-border-strong',
};

export default function ChapterMasteryCard({ chapter }: { chapter: ChapterMastery }) {
  const { chapterNo, chapterTitle, band, answered } = chapter;

  return (
    <div
      className={`bg-surface border border-border border-l-[3px] ${ACCENT_CLASS[band]} rounded-2xl p-4 flex items-center gap-3.5 transition-shadow hover:shadow-sm`}
    >
      <MasteryRing chapter={chapter} />
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="leading-tight">
          <span className="block text-xs font-bold text-navy truncate">{chapterTitle ?? `Chapter ${chapterNo}`}</span>
          <span className="block text-[10px] font-medium text-text-2">Chapter {chapterNo}</span>
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <MasteryBadge band={band} />
          {answered > 0 && <span className="text-[10px] text-text-2">{answered} answered</span>}
        </div>
      </div>
    </div>
  );
}
