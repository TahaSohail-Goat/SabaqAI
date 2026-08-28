import React from 'react';
import Link from 'next/link';

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  message: string;
  ctaLabel?: string;
  ctaHref?: string;
  className?: string;
}

// Deliberately quieter than ActionCard: bg-surface-muted (recessed) instead of bg-surface
// (elevated) and a neutral icon container instead of an accent one — these are informational
// "nothing here yet" panels and must not visually compete with the primary actions above them.
// Same calm, non-error language AGENTS.md mandates for refusals: always a clear next step.
export default function EmptyState({ icon: Icon, title, message, ctaLabel, ctaHref, className = '' }: EmptyStateProps) {
  return (
    <div className={`bg-surface-muted border border-border rounded-2xl flex flex-col items-center text-center gap-2.5 p-8 ${className}`}>
      <div className="p-2.5 rounded-full bg-surface text-text-2">
        <Icon className="w-5 h-5" />
      </div>
      <h4 className="text-sm font-bold text-navy">{title}</h4>
      <p className="text-xs text-text-2 max-w-[280px] leading-relaxed">{message}</p>
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="mt-1 text-xs font-bold text-brand hover:text-brand-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 rounded"
        >
          {ctaLabel} →
        </Link>
      )}
    </div>
  );
}
