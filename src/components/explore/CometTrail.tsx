'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { type OrbitParams, positionAt } from '@/lib/explore/orbits';
import { useSubjectColor } from '@/lib/explore/subjectVisuals';

// The glowing wake each book drags around its orbit, replacing the flat dim ring that used to
// mark the path. A ring tells you where a book *will* go; a wake tells you where it just came
// from and how fast — the whole system reads as moving even in a screenshot.
//
// Built as a flat ribbon lying in the orbit's own plane, so it needs no billboarding: we always
// view these planes at an angle anyway, and an in-plane ribbon is both cheaper and more stable
// than camera-facing geometry. Brightness is computed per-fragment from how far *behind* the
// book that point is, which is why the head is hot and the far side of the orbit is nearly dark.

const SEGMENTS = 220; // enough that the ellipse has no visible faceting at the head
const TAU = Math.PI * 2;

const vertexShader = /* glsl */ `
  attribute float aAngle;
  attribute float aSide;
  varying float vAngle;
  varying float vSide;

  void main() {
    vAngle = aAngle;
    vSide = aSide;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;

  uniform vec3  uColor;
  uniform float uHead;      // the book's current true anomaly
  uniform float uFalloff;   // how quickly the wake decays behind the book
  uniform float uBase;      // faint always-on floor, so the full orbit stays legible
  uniform float uIntensity;
  uniform float uOpacity;

  varying float vAngle;
  varying float vSide;

  const float TAU = 6.2831853;

  void main() {
    // Angular distance travelled since the book passed this point. Wrapping into [0, TAU)
    // means the fragment just behind the book gets ~0 and the one just *ahead* of it gets
    // nearly a full revolution — which is exactly the asymmetry that makes it read as a wake
    // with a direction rather than a symmetric glow.
    float behind = mod(uHead - vAngle, TAU);

    float wake = exp(-behind * uFalloff);

    // A tight hot core right at the book itself, so the head has a visible spark.
    float head = exp(-behind * uFalloff * 9.0);

    // Soft edges across the ribbon's width; the wake also narrows as it fades, which is what
    // stops the tail reading as a uniform-width painted stripe.
    float taper = 1.0 - smoothstep(0.0, 1.0, abs(vSide) / max(0.25, wake));

    float alpha = (uBase + wake * uIntensity) * taper * uOpacity;
    vec3 color = uColor * (0.55 + wake * 0.9) + vec3(head * 0.85);

    if (alpha < 0.002) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

interface CometTrailProps {
  /** Resolved to the subject's own accent here rather than passed down, so the trail always
   *  matches its book's cover without the parent having to plumb colours through. */
  subjectCode: string;
  params: OrbitParams;
  /** Shared with the book on this orbit — single source of truth, so the wake's head can never
   *  drift out of sync with the body casting it. */
  anomaly: { value: number };
  width: number;
  reducedMotion: boolean;
}

export default function CometTrail({ subjectCode, params, anomaly, width, reducedMotion }: CometTrailProps) {
  const color = useSubjectColor(subjectCode);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const geometry = useMemo(() => {
    const positions = new Float32Array((SEGMENTS + 1) * 2 * 3);
    const angles = new Float32Array((SEGMENTS + 1) * 2);
    const sides = new Float32Array((SEGMENTS + 1) * 2);
    const indices: number[] = [];

    const here = new THREE.Vector3();
    const ahead = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const offset = new THREE.Vector3();

    for (let i = 0; i <= SEGMENTS; i++) {
      const theta = (i / SEGMENTS) * TAU;
      positionAt(params, theta, here);
      positionAt(params, theta + 0.01, ahead);

      tangent.subVectors(ahead, here).normalize();
      // Both the position and the tangent lie in the orbital plane, so their cross product is
      // the plane's normal — no need to reconstruct the tilt matrix here.
      normal.crossVectors(here, tangent).normalize();
      offset.crossVectors(normal, tangent).normalize().multiplyScalar(width / 2);

      const base = i * 2;
      positions[base * 3] = here.x + offset.x;
      positions[base * 3 + 1] = here.y + offset.y;
      positions[base * 3 + 2] = here.z + offset.z;
      positions[(base + 1) * 3] = here.x - offset.x;
      positions[(base + 1) * 3 + 1] = here.y - offset.y;
      positions[(base + 1) * 3 + 2] = here.z - offset.z;

      angles[base] = theta;
      angles[base + 1] = theta;
      sides[base] = 1;
      sides[base + 1] = -1;

      if (i < SEGMENTS) {
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));
    geo.setAttribute('aSide', new THREE.BufferAttribute(sides, 1));
    geo.setIndex(indices);
    return geo;
  }, [params, width]);

  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(color) },
      uHead: { value: params.phase },
      // A wake roughly a third of the orbit long: short enough to clearly point backwards,
      // long enough to survive the slow stretch through apoapsis.
      uFalloff: { value: 0.85 },
      uBase: { value: 0.07 },
      uIntensity: { value: 1.5 },
      uOpacity: { value: reducedMotion ? 0.45 : 1 },
    }),
    // Rebuilt only on a real change; per-frame updates go through the refs below.
    [color, params.phase, reducedMotion]
  );

  useFrame(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uHead.value = anomaly.value;
    }
  });

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
