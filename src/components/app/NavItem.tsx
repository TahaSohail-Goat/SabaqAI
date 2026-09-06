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
  /** Icon-only rail mode (collapsed desktop sidebar) — centers the icon, drops the label/badge
   *  from layout entirely rather than just hiding them, and falls back to a native title
   *  tooltip so the item's meaning survives without the text. */
  collapsed?: boolean;
  /** Match this href exactly, never a sub-route prefix. Needed for /dashboard specifically:
   *  its own sub-routes (/dashboard/progress, /dashboard/plan) each have their own dedicated
   *  nav entry, so the default prefix match would light up BOTH Dashboard and Progress at once
   *  on /dashboard/progress. Every other item's sub-routes (e.g. /quiz/history) have no nav
   *  entry of their own, so the default prefix behavior is what keeps those correctly
   *  highlighted and should stay the default. */
  exact?: boolean;
}

export default function NavItem({ href, icon: Icon, label, badge, disabled, onNavigate, collapsed, exact }: NavItemProps) {
  const pathname = usePathname();
  const active = !disabled && (pathname === href || (!exact && pathname?.startsWith(`${href}/`)));

  // Disabled items stay legible (AGENTS.md: don't communicate "unavailable" by making text
  // unreadable) — they just carry none of the interactive/active affordances below.
  //
  // rounded-2xl + this padding, not the old rounded-xl/tighter pair — the whole item reads as
  // one deliberate pill/chip now, not a table row with a highlight. The active state's contrast
  // comes entirely from --color-nav-active-* (a fill, not a tint) plus the icon chip below, so
  // the old left accent bar is gone — it was doing a job the pill and chip now do more clearly.
  const classes = `group relative flex items-center rounded-2xl text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
    collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
  } ${
    disabled
      ? 'text-text-2 cursor-not-allowed'
      : active
      ? 'bg-nav-active-surface text-nav-active-text'
      : 'text-text-2 hover:bg-surface-hover hover:text-navy'
  }`;

  // The icon always sits in its own small chip, active or not — inactive items get a soft
  // surface-muted box so the rail reads as a row of chips even at rest, not bare glyphs. An
  // active item swaps the pair (chip fills solid with the pill's own TEXT color, the icon takes
  // the pill's SURFACE color) so the chip stays a distinct nested badge against the fill around
  // it instead of blending in — this only works as a solid swap, not an opacity tint, because
  // dark mode's pair is a near-black/near-white extreme that a tint would just wash out.
  const iconChipClasses = `flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors ${
    disabled
      ? 'text-text-3'
      : active
      ? 'bg-nav-active-text text-nav-active-surface'
      : 'bg-surface-muted text-text-3 group-hover:text-navy-2'
  }`;

  const content = (
    <>
      <span className={iconChipClasses}>
        <Icon className="w-[18px] h-[18px]" />
      </span>
      {!collapsed && (
        <>
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
      )}
    </>
  );

  if (disabled) {
    return (
      <div className={classes} aria-disabled="true" title={collapsed ? label : undefined}>
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={classes}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
    >
      {content}
    </Link>
  );
}
