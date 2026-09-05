'use client';

import React from 'react';

// The animated study scene held on /explore's black screen after a book finishes opening
// (see useExploreFlight's REVEAL_HOLD_SECONDS and ExploreScene's crossfade overlay).
//
// Hand-drawn SVG rather than a real video file, deliberately: next.config.mjs's CSP declares
// no media-src, so it falls back to default-src 'self' and an externally hosted clip would be
// blocked outright — while a self-hosted one would mean a multi-megabyte binary in the repo,
// re-uploaded on every deploy, buffering, for a 3.3-second beat. This starts painting on the
// first frame instead and costs a few KB. Every keyframe lives in globals.css (search
// "study reveal"), where they're also disabled under prefers-reduced-motion.

// Lines "written" onto the left page only. The right page carries the turning sheets, which at
// this stagger cover it without a gap — anything drawn under them would never actually be seen.
// So the spread reads the way a real one does mid-study: worked-through page on the left, fresh
// pages arriving on the right. Ragged widths on purpose — equal-length bars read as a loading
// skeleton, not as prose someone is working through.
const PAGE_LINES: { x: number; y: number; w: number; delay: string }[] = [
  { x: 50, y: 66, w: 46, delay: '0.55s' },
  { x: 50, y: 74, w: 52, delay: '0.72s' },
  { x: 50, y: 82, w: 40, delay: '0.89s' },
  { x: 50, y: 90, w: 49, delay: '1.06s' },
  { x: 50, y: 98, w: 33, delay: '1.23s' },
];

// Motes lifting off the open spread — the "something just landed" cue that carries the beat
// once the pages have finished writing themselves.
const MOTES: { cx: number; r: number; delay: string; duration: string }[] = [
  { cx: 84, r: 2.6, delay: '0.9s', duration: '2.6s' },
  { cx: 101, r: 1.8, delay: '1.4s', duration: '2.9s' },
  { cx: 118, r: 3, delay: '0.6s', duration: '2.4s' },
  { cx: 133, r: 2, delay: '1.7s', duration: '3.1s' },
  { cx: 94, r: 1.6, delay: '2.1s', duration: '2.7s' },
  { cx: 126, r: 2.3, delay: '2.5s', duration: '2.5s' },
];

// Sheets turning over the spine. Staggered so one is always mid-turn across the whole hold.
const FLIP_DELAYS = ['0s', '1.15s', '2.3s'];

const SPINE_X = 110;

export default function StudyReveal({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const motion = (className: string) => (reducedMotion ? '' : className);

  return (
    <svg
      viewBox="0 0 220 150"
      className={`w-[min(80vw,540px)] ${motion('animate-study-scene-in')}`}
      role="img"
      aria-label="An open book with pages turning"
    >
      <defs>
        <radialGradient id="study-glow">
          <stop offset="0%" stopColor="#4CDEA5" stopOpacity="0.4" />
          <stop offset="65%" stopColor="#4CDEA5" stopOpacity="0.07" />
          <stop offset="100%" stopColor="#4CDEA5" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="study-page" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F2FCF7" />
          <stop offset="100%" stopColor="#BCE9D5" />
        </linearGradient>
        <linearGradient id="study-sheet" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#9FDCC1" />
        </linearGradient>
      </defs>

      <ellipse
        cx={SPINE_X}
        cy="92"
        rx="105"
        ry="52"
        fill="url(#study-glow)"
        className={motion('animate-study-glow')}
        style={{ transformBox: 'view-box', transformOrigin: '110px 92px' }}
      />

      {/* Motes rise from the spread, so they sit behind the pages they lift off. */}
      {!reducedMotion &&
        MOTES.map((mote) => (
          <circle
            key={`${mote.cx}-${mote.delay}`}
            cx={mote.cx}
            cy="62"
            r={mote.r}
            fill="#4CDEA5"
            className="animate-study-mote"
            style={{ animationDelay: mote.delay, animationDuration: mote.duration }}
          />
        ))}

      <g>
        <path
          d="M110,60 C92,50 66,47 40,53 L40,110 C66,104 92,107 110,118 Z"
          fill="url(#study-page)"
          stroke="#4CDEA5"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M110,60 C128,50 154,47 180,53 L180,110 C154,104 128,107 110,118 Z"
          fill="url(#study-page)"
          stroke="#4CDEA5"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />

        {PAGE_LINES.map((line) => (
          <rect
            key={`${line.x}-${line.y}`}
            x={line.x}
            y={line.y}
            width={line.w}
            height="3"
            rx="1.5"
            fill="#1E7A57"
            fillOpacity="0.55"
            className={motion('animate-study-write')}
            style={
              reducedMotion
                ? undefined
                : { transformBox: 'fill-box', transformOrigin: 'left center', animationDelay: line.delay }
            }
          />
        ))}

        {/* Sheets mid-turn. scaleX about the spine foreshortens the page exactly the way a real
            one does as it passes overhead, then carries it through to the far side at -1. */}
        {!reducedMotion &&
          FLIP_DELAYS.map((delay) => (
            <path
              key={delay}
              d="M110,61 C127,52 151,49 176,55 L176,108 C151,103 127,106 110,117 Z"
              fill="url(#study-sheet)"
              stroke="#4CDEA5"
              strokeWidth="1.4"
              strokeLinejoin="round"
              className="animate-study-flip"
              style={{ transformBox: 'view-box', transformOrigin: `${SPINE_X}px 89px`, animationDelay: delay }}
            />
          ))}

        <path d="M110,60 L110,118" stroke="#1E7A57" strokeWidth="1.8" strokeLinecap="round" opacity="0.7" />
      </g>
    </svg>
  );
}
