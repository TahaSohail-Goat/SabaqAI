import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface ActionCardProps {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  variant?: 'primary' | 'secondary';
  style?: React.CSSProperties;
  className?: string;
}

// The dashboard's most important actions live here. "primary" gets a visibly stronger surface,
// a solid (not tinted) icon container, and an always-visible CTA affordance — "secondary" stays
// clearly clickable but quieter, so the two don't compete. See docs brief §8.
export default function ActionCard({
  href,
  icon: Icon,
  title,
  description,
  variant = 'secondary',
  style,
  className = '',
}: ActionCardProps) {
  const isPrimary = variant === 'primary';

  return (
    <Link
      href={href}
      style={style}
      className={`group relative flex flex-col rounded-2xl p-5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
        isPrimary
          ? 'bg-surface border border-border-strong shadow-md hover:shadow-lg hover:-translate-y-0.5 hover:border-brand/40'
          : 'bg-surface border border-border hover:border-border-strong hover:bg-surface-hover hover:-translate-y-0.5'
      } ${className}`}
    >
      {isPrimary && (
        <span className="absolute -top-2.5 left-5 rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
          Start here
        </span>
      )}

      <div
        className={`h-11 w-11 rounded-xl flex items-center justify-center mb-4 ${
          isPrimary
            ? 'bg-gradient-to-br from-brand to-brand-dark text-white shadow-sm'
            : 'bg-accent-subtle text-brand'
        }`}
      >
        <Icon className="w-5 h-5" />
      </div>

      <h3 className={`flex items-center gap-1.5 ${isPrimary ? 'text-base font-bold text-navy' : 'text-sm font-bold text-navy'}`}>
        {title}
        <ArrowRight
          className={`w-3.5 h-3.5 text-brand transition-all ${
            isPrimary
              ? 'opacity-100 translate-x-0'
              : 'opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0'
          }`}
        />
      </h3>
      <p className="text-xs text-text-2 mt-1.5 leading-relaxed">{description}</p>
    </Link>
  );
}
