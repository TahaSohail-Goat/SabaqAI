'use client';

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import gsap from 'gsap';
import * as THREE from 'three';
import type { SubjectBookHandle, ExplorePhase } from './SubjectBook';

// Scratch vector reused across flights instead of allocating a new THREE.Vector3 per click.
const scratchWorldPos = new THREE.Vector3();

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

    const tl = gsap.timeline({
      onComplete: () => {
        onPhaseChange('done');
        onArrived(targetCode);
      },
    });

    if (reducedMotion) {
      // No camera tween, no cover rotation — jump straight to "opening" so the DOM crossfade
      // (owned by ExploreScene) starts immediately, then arrive after a brief pause.
      onPhaseChange('opening');
      tl.to({}, { duration: 0.15 });
      timelineRef.current = tl;
      return;
    }

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

    timelineRef.current = tl;
  }, [phase, targetCode, bookRefs, reducedMotion, onPhaseChange, onArrived, camera]);

  // Kill any in-flight timeline on unmount so gsap never ticks a disposed camera/mesh after the
  // route swap unmounts this whole tree.
  useEffect(() => {
    return () => {
      timelineRef.current?.kill();
    };
  }, []);
}
