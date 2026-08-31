'use client';

import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

const SEGMENTS = 96;

interface OrbitPathProps {
  radius: number;
  tiltX: number;
  tiltZ: number;
}

// The visible circular trace each book travels — without this, "orbiting books" just reads as
// "books floating near a sphere." Wrapped in a group sharing the same tilt as its book's own
// orbit group (see SubjectBook) so the drawn path actually matches the path traveled.
export default function OrbitPath({ radius, tiltX, tiltZ }: OrbitPathProps) {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const theta = (i / SEGMENTS) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(theta) * radius, 0, Math.sin(theta) * radius));
    }
    return pts;
  }, [radius]);

  return (
    <group rotation={[tiltX, 0, tiltZ]}>
      <Line points={points} color="#5b7d6c" lineWidth={1} transparent opacity={0.4} depthWrite={false} />
    </group>
  );
}
