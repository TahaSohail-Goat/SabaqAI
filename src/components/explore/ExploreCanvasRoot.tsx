'use client';

import { useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { SUBJECT_LABELS } from '@/lib/subjects';
import type { ExploreSubjectSummary } from '@/lib/types';
import CentralPlanet from './CentralPlanet';
import SubjectBook, { type SubjectBookHandle, type ExplorePhase } from './SubjectBook';
import OrbitPath from './OrbitPath';
import { useExploreFlight } from './useExploreFlight';

const GOLDEN_ANGLE = 2.399963; // radians — spreads N books with minimal visual overlap
const BASE_RADIUS = 3.6;
const RADIUS_STEP = 1.35; // wide enough that adjacent orbit traces never visually merge

// Small, deterministic per-index tilt so orbits read as distinct 3D planes (like a real solar
// system viewed at an angle) instead of everything sitting flat on one boring disc.
function tiltFor(index: number): { tiltX: number; tiltZ: number } {
  return {
    tiltX: ((index % 3) - 1) * 0.16,
    tiltZ: ((Math.floor(index / 3) % 3) - 1) * 0.12,
  };
}

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

  const maxRadius = BASE_RADIUS + Math.max(0, enrolledSubjects.length - 1) * RADIUS_STEP;

  return (
    <>
      <color attach="background" args={['#0A1310']} />
      <ambientLight intensity={0.4} />
      <CentralPlanet reducedMotion={reducedMotion} />
      <Stars radius={maxRadius * 3.5} depth={40} count={reducedMotion ? 1200 : 3200} factor={2.4} fade speed={reducedMotion ? 0 : 0.5} />

      {enrolledSubjects.map((code, i) => {
        const summary = overviewBySubject.get(code);
        const radius = BASE_RADIUS + i * RADIUS_STEP;
        const { tiltX, tiltZ } = tiltFor(i);
        return (
          <group key={code}>
            <OrbitPath radius={radius} tiltX={tiltX} tiltZ={tiltZ} />
            <SubjectBook
              subjectCode={code}
              label={SUBJECT_LABELS[code] ?? code}
              hasTextbook={summary?.hasTextbook ?? false}
              orbitRadius={radius}
              orbitSpeed={0.22 / Math.sqrt(radius)}
              initialAngle={i * GOLDEN_ANGLE}
              tiltX={tiltX}
              tiltZ={tiltZ}
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
          <Bloom intensity={0.65} luminanceThreshold={0.25} luminanceSmoothing={0.3} mipmapBlur />
        </EffectComposer>
      )}
    </>
  );
}

export default function ExploreCanvasRoot(props: ExploreCanvasRootProps) {
  // Frame the camera further back as more subjects (wider orbits) are shown, so the whole
  // system stays visible on first render regardless of how many books there are.
  const maxRadius = BASE_RADIUS + Math.max(0, props.enrolledSubjects.length - 1) * RADIUS_STEP;
  const cameraDistance = Math.max(9, maxRadius * 0.85);

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
