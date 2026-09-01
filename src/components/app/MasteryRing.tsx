import React, { useEffect, useState } from 'react';
import { HelpCircle, Circle } from 'lucide-react';
import type { ChapterMastery } from '@/app/api/dashboard/progress/route';

// Single-value radial meter — fill carries severity (same color the badge/bar use elsewhere),
// unfilled track is a neutral step of the same surface ramp. Not a donut/pie comparison of
// several slices (which the dataviz convention deprioritizes) — this is one bounded 0-100%
// value per chapter, the circular equivalent of the linear meter used in ChapterMasteryRow.
const STROKE_CLASS: Record<ChapterMastery['band'], string> = {
  strong: 'text-brand',
  getting_there: 'text-quiz',
  needs_work: 'text-error',
  insufficient_data: 'text-info',
  not_started: 'text-border-strong',
};

const SIZE = 56;
const STROKE_WIDTH = 5;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function MasteryRing({ chapter }: { chapter: ChapterMastery }) {
  const { band, accuracy, answered } = chapter;
  const hasScore = accuracy !== null;
  const targetPct = Math.round((accuracy ?? 0) * 100);

  // Sweeps in from empty on mount, same rAF-then-transition trick as the linear bar — never
  // snaps straight to its value.
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const offset = CIRCUMFERENCE * (1 - (filled && hasScore ? targetPct / 100 : 0));

  return (
    <div
      className="relative shrink-0"
      style={{ width: SIZE, height: SIZE }}
      title={hasScore ? `${targetPct}% accuracy · ${answered} answered` : `${answered} answered so far`}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
        {/* Track — a neutral step of the surface ramp, dashed for the no-score states so an
            unfilled ring never reads as "attempted, scored 0%". */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE_WIDTH}
          className="stroke-current text-surface-2"
          strokeDasharray={hasScore ? undefined : '3 4'}
        />
        {hasScore && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            className={`stroke-current transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none motion-reduce:duration-0 ${STROKE_CLASS[band]}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {hasScore ? (
          <span className="text-[11px] font-bold text-navy tabular-nums">{targetPct}%</span>
        ) : (
          <span className={STROKE_CLASS[band]}>
            {band === 'insufficient_data' ? <HelpCircle className="w-4 h-4" /> : <Circle className="w-3.5 h-3.5" />}
          </span>
        )}
      </div>
    </div>
  );
}
