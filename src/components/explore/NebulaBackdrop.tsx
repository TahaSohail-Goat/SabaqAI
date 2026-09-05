'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// A drifting nebula on the inside of a very large sphere, replacing the flat background colour.
// One draw call, no texture fetch — the CSP here allows no external assets, and a canvas-baked
// texture at this size would be both heavy and static, so the cloud is evaluated in the
// fragment shader instead and animates for free.
//
// Rendered with depthWrite off at the back of the draw order so it never occludes anything;
// it exists purely to give the void some structure to read depth against.

const vertexShader = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    // Object-space position doubles as the view direction on a sphere centred at the origin,
    // which is all the fragment shader needs to sample a stable 3D noise field.
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;

  uniform float uTime;
  uniform vec3  uDeep;    // the void between clouds
  uniform vec3  uCloud;   // the brand-green body of the nebula
  uniform vec3  uAccent;  // a cooler counter-hue so it isn't one flat wash
  uniform float uIntensity;
  uniform float uOpacity;

  varying vec3 vDirection;

  // Cheap hash-based value noise. Deliberately not Ashima simplex: at nebula scale the extra
  // fidelity is invisible, and this is a fraction of the instruction count on the low-end
  // hardware this app targets.
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f); // smoothstep interpolation

    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  // Fractal Brownian motion — the same layered-octave idea CentralPlanet uses on the CPU for
  // its continents, here on the GPU per fragment.
  //
  // Split into two fixed-octave variants rather than one parameterised loop, because this runs
  // per-fragment across the entire viewport and octave count is the whole cost. The detail
  // field needs the extra octaves; the fields that only *warp* it do not — warping is a
  // low-frequency displacement, and spending five octaves computing it three times over was
  // most of this shader's budget for detail nobody can resolve.
  float fbm3(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 3; i++) {
      value += amplitude * noise(p);
      p *= 2.02;          // non-integer so octaves don't align into visible grid artifacts
      amplitude *= 0.5;
    }
    return value;
  }

  float fbm5(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p *= 2.02;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 dir = vDirection;

    // A low-frequency field that warps the detail field rather than simply adding to it, which
    // is what gives the cloud filaments and voids instead of an even fog. Two samples, reused
    // across three axes with the components swizzled apart — visually indistinguishable from
    // three independent fields here, at two thirds the cost.
    float drift = uTime * 0.012;
    float wa = fbm3(dir * 1.6 + vec3(drift, 0.0, -drift));
    float wb = fbm3(dir * 1.6 + vec3(4.2, drift * 0.7, 1.3));
    vec3 warp = vec3(wa, wb, wa * 0.6 + wb * 0.4);

    float density = fbm5(dir * 2.6 + warp * 1.5 + vec3(0.0, drift * 0.4, 0.0));

    // This fbm sums octaves of a [0,1] noise, so it clusters tightly around 0.5 rather than
    // spanning the full range — thresholds have to sit near that centre or the sky clamps to
    // one extreme. Windowed just above the mean so voids dominate and the cloud stays discrete
    // structure. This is a backdrop: the moment it competes with the books for attention it has
    // failed, so it is deliberately held near the floor of visibility.
    density = smoothstep(0.42, 0.74, density);

    // A second, sparser field picks out where the accent hue shows through.
    float accentMask = smoothstep(0.48, 0.78, fbm3(dir * 3.4 + vec3(9.1, -2.4, drift)));

    vec3 color = mix(uDeep, uCloud, density);
    color = mix(color, uAccent, accentMask * density * 0.7);

    // Bias the cloud toward the galactic "plane" so the sky has an orientation instead of
    // being evenly mottled in every direction.
    float band = 1.0 - smoothstep(0.0, 0.8, abs(dir.y));
    color *= (0.35 + band * 0.65) * uIntensity;

    gl_FragColor = vec4(color, uOpacity);
  }
`;

interface NebulaBackdropProps {
  radius: number;
  reducedMotion: boolean;
}

export default function NebulaBackdrop({ radius, reducedMotion }: NebulaBackdropProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      // Anchored to the app's own dark-theme page colour so the scene sits in the same world
      // as the rest of the UI rather than looking like a stock space skybox.
      uDeep: { value: new THREE.Color('#040b0a') },
      uCloud: { value: new THREE.Color('#135a42') },
      uAccent: { value: new THREE.Color('#22506b') },
      // Single master dial for the whole backdrop, so tuning "how present is the nebula"
      // doesn't mean re-balancing three colours against each other.
      uIntensity: { value: 0.46 },
      uOpacity: { value: 1 },
    }),
    []
  );

  useFrame((_, delta) => {
    if (reducedMotion) return;
    if (materialRef.current) materialRef.current.uniforms.uTime.value += delta;
  });

  return (
    <mesh renderOrder={-1000} frustumCulled={false}>
      {/* Viewed from inside, so BackSide. A negative-scale winding flip works too and is what
          this originally did, but it interacts badly enough with face culling to be worth
          avoiding for a mesh whose entire job is to be visible. */}
      <sphereGeometry args={[radius, 48, 32]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        side={THREE.BackSide}
      />
    </mesh>
  );
}
