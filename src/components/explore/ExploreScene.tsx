'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SUBJECT_LABELS } from '@/lib/subjects';
import type { ExploreOverviewResponse } from '@/lib/types';
import type { ExplorePhase } from './SubjectBook';
import ExploreCanvasRoot from './ExploreCanvasRoot';
import ExploreFallbackGrid from './ExploreFallbackGrid';
import StudyReveal from './StudyReveal';

interface ExploreSceneProps {
  enrolledSubjects: string[];
  overview: ExploreOverviewResponse | null;
  onArrived: (code: string) => void;
}

export default function ExploreScene({ enrolledSubjects, overview, onArrived }: ExploreSceneProps) {
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [phase, setPhase] = useState<ExplorePhase>('idle');
  const [targetCode, setTargetCode] = useState<string | null>(null);
  const [crossfadeVisible, setCrossfadeVisible] = useState(false);

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      setWebglSupported(!!gl);
    } catch {
      setWebglSupported(false);
    }
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  const triggerFlight = useCallback(
    (code: string) => {
      if (phase !== 'idle') return;
      setTargetCode(code);
      setPhase('flying');
    },
    [phase]
  );

  const handleArrived = useCallback(
    (code: string) => {
      onArrived(code);
    },
    [onArrived]
  );

  // Fades to black right as the book finishes opening (timed to land exactly there — see the
  // 0.6s book-open tween and this same duration below) and holds through the "revealing" phase
  // (see useExploreFlight's REVEAL_HOLD_SECONDS) before the real page navigation fires —
  // decoupled from gsap/WebGL on purpose (a plain CSS opacity transition, not a tween), so it
  // keeps working even if something upstream stalls.
  useEffect(() => {
    if (phase === 'opening') {
      setCrossfadeVisible(true);
    }
    if (phase === 'idle') {
      setCrossfadeVisible(false);
    }
  }, [phase]);

  const overviewBySubject = useMemo(() => {
    const map = new Map(overview?.subjects.map((s) => [s.subjectCode, s]) ?? []);
    return map;
  }, [overview]);

  return (
    <div className="relative h-[calc(100vh-7rem)] rounded-2xl border border-border overflow-hidden bg-page">
      {/* Accessible, deterministic alternative to raycasted 3D clicks — invisible until
          keyboard-focused. 3D scene objects are otherwise unreachable without a mouse. */}
      <div className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:top-3 focus-within:left-3 focus-within:z-30 focus-within:flex focus-within:flex-col focus-within:gap-1 focus-within:rounded-xl focus-within:border focus-within:border-border focus-within:bg-surface focus-within:p-3 focus-within:shadow-lg">
        {enrolledSubjects.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => triggerFlight(code)}
            className="text-left text-xs font-semibold text-navy underline hover:text-brand"
          >
            Jump to {SUBJECT_LABELS[code] ?? code}
          </button>
        ))}
      </div>

      {webglSupported === null ? (
        <div className="flex h-full items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-brand/20 border-t-brand animate-spin" />
        </div>
      ) : webglSupported ? (
        <ExploreCanvasRoot
          enrolledSubjects={enrolledSubjects}
          overviewBySubject={overviewBySubject}
          phase={phase}
          targetCode={targetCode}
          reducedMotion={reducedMotion}
          onPhaseChange={setPhase}
          onTriggerFlight={triggerFlight}
          onArrived={handleArrived}
        />
      ) : (
        <div className="h-full overflow-y-auto p-5">
          <ExploreFallbackGrid
            enrolledSubjects={enrolledSubjects}
            overviewBySubject={overviewBySubject}
            onArrived={handleArrived}
          />
        </div>
      )}

      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black transition-opacity ${
          reducedMotion ? 'duration-150' : 'duration-[600ms]'
        } ${crossfadeVisible ? 'opacity-100' : 'opacity-0'}`}
      >
        {(phase === 'revealing' || phase === 'done') && (
          <div className="relative flex flex-col items-center gap-3">
            {!reducedMotion && (
              <>
                <span className="absolute top-1/2 h-40 w-40 -translate-y-1/2 rounded-full border-2 border-brand/50 animate-reveal-ring" />
                <span className="absolute top-1/2 h-40 w-40 -translate-y-1/2 rounded-full border-2 border-brand/40 animate-reveal-ring [animation-delay:0.3s]" />
                <span className="absolute top-1/2 h-40 w-40 -translate-y-1/2 rounded-full border-2 border-brand/30 animate-reveal-ring [animation-delay:0.6s]" />
              </>
            )}
            <StudyReveal reducedMotion={reducedMotion} />
            <p
              className={`font-display px-6 text-center text-xl font-semibold tracking-tight text-white/90 sm:text-2xl ${
                reducedMotion ? '' : 'animate-happy-learning [animation-delay:0.55s]'
              }`}
            >
              <span className={reducedMotion ? '' : 'animate-happy-learning-glow'}>Happy Learning</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
