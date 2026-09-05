'use client';

import { useCallback, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { SUBJECT_LABELS } from '@/lib/subjects';
import { apoapsisOf, orbitParamsFor } from '@/lib/explore/orbits';
import type { ExploreSubjectSummary } from '@/lib/types';
import CentralPlanet from './CentralPlanet';
import NebulaBackdrop from './NebulaBackdrop';
import SubjectBook, { type SubjectBookHandle, type ExplorePhase } from './SubjectBook';
import CometTrail from './CometTrail';
import { useExploreFlight } from './useExploreFlight';

interface ExploreCanvasRootProps {
  enrolledSubjects: string[];
  overviewBySubject: Map<string, ExploreSubjectSummary>;
  phase: ExplorePhase;
  targetCode: string | null;
  reducedMotion: boolean;
  onPhaseChange: (phase: ExplorePhase) => void;
  onTriggerFlight: (code: string) => void;
  onArrived: (code: string) => void;
}

function SceneContents({
  enrolledSubjects,
  overviewBySubject,
  phase,
  targetCode,
  reducedMotion,
  onPhaseChange,
  onTriggerFlight,
  onArrived,
}: ExploreCanvasRootProps) {
  const bookRefs = useRef<Map<string, SubjectBookHandle>>(new Map());

  const handleRegister = useCallback((code: string, handle: SubjectBookHandle | null) => {
    if (handle) bookRefs.current.set(code, handle);
    else bookRefs.current.delete(code);
  }, []);

  useExploreFlight({ phase, targetCode, bookRefs, reducedMotion, onPhaseChange, onArrived });

  // One orbit per subject, plus the mutable anomaly each book shares with its own trail. Built
  // together so the book and the wake behind it are guaranteed to be reading the same number.
  const system = useMemo(
    () =>
      enrolledSubjects.map((code, i) => {
        const params = orbitParamsFor(i);
        return { code, params, anomaly: { value: params.phase } };
      }),
    [enrolledSubjects]
  );

  const maxRadius = system.length ? Math.max(...system.map((s) => apoapsisOf(s.params))) : 4;

  return (
    <>
      <ambientLight intensity={0.4} />
      {/* Under reduced motion the nebula would be a still image that still re-evaluated a
          full-viewport noise shader every frame — all of the cost, none of the drift it exists
          for. A flat ground is the honest version of "the same picture every frame". */}
      {reducedMotion ? (
        <color attach="background" args={['#0A1310']} />
      ) : (
        <NebulaBackdrop radius={maxRadius * 6} reducedMotion={reducedMotion} />
      )}
      <CentralPlanet reducedMotion={reducedMotion} />
      <Stars radius={maxRadius * 3.5} depth={40} count={reducedMotion ? 1200 : 3200} factor={2.4} fade speed={reducedMotion ? 0 : 0.5} />

      {system.map(({ code, params, anomaly }) => {
        const summary = overviewBySubject.get(code);
        return (
          <group key={code}>
            <CometTrail
              subjectCode={code}
              params={params}
              anomaly={anomaly}
              // Scaled with the orbit so distant wakes don't thin out to invisibility.
              width={0.16 + params.semiMajor * 0.035}
              reducedMotion={reducedMotion}
            />
            <SubjectBook
              subjectCode={code}
              label={SUBJECT_LABELS[code] ?? code}
              hasTextbook={summary?.hasTextbook ?? false}
              params={params}
              anomaly={anomaly}
              reducedMotion={reducedMotion}
              phase={phase}
              isTarget={targetCode === code}
              onRegister={handleRegister}
              onClick={onTriggerFlight}
            />
          </group>
        );
      })}

      <OrbitControls
        enablePan={false}
        enabled={phase === 'idle'}
        autoRotate={phase === 'idle' && !reducedMotion}
        autoRotateSpeed={0.2}
        minDistance={4}
        maxDistance={maxRadius * 1.8}
      />

      {!reducedMotion && (
        <EffectComposer>
          {/* Bloom does the heavy lifting: the trails and the atmosphere rim are additive, so
              they bleed light exactly where the eye expects it. */}
          <Bloom intensity={0.8} luminanceThreshold={0.22} luminanceSmoothing={0.32} mipmapBlur />
          {/* No chromatic aberration here, though it's the obvious next "cinematic" pass to
              reach for. Tried it: against a starfield of single-pixel points it splits every
              star into a red/green fringe, which reads as a dead-pixel display rather than a
              lens. The effect needs large smooth areas to work on, and this scene is mostly
              tiny bright points on black. */}
          {/* Gentle — a heavier vignette crushes the nebula at the frame edges, which is
              exactly where most of it is visible. */}
          <Vignette eskil={false} offset={0.32} darkness={0.5} />
        </EffectComposer>
      )}
    </>
  );
}

export default function ExploreCanvasRoot(props: ExploreCanvasRootProps) {
  // Frame the camera further back as more subjects (wider orbits) are shown, so the whole
  // system stays visible on first render regardless of how many books there are. Measured from
  // apoapsis, not the semi-major axis — an eccentric orbit swings its book further out than its
  // "size" suggests, and framing on the average would clip it at the far end of every lap.
  const outermost = props.enrolledSubjects.length
    ? apoapsisOf(orbitParamsFor(props.enrolledSubjects.length - 1))
    : 4;
  // Sit outside apoapsis, not inside it: framed any closer and the outermost book swings past
  // the camera once per lap and clips through the foreground.
  const cameraDistance = Math.max(11, outermost * 1.25);

  // No reason to keep rendering the 3D scene once it's fully hidden behind the opaque "Happy
  // Learning" overlay — it would otherwise render every frame for the entire held reveal for
  // nothing visible, and that wasted work is exactly what was dragging gsap's tween timing off
  // (see useExploreFlight's lagSmoothing note) in the first place.
  const rendering = props.phase !== 'revealing' && props.phase !== 'done';

  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
      camera={{ position: [0, cameraDistance * 0.4, cameraDistance], fov: 50 }}
      frameloop={rendering ? 'always' : 'never'}
    >
      <SceneContents {...props} />
    </Canvas>
  );
}
