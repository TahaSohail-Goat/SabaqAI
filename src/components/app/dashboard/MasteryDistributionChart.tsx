'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, TrendingUp, AlertTriangle, HelpCircle, Circle } from 'lucide-react';
import type { ChapterMastery, MasteryBand } from '@/app/api/dashboard/progress/route';

// Same fixed order the Progress page's band filter chips use (src/app/(app)/dashboard/progress/
// page.tsx's BAND_ORDER) — worst-to-best. A categorical/status sequence is assigned once and
// never reshuffled per render, so a returning student sees "needs work" in the same spot every
// time (dataviz: "assign categorical hues in fixed order, never cycled").
const BAND_ORDER: MasteryBand[] = ['needs_work', 'getting_there', 'strong', 'insufficient_data', 'not_started'];

// Status colors reused verbatim from MasteryBadge.tsx — never a fresh palette choice for the
// same five states elsewhere in the app. Icon shape rides along with every color for the same
// reason that component already gives: needs_work/getting_there (error red vs. quiz amber) sit
// close enough in hue that shape, not color alone, is what actually separates them.
const BAND_CONFIG: Record<MasteryBand, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  strong: { label: 'Strong', icon: CheckCircle2, color: 'var(--color-brand)' },
  getting_there: { label: 'Getting there', icon: TrendingUp, color: 'var(--color-quiz)' },
  needs_work: { label: 'Needs work', icon: AlertTriangle, color: 'var(--color-error)' },
  insufficient_data: { label: 'Not enough data', icon: HelpCircle, color: 'var(--color-info)' },
  not_started: { label: 'Not started', icon: Circle, color: 'var(--color-text-3)' },
};

interface Segment {
  band: MasteryBand;
  count: number;
  pct: number;
}

export default function MasteryDistributionChart({ chapters }: { chapters: ChapterMastery[] }) {
  const [grown, setGrown] = useState(false);
  const [hovered, setHovered] = useState<MasteryBand | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const total = chapters.length;
  const counts: Record<MasteryBand, number> = {
    strong: 0, getting_there: 0, needs_work: 0, insufficient_data: 0, not_started: 0,
  };
  for (const c of chapters) counts[c.band] += 1;

  const segments: Segment[] = BAND_ORDER.map((band) => ({
    band,
    count: counts[band],
    pct: total > 0 ? (counts[band] / total) * 100 : 0,
  })).filter((s) => s.count > 0);

  if (total === 0) {
    return (
      <div className="flex h-full min-h-[140px] items-center justify-center text-center text-xs text-text-2 px-4">
        Take a quiz to start filling this in — it fills in chapter by chapter, from your real scores.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* The bar: one flex row, each segment's flex-basis IS its share of the whole — no SVG
          math needed for a single stacked bar. 2px surface-color gaps between segments (dataviz
          mark spec) via each segment's border, not a drawn stroke. Outer ends round 4px; where
          segments touch stays square, which the shared border + overflow-hidden wrapper gives
          for free. Width grows from 0 on mount, staggered per segment by transition-delay. */}
      <div className="flex h-7 w-full overflow-hidden rounded-[4px] bg-surface-muted" role="img" aria-label={`${total} chapters: ${segments.map((s) => `${s.count} ${BAND_CONFIG[s.band].label.toLowerCase()}`).join(', ')}`}>
        {segments.map((s, i) => (
          <button
            key={s.band}
            type="button"
            className="relative h-full border-r-2 border-surface last:border-r-0 transition-[flex-basis,opacity] duration-700 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            style={{
              flexBasis: grown ? `${s.pct}%` : '0%',
              flexGrow: 0,
              flexShrink: 0,
              backgroundColor: BAND_CONFIG[s.band].color,
              transitionDelay: `${i * 80}ms`,
              opacity: hovered && hovered !== s.band ? 0.55 : 1,
            }}
            onMouseEnter={() => setHovered(s.band)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(s.band)}
            onBlur={() => setHovered(null)}
            title={`${BAND_CONFIG[s.band].label}: ${s.count} chapter${s.count === 1 ? '' : 's'} (${Math.round(s.pct)}%)`}
          />
        ))}
      </div>

      {/* Legend — always present for 2+ series, icon-keyed rather than color-swatch-only. */}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {segments.map((s) => {
          const { label, icon: Icon, color } = BAND_CONFIG[s.band];
          return (
            <div
              key={s.band}
              className={`flex items-center gap-1.5 text-[11px] font-semibold transition-opacity ${hovered && hovered !== s.band ? 'opacity-45' : 'opacity-100'}`}
              onMouseEnter={() => setHovered(s.band)}
              onMouseLeave={() => setHovered(null)}
            >
              <span style={{ color }}>
                <Icon className="w-3.5 h-3.5" />
              </span>
              <span className="text-text-2">{label}</span>
              <span className="text-navy tabular-nums">{s.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
