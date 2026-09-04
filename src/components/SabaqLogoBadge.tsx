import React from 'react';
import SabaqLogoMark from './SabaqLogoMark';

// The full SabaqAI lockup mark: green squircle + the ribbon "S" glyph + a white "Ai" badge
// overlapping the top-right corner — matches the app icon at src/app/icon.svg.
export default function SabaqLogoBadge({
  size = 40,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  const badgeSize = Math.round(size * 0.4);

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <div
        className="h-full w-full rounded-[28%] bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-white shadow-[0_0_15px_rgba(27,181,107,0.3)] border border-brand-light/20"
      >
        <SabaqLogoMark style={{ width: size * 0.56, height: size * 0.56 }} />
      </div>
      <div
        className="absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full bg-white text-brand-dark font-extrabold leading-none shadow-md ring-2 ring-surface"
        style={{ width: badgeSize, height: badgeSize, fontSize: Math.max(8, badgeSize * 0.42) }}
      >
        Ai
      </div>
    </div>
  );
}
