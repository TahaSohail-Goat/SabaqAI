import React from 'react';

// The SabaqAI mark: an open book with an atom on the right page — syllabus + science,
// grounded together. Pairs with the white "Ai" badge (see SabaqLogoBadge) which carries
// the AI cue, so this glyph alone stays legible at any size.
export default function SabaqLogoMark({ className = '', ...rest }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true" {...rest}>
      <path
        d="M12 7v14M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* left page — text lines */}
      <path
        d="M4.5 7.5h4M4.5 10.5h4M4.5 13.5h3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      {/* right page — atom */}
      <g transform="translate(17 10.5)" stroke="currentColor" strokeWidth="1.1" fill="none">
        <ellipse rx="3" ry="1.2" />
        <ellipse rx="3" ry="1.2" transform="rotate(60)" />
        <ellipse rx="3" ry="1.2" transform="rotate(120)" />
      </g>
      <circle cx="17" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
