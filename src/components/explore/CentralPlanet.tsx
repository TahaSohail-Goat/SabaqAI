'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import * as THREE from 'three';

const PLANET_RADIUS = 1.4;
const TEX_WIDTH = 512;
const TEX_HEIGHT = 256;

// Fractal Brownian motion — layers several octaves of simplex noise so continents get both
// broad landmass shapes (low frequency) and coastline/terrain detail (higher frequency),
// instead of one smooth blob. Sampled in 3D on the sphere's own surface (not 2D across the
// texture's u/v), which is what keeps the poles and the u=0/u=1 seam artifact-free.
function fbm3(noise3D: NoiseFunction3D, x: number, y: number, z: number, octaves = 5): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise3D(x * frequency, y * frequency, z * frequency);
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / maxValue; // normalized to roughly [-1, 1]
}

// Both textures are canvas-generated and lazily built on first client-side call — module scope
// alone can't touch `document` here, since 'use client' components still get server-rendered
// for the initial HTML (same guard convention used throughout src/components/explore).
let planetTexture: THREE.CanvasTexture | null = null;
function getPlanetTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (planetTexture) return planetTexture;

  const canvas = document.createElement('canvas');
  canvas.width = TEX_WIDTH;
  canvas.height = TEX_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const noise3D = createNoise3D();
  const img = ctx.createImageData(TEX_WIDTH, TEX_HEIGHT);

  for (let y = 0; y < TEX_HEIGHT; y++) {
    const v = y / (TEX_HEIGHT - 1); // 0 at the north pole, 1 at the south pole
    const phi = v * Math.PI;
    // 0 at the equator, 1 at either pole — drives the ice-cap blend below.
    const poleFactor = Math.max(0, Math.abs(v - 0.5) * 2 - 0.76) / 0.24;

    for (let x = 0; x < TEX_WIDTH; x++) {
      const u = x / (TEX_WIDTH - 1);
      const theta = u * Math.PI * 2;

      const sx = Math.sin(phi) * Math.cos(theta);
      const sy = Math.sin(phi) * Math.sin(theta);
      const sz = Math.cos(phi);

      const elevation = fbm3(noise3D, sx * 1.6, sy * 1.6, sz * 1.6, 5);

      let r: number, g: number, b: number;
      if (elevation < -0.05) {
        const depth = THREE.MathUtils.clamp((elevation + 0.5) / 0.45, 0, 1);
        r = THREE.MathUtils.lerp(8, 38, depth);
        g = THREE.MathUtils.lerp(42, 108, depth);
        b = THREE.MathUtils.lerp(92, 168, depth);
      } else if (elevation < 0.02) {
        r = 196;
        g = 180;
        b = 130;
      } else if (elevation < 0.24) {
        const t = (elevation - 0.02) / 0.22;
        r = THREE.MathUtils.lerp(94, 58, t);
        g = THREE.MathUtils.lerp(142, 108, t);
        b = THREE.MathUtils.lerp(72, 54, t);
      } else {
        const t = THREE.MathUtils.clamp((elevation - 0.24) / 0.3, 0, 1);
        r = THREE.MathUtils.lerp(118, 150, t);
        g = THREE.MathUtils.lerp(100, 128, t);
        b = THREE.MathUtils.lerp(82, 128, t);
      }

      r = THREE.MathUtils.lerp(r, 246, poleFactor);
      g = THREE.MathUtils.lerp(g, 249, poleFactor);
      b = THREE.MathUtils.lerp(b, 251, poleFactor);

      const idx = (y * TEX_WIDTH + x) * 4;
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  planetTexture = new THREE.CanvasTexture(canvas);
  planetTexture.colorSpace = THREE.SRGBColorSpace;
  return planetTexture;
}

let cloudTexture: THREE.CanvasTexture | null = null;
function getCloudTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cloudTexture) return cloudTexture;

  const canvas = document.createElement('canvas');
  canvas.width = TEX_WIDTH;
  canvas.height = TEX_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const noise3D = createNoise3D();
  const img = ctx.createImageData(TEX_WIDTH, TEX_HEIGHT);

  for (let y = 0; y < TEX_HEIGHT; y++) {
    const v = y / (TEX_HEIGHT - 1);
    const phi = v * Math.PI;
    for (let x = 0; x < TEX_WIDTH; x++) {
      const u = x / (TEX_WIDTH - 1);
      const theta = u * Math.PI * 2;
      const sx = Math.sin(phi) * Math.cos(theta);
      const sy = Math.sin(phi) * Math.sin(theta);
      const sz = Math.cos(phi);

      // Offset coordinates so cloud bands don't line up with the continent noise field.
      const n = fbm3(noise3D, sx * 3 + 40, sy * 3 + 40, sz * 3 + 40, 4);
      const alpha = Math.max(0, n - 0.18) * 1.8;

      const idx = (y * TEX_WIDTH + x) * 4;
      img.data[idx] = 255;
      img.data[idx + 1] = 255;
      img.data[idx + 2] = 255;
      img.data[idx + 3] = Math.min(255, alpha * 255);
    }
  }

  ctx.putImageData(img, 0, 0);
  cloudTexture = new THREE.CanvasTexture(canvas);
  return cloudTexture;
}

export default function CentralPlanet({ reducedMotion }: { reducedMotion: boolean }) {
  const planetRef = useRef<THREE.Mesh>(null);
  const cloudRef = useRef<THREE.Mesh>(null);
  const planetTex = useMemo(() => getPlanetTexture(), []);
  const cloudTex = useMemo(() => getCloudTexture(), []);

  useFrame((_, delta) => {
    if (reducedMotion) return;
    if (planetRef.current) planetRef.current.rotation.y += delta * 0.06;
    // Clouds drift at a slightly different rate than the surface for a subtle parallax cue.
    if (cloudRef.current) cloudRef.current.rotation.y += delta * 0.085;
  });

  return (
    <group>
      <mesh ref={planetRef}>
        <sphereGeometry args={[PLANET_RADIUS, 48, 48]} />
        <meshStandardMaterial map={planetTex ?? undefined} roughness={0.85} metalness={0.05} />
      </mesh>

      {cloudTex && (
        <mesh ref={cloudRef} scale={1.015}>
          <sphereGeometry args={[PLANET_RADIUS, 48, 48]} />
          <meshStandardMaterial map={cloudTex} transparent opacity={0.85} depthWrite={false} roughness={1} />
        </mesh>
      )}

      {/* Soft atmosphere haze — a larger backside-rendered, additively-blended sphere. Not a
          physically-real Fresnel rim (that needs a custom shader), but a cheap, low-risk way to
          still read as "planet with an atmosphere" rather than a bare rock. */}
      <mesh scale={1.14}>
        <sphereGeometry args={[PLANET_RADIUS, 32, 32]} />
        <meshBasicMaterial
          color="#7fd4ff"
          transparent
          opacity={0.16}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Key light, offset from the planet rather than at its center — a light at the same
          position as the sphere it's lighting shines every surface point equally (flat, no
          terminator). Offset gives a real day/night line as the planet turns, and is still the
          scene's main light source for the orbiting books further out. */}
      <pointLight position={[9, 6, 5]} color="#fff6e0" intensity={22} distance={60} decay={2} />
    </group>
  );
}
