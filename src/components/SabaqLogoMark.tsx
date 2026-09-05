import React from 'react';

// The SabaqAI mark: a single flowing "S" stroke with one amber spark node at its top
// terminus — the ribbon reads as motion/progress (a study path, not a fixed answer), and
// the spark is the one deliberate accent color on the mark, standing in for the "Ai" cue.
// Pairs with the white "Ai" badge (see SabaqLogoBadge) which still carries that cue at a
// glance, so this glyph alone stays legible at any size.
export default function SabaqLogoMark({ className = '', ...rest }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true" {...rest}>
      <path
        d="M72,26 C72,15 61,9 50,9 C37,9 26,17 26,28 C26,40 39,43 50,47 C63,51 74,55 74,70 C74,83 63,91 50,91 C39,91 28,86 28,75"
        stroke="currentColor"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <circle cx="72" cy="26" r="7.5" fill="#F2B84B" />
    </svg>
  );
}
