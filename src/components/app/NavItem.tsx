'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItemProps {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: string;
  disabled?: boolean;
  onNavigate?: () => void;
}

export default function NavItem({ href, icon: Icon, label, badge, disabled, onNavigate }: NavItemProps) {
  const pathname = usePathname();
  const active = !disabled && (pathname === href || pathname?.startsWith(`${href}/`));

  // Disabled items stay legible (AGENTS.md: don't communicate "unavailable" by making text
  // unreadable) — they just carry none of the interactive/active affordances below.
  const classes = `group relative flex items-center gap-3 pl-3.5 pr-3 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
    disabled
      ? 'text-text-2 cursor-not-allowed'
      : active
      ? 'bg-selected-surface text-selected-text'
      : 'text-text-2 hover:bg-surface-hover hover:text-navy'
  }`;

  const content = (
    <>
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-selected-text/70" aria-hidden="true" />
      )}
      <Icon
        className={`w-[18px] h-[18px] shrink-0 transition-colors ${
          disabled ? 'text-text-3' : active ? 'text-selected-text' : 'text-text-3 group-hover:text-navy-2'
        }`}
      />
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span
          className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
            disabled ? 'bg-surface-muted text-text-2' : 'bg-brand/15 text-brand-dark'
          }`}
        >
          {badge}
        </span>
      )}
    </>
  );

  if (disabled) {
    return (
      <div className={classes} aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <Link href={href} onClick={onNavigate} className={classes} aria-current={active ? 'page' : undefined}>
      {content}
    </Link>
  );
}
