import React from 'react';

type BadgeVariant = 'context' | 'soon' | 'internal' | 'neutral';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  // The scope chip — a purposeful control, not just another dark rectangle: distinct border +
  // recessed fill so it reads as "current context," clickable-adjacent.
  context: 'bg-surface-muted border border-border-strong text-navy-2',
  soon: 'bg-surface-muted text-text-2',
  internal: 'bg-brand/15 text-brand-dark',
  neutral: 'bg-surface-muted border border-border text-text-2',
};

export default function Badge({
  children,
  variant = 'neutral',
  className = '',
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
