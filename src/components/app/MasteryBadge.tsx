import React from 'react';
import { CheckCircle2, TrendingUp, AlertTriangle, HelpCircle, Circle } from 'lucide-react';
import type { MasteryBand } from '@/app/api/dashboard/progress/route';

// Status colors, never color alone (dataviz skill) — each band pairs a distinct icon SHAPE
// (not just a different hue) with its label text, so the two closest hues in this app's
// existing status palette (error/warning) stay distinguishable even for a reader who can't
// tell those colors apart.
const BAND_CONFIG: Record<MasteryBand, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
  strong: { label: 'Strong', icon: CheckCircle2, className: 'bg-brand-light text-brand-dark' },
  getting_there: { label: 'Getting there', icon: TrendingUp, className: 'bg-quiz-light text-quiz' },
  needs_work: { label: 'Needs work', icon: AlertTriangle, className: 'bg-error-bg text-error' },
  insufficient_data: { label: 'Not enough data', icon: HelpCircle, className: 'bg-info-bg text-info' },
  not_started: { label: 'Not started', icon: Circle, className: 'bg-surface-2 text-text-2 border border-border' },
};

export default function MasteryBadge({
  band,
  className = '',
  suffix = '',
}: {
  band: MasteryBand;
  className?: string;
  /** Appended after the label, e.g. a count — " (3)" — kept separate from label so callers
   *  reusing BAND_CONFIG's copy don't have to string-concat themselves. */
  suffix?: string;
}) {
  const { label, icon: Icon, className: bandClassName } = BAND_CONFIG[band];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${bandClassName} ${className}`}>
      <Icon className="w-3 h-3" />
      {label}
      {suffix}
    </span>
  );
}
