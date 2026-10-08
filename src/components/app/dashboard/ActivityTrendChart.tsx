'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { DailyActivity } from '@/app/api/dashboard/stats/route';

const VIEW_W = 600;
const VIEW_H = 170;
const PAD_LEFT = 8;
const PAD_RIGHT = 8;
const PAD_TOP = 14;
const PAD_BOTTOM = 28;
const PLOT_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = VIEW_H - PAD_TOP - PAD_BOTTOM;

const SERIES = [
  { key: 'questions' as const, label: 'Questions asked', color: 'var(--color-brand)' },
  { key: 'quizzes' as const, label: 'Quizzes taken', color: 'var(--color-quiz)' },
];

// Round a max value up to a clean tick (dataviz: "Y-axis ticks: round to clean numbers") — the
// step size scales with magnitude so a brand-new account's small counts don't all round to the
// same "5".
function niceMax(value: number): number {
  if (value <= 1) return 1;
  if (value <= 5) return Math.ceil(value);
  if (value <= 10) return Math.ceil(value / 2) * 2;
  return Math.ceil(value / 5) * 5;
}

function shortDay(dateStr: string): string {
  // dateStr is a plain YYYY-MM-DD local key (see the API's toLocalDateKey) — parsed with an
  // explicit local-midnight time so this never round-trips through UTC and risks landing on
  // the wrong weekday for a date built that way.
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

export default function ActivityTrendChart({ days }: { days: DailyActivity[] }) {
  const [drawn, setDrawn] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const totalActivity = days.reduce((sum, d) => sum + d.questions + d.quizzes, 0);

  const { yMax, points } = useMemo(() => {
    const max = niceMax(Math.max(1, ...days.map((d) => Math.max(d.questions, d.quizzes))));
    const n = Math.max(1, days.length - 1);
    const pts = days.map((d, i) => ({
      x: PAD_LEFT + (n === 0 ? 0 : (i / n) * PLOT_W),
      yQuestions: PAD_TOP + PLOT_H - (d.questions / max) * PLOT_H,
      yQuizzes: PAD_TOP + PLOT_H - (d.quizzes / max) * PLOT_H,
      day: d,
    }));
    return { yMax: max, points: pts };
  }, [days]);

  const lineFor = (which: 'yQuestions' | 'yQuizzes') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p[which].toFixed(2)}`).join(' ');

  const areaFor = (which: 'yQuestions' | 'yQuizzes') => {
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p[which].toFixed(2)}`).join(' ');
    const base = PAD_TOP + PLOT_H;
    return `${line} L${points[points.length - 1].x.toFixed(2)},${base} L${points[0].x.toFixed(2)},${base} Z`;
  };

  const handleMove = (e: React.PointerEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    // Crosshair finds the X: snap to the nearest day position, never a bare pixel offset.
    let nearest = 0;
    let bestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - relX);
      if (dist < bestDist) {
        bestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  };

  if (totalActivity === 0) {
    return (
      <div className="flex h-full min-h-[140px] items-center justify-center text-center text-xs text-text-2 px-4">
        Your last 14 days will chart here once you ask a question or take a quiz.
      </div>
    );
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const yTicks = [0, yMax];

  return (
    <div className="space-y-2">
      {/* Legend — line-key swatches (a short stroke, not a filled box), mirroring the line
          marks below. Always present for 2 series. */}
      <div className="flex items-center gap-4">
        {SERIES.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-[11px] font-semibold text-text-2">
            <svg width="14" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="14" y2="4" stroke={s.color} strokeWidth="2" strokeLinecap="round" />
            </svg>
            {s.label}
          </div>
        ))}
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full h-[150px]"
          role="img"
          aria-label={`Questions and quizzes over the last 14 days, up to ${yMax} per day`}
        >
          {/* Gridlines — hairline, one step off the surface, solid, recessive. */}
          {yTicks.map((t) => {
            const y = PAD_TOP + PLOT_H - (t / yMax) * PLOT_H;
            return (
              <g key={t}>
                <line x1={PAD_LEFT} y1={y} x2={VIEW_W - PAD_RIGHT} y2={y} stroke="var(--color-border)" strokeWidth="1" />
                <text x={0} y={y - 3} className="fill-text-3" fontSize="9">
                  {t}
                </text>
              </g>
            );
          })}

          {/* Areas — series hue at a wash, never a saturated block. */}
          {SERIES.map((s) => (
            <path
              key={`area-${s.key}`}
              d={areaFor(s.key === 'questions' ? 'yQuestions' : 'yQuizzes')}
              fill={s.color}
              opacity={drawn ? 0.1 : 0}
              style={{ transition: 'opacity 900ms ease-out 400ms' }}
            />
          ))}

          {/* Lines — 2px, round join/cap, drawn in via a stroke-dashoffset reveal. */}
          {SERIES.map((s, si) => {
            const d = lineFor(s.key === 'questions' ? 'yQuestions' : 'yQuizzes');
            return (
              <path
                key={`line-${s.key}`}
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                style={{
                  strokeDasharray: 1,
                  strokeDashoffset: drawn ? 0 : 1,
                  transition: `stroke-dashoffset 900ms ease-out ${si * 150}ms`,
                }}
              />
            );
          })}

          {/* End-dots — >=8px, ringed in the surface color so they clear the line under them. */}
          {drawn &&
            points.length > 0 &&
            SERIES.map((s) => {
              const p = points[points.length - 1];
              const y = s.key === 'questions' ? p.yQuestions : p.yQuizzes;
              return (
                <circle key={`end-${s.key}`} cx={p.x} cy={y} r={4} fill={s.color} stroke="var(--color-surface)" strokeWidth={2} />
              );
            })}

          {/* Crosshair */}
          {hovered && (
            <line
              x1={hovered.x}
              y1={PAD_TOP}
              x2={hovered.x}
              y2={PAD_TOP + PLOT_H}
              stroke="var(--color-navy-2)"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
          )}

          {/* X-axis: label selectively — first, last, and today only, never every point. */}
          {points.map((p, i) => {
            const isEdge = i === 0 || i === points.length - 1;
            if (!isEdge) return null;
            return (
              <text key={i} x={p.x} y={VIEW_H - 8} textAnchor={i === 0 ? 'start' : 'end'} className="fill-text-3" fontSize="9">
                {shortDay(p.day.date)}
              </text>
            );
          })}

          {/* Hit layer — the whole plot is the target; hover doesn't require landing on the
              2px line itself. */}
          <rect
            x={PAD_LEFT}
            y={0}
            width={PLOT_W}
            height={VIEW_H}
            fill="transparent"
            onPointerMove={handleMove}
            onPointerLeave={() => setHoverIndex(null)}
          />
        </svg>

        {/* Tooltip — values lead (Strong), series name follows (secondary); every series at
            this X in one readout, not gated behind landing on a specific line. */}
        {hovered && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-border bg-surface px-2.5 py-1.5 shadow-lg text-[11px] whitespace-nowrap"
            style={{ left: `${(hovered.x / VIEW_W) * 100}%` }}
          >
            <p className="font-bold text-navy mb-1">
              {new Date(`${hovered.day.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
            {SERIES.map((s) => (
              <p key={s.key} className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-[2px] rounded-full" style={{ backgroundColor: s.color }} />
                <span className="font-bold text-navy tabular-nums">
                  {s.key === 'questions' ? hovered.day.questions : hovered.day.quizzes}
                </span>
                <span className="text-text-2">{s.label.toLowerCase()}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
