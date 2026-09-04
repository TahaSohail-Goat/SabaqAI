'use client';

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import gsap from 'gsap';
import * as THREE from 'three';
import type { SubjectBookHandle, ExplorePhase } from './SubjectBook';

// GSAP's default lag smoothing quietly slows a tween's real-world completion time down when it
// sees a big gap between rendered frames, on the assumption the tab was backgrounded and it
// should ease back in rather than jump. The WebGL scene here renders every frame for the whole
// flight (including the held reveal, still running behind the opaque overlay), and under real
// jank — not backgrounding, just a slow frame — that heuristic can stretch a stated 1.1s/0.6s
// tween out to well over double its length. This is the one file in the app that uses gsap, so
// disabling it globally here is safe: tweens now track real elapsed time exactly, matching what
// the timeline actually says.
gsap.ticker.lagSmoothing(0);

// Scratch vector reused across flights instead of allocating a new THREE.Vector3 per click.
const scratchWorldPos = new THREE.Vector3();

// Held on the black "Happy Learning" reveal (see ExploreScene) once the book has finished
// opening, before the actual page navigation fires. Sized so camera flight (1.1s) + book open
// (0.6s) + this hold lands on a clean 5s total, matching the deliberate, unhurried "arrival"
// moment this was asked for — not an accidental stall while the next page loads.
const REVEAL_HOLD_SECONDS = 3.3;

interface UseExploreFlightArgs {
  phase: ExplorePhase;
  targetCode: string | null;
  bookRefs: React.RefObject<Map<string, SubjectBookHandle>>;
  reducedMotion: boolean;
  onPhaseChange: (phase: ExplorePhase) => void;
  onArrived: (code: string) => void;
}

// Must be called from a component rendered INSIDE <Canvas> — useThree() only resolves there.
// Owns the gsap timeline for the click -> camera-flight -> book-open -> arrive sequence;
// `phase`/`targetCode` are driven from outside (ExploreScene, which also owns the DOM crossfade
// overlay and the accessible button list that live outside the WebGL canvas).
export function useExploreFlight({
  phase,
  targetCode,
  bookRefs,
  reducedMotion,
  onPhaseChange,
  onArrived,
}: UseExploreFlightArgs) {
  const { camera } = useThree();
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (phase !== 'flying' || !targetCode) return;
    if (startedForRef.current === targetCode) return; // already running for this target
    const handle = bookRefs.current.get(targetCode);
    if (!handle) return;
    startedForRef.current = targetCode;

    handle.book.getWorldPosition(scratchWorldPos);
    const targetWorld = scratchWorldPos.clone();
    // Settle a short distance in front of the book, offset up/out for a more cinematic angle
    // than a dead-on approach.
    const cameraDestination = targetWorld.clone().add(new THREE.Vector3(0.9, 0.55, 1.8));

    // The hold below is a plain setTimeout, not a gsap tween — deliberately, same reasoning
    // ExploreScene's crossfade already uses: the WebGL scene keeps rendering every frame behind
    // the opaque overlay for the whole hold, and under real jank a gsap "wait" tween (frame/
    // ticker-driven) can end up taking meaningfully longer than its stated duration. A
    // setTimeout measures real wall-clock time regardless of how choppy rendering gets, so the
    // reveal actually holds for REVEAL_HOLD_SECONDS, not "however long the ticker took to
    // notice 3.3s had passed."
    const arrive = () => {
      onPhaseChange('done');
      onArrived(targetCode);
    };

    if (reducedMotion) {
      // No camera tween, no cover rotation — jump straight to "opening" so the DOM crossfade
      // (owned by ExploreScene) starts immediately. Reduced-motion users still see the "Happy
      // Learning" text (ExploreScene renders it statically, no entrance animation, under this
      // same preference), just without being made to sit through the full hold.
      onPhaseChange('opening');
      onPhaseChange('revealing');
      holdTimerRef.current = setTimeout(arrive, 400);
      return;
    }

    const tl = gsap.timeline();
    tl.to(camera.position, {
      x: cameraDestination.x,
      y: cameraDestination.y,
      z: cameraDestination.z,
      duration: 1.1,
      ease: 'power2.inOut',
      onUpdate: () => camera.lookAt(targetWorld),
    });

    tl.call(() => onPhaseChange('opening'));

    tl.to(handle.coverPivot.rotation, { y: -2.4, duration: 0.6, ease: 'power1.out' }, '<');
    tl.to(handle.book.scale, { x: 1.15, y: 1.15, z: 1.15, duration: 0.6, ease: 'power1.out' }, '<');

    // The book has finished opening — hold on the black "Happy Learning" reveal (a real,
    // timed beat, not just whatever gap happens to exist before the next page loads) before
    // actually navigating.
    tl.call(() => {
      onPhaseChange('revealing');
      holdTimerRef.current = setTimeout(arrive, REVEAL_HOLD_SECONDS * 1000);
    });

    timelineRef.current = tl;
  }, [phase, targetCode, bookRefs, reducedMotion, onPhaseChange, onArrived, camera]);

  // Kill any in-flight timeline/timer on unmount so nothing ticks a disposed camera/mesh or
  // fires a late navigation after the route swap unmounts this whole tree.
  useEffect(() => {
    return () => {
      timelineRef.current?.kill();
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);
}
