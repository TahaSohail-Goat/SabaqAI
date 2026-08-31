'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { RoundedBoxGeometry } from 'three-stdlib';
import * as THREE from 'three';
import { useSubjectColor } from '@/lib/explore/subjectVisuals';
import { getSubjectIcon } from '@/lib/explore/subjectIcons';

// Book dimensions, shared by every SubjectBook instance. The front cover hinges open around
// the spine (the book's left edge, running along Y) — see the pivot group below.
const BOOK_WIDTH = 1.0;
const BOOK_HEIGHT = 1.3;
const PAGE_THICKNESS = 0.34;
const COVER_THICKNESS = 0.08;
const HALF_WIDTH = BOOK_WIDTH / 2;

// Shared geometry singletons — created once, reused across all up-to-9 books. Covers use a
// lightly rounded box for a hardcover feel; the fore-edge strip is what actually reads as
// "many stacked pages" (see getPageEdgeTexture below) rather than a solid slab.
const pagesGeometry = new THREE.BoxGeometry(BOOK_WIDTH * 0.94, BOOK_HEIGHT * 0.94, PAGE_THICKNESS);
const coverGeometry = new RoundedBoxGeometry(BOOK_WIDTH, BOOK_HEIGHT, COVER_THICKNESS, 2, 0.035);
const spineGeometry = new THREE.BoxGeometry(0.05, BOOK_HEIGHT, PAGE_THICKNESS + COVER_THICKNESS * 2);
const pageEdgeGeometry = new THREE.BoxGeometry(0.03, BOOK_HEIGHT * 0.92, PAGE_THICKNESS * 0.92);
const glowGeometry = new THREE.CircleGeometry(0.9, 32);

// Both textures are canvas-generated and lazily built on first client-side call — module scope
// alone can't touch `document` here, since 'use client' components still get server-rendered
// for the initial HTML in this Next.js setup (see AskDocumentReader.tsx for the same
// typeof-guard convention applied to a different client-only API).
let pageEdgeTexture: THREE.CanvasTexture | null = null;
function getPageEdgeTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (pageEdgeTexture) return pageEdgeTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#f4efe2';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#cabe9d';
  ctx.lineWidth = 1;
  for (let y = 3; y < canvas.height; y += 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  pageEdgeTexture = new THREE.CanvasTexture(canvas);
  return pageEdgeTexture;
}

let glowTexture: THREE.CanvasTexture | null = null;
function getGlowTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (glowTexture) return glowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.28)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

function hexToRgb(hex: string): [number, number, number] {
  const parsed = parseInt(hex.replace('#', ''), 16);
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, v));
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(test).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// An original, per-subject designed cover — the subject's own color (baked directly into the
// pixels, not left to the material's color-tint multiply, so title/icon contrast stays
// consistent regardless of how dark or light that color is), a fine grain for a cloth-hardcover
// feel, a debossed border, a hand-drawn icon (see subjectIcons.ts — original shapes, not scraped
// from a real book, which would raise a real copyright question baking someone else's cover
// art into the app as a shipped asset), and the subject name as the title.
//
// Deliberately NOT cached across calls (unlike the other textures in this file): useSubjectColor
// starts every subject at a shared fallback color and only resolves the real per-subject color
// a render later (see subjectVisuals.ts). A cache keyed on subjectCode would freeze in whatever
// color happened to be passed on the FIRST call — the fallback — and silently ignore the
// correction. useMemo below already prevents redundant regeneration per mounted instance, which
// is all the "caching" this actually needs (each subject only ever has one book instance).
function getCoverTexture(subjectCode: string, colorHex: string, label: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Base fill + grain, computed together in one pass (putImageData replaces pixels outright,
  // so the grain has to be mixed into the base color here rather than drawn as a separate
  // overlay afterward).
  const [baseR, baseG, baseB] = hexToRgb(colorHex);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const delta = Math.random() * 14 - 7;
    img.data[i] = clamp255(baseR + delta);
    img.data[i + 1] = clamp255(baseG + delta);
    img.data[i + 2] = clamp255(baseB + delta);
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // Everything from here on is normal canvas drawing, which composites on top of the pixel
  // buffer just written above.
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, size - 48, size - 48);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 2;
  ctx.strokeRect(32, 32, size - 64, size - 64);

  const icon = getSubjectIcon(subjectCode);
  if (icon) icon(ctx, size / 2, size * 0.32, size * 0.14);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 10;
  ctx.font = `bold ${size * 0.09}px Georgia, "Times New Roman", serif`;
  const lines = wrapText(ctx, label, size * 0.72);
  const lineHeight = size * 0.1;
  const titleCenterY = size * 0.6;
  lines.forEach((line, i) => {
    const y = titleCenterY - ((lines.length - 1) * lineHeight) / 2 + i * lineHeight;
    ctx.fillText(line, size / 2, y);
  });
  ctx.shadowBlur = 0;

  const ruleY = titleCenterY + (lines.length * lineHeight) / 2 + size * 0.05;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(size * 0.32, ruleY);
  ctx.lineTo(size * 0.68, ruleY);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = `${size * 0.035}px Georgia, "Times New Roman", serif`;
  ctx.fillText('FBISE', size / 2, ruleY + size * 0.05);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface SubjectBookHandle {
  book: THREE.Group;
  coverPivot: THREE.Group;
}

export type ExplorePhase = 'idle' | 'flying' | 'opening' | 'done';

interface SubjectBookProps {
  subjectCode: string;
  label: string;
  hasTextbook: boolean;
  orbitRadius: number;
  orbitSpeed: number;
  initialAngle: number;
  tiltX: number;
  tiltZ: number;
  reducedMotion: boolean;
  phase: ExplorePhase;
  isTarget: boolean;
  onRegister: (code: string, handle: SubjectBookHandle | null) => void;
  onClick: (code: string) => void;
}

export default function SubjectBook({
  subjectCode,
  label,
  hasTextbook,
  orbitRadius,
  orbitSpeed,
  initialAngle,
  tiltX,
  tiltZ,
  reducedMotion,
  phase,
  isTarget,
  onRegister,
  onClick,
}: SubjectBookProps) {
  const color = useSubjectColor(subjectCode);
  const spineColor = useMemo(() => new THREE.Color(color).multiplyScalar(0.72).getStyle(), [color]);
  const pageEdgeTex = useMemo(() => getPageEdgeTexture(), []);
  const glowTex = useMemo(() => getGlowTexture(), []);
  const coverTex = useMemo(() => getCoverTexture(subjectCode, color, label), [subjectCode, color, label]);

  const orbitRef = useRef<THREE.Group>(null);
  const bookRef = useRef<THREE.Group>(null);
  const coverPivotRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (bookRef.current && coverPivotRef.current) {
      onRegister(subjectCode, { book: bookRef.current, coverPivot: coverPivotRef.current });
    }
    return () => onRegister(subjectCode, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onRegister identity is stable from the parent (useCallback), only re-register on subject change
  }, [subjectCode]);

  useFrame((_, delta) => {
    if (!orbitRef.current) return;
    // Frozen once a flight targets any book (the whole scene settles), and under reduced motion.
    if (reducedMotion || phase !== 'idle') return;
    orbitRef.current.rotation.y += delta * orbitSpeed;
  });

  const canInteract = phase === 'idle';

  return (
    <group rotation={[tiltX, 0, tiltZ]}>
      <group ref={orbitRef} rotation-y={initialAngle}>
        <group position={[orbitRadius, 0, 0]}>
          <group
            ref={bookRef}
            scale={hovered && canInteract ? 1.08 : 1}
            onPointerOver={(e) => {
              if (!canInteract) return;
              e.stopPropagation();
              setHovered(true);
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              setHovered(false);
              document.body.style.cursor = 'auto';
            }}
            onClick={(e) => {
              if (!canInteract) return;
              e.stopPropagation();
              onClick(subjectCode);
            }}
          >
            {/* Soft colored glow pad — a real textbook's presence, without ever gating the
                click on it (every book stays clickable regardless). Replaces a harder ring
                outline, which read as visually confusable with the big orbit-path traces. */}
            {hasTextbook && glowTex && (
              <mesh geometry={glowGeometry} rotation-x={-Math.PI / 2} position={[0, -BOOK_HEIGHT / 2 - 0.05, 0]}>
                <meshBasicMaterial
                  map={glowTex}
                  color={color}
                  transparent
                  opacity={hovered ? 0.9 : 0.6}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            )}

            {/* Pages */}
            <mesh geometry={pagesGeometry}>
              <meshStandardMaterial color="#f4efe2" roughness={0.9} />
            </mesh>

            {/* Fore-edge strip — the "you can see many pages" detail, opposite the spine */}
            <mesh geometry={pageEdgeGeometry} position={[HALF_WIDTH * 0.94, 0, 0]}>
              <meshStandardMaterial map={pageEdgeTex ?? undefined} color={pageEdgeTex ? '#ffffff' : '#f4efe2'} roughness={0.85} />
            </mesh>

            {/* Spine highlight */}
            <mesh geometry={spineGeometry} position={[-HALF_WIDTH, 0, 0]}>
              <meshStandardMaterial color={spineColor} roughness={0.4} metalness={0.25} />
            </mesh>

            {/* Back cover — fixed, doesn't hinge. The subject color is baked into coverTex
                itself now (see getCoverTexture), so the material's own color stays neutral
                white — texture x color would otherwise double-tint it. */}
            <mesh geometry={coverGeometry} position={[0, 0, -(PAGE_THICKNESS / 2 + COVER_THICKNESS / 2)]}>
              <meshPhysicalMaterial
                map={coverTex ?? undefined}
                roughness={0.35}
                metalness={0.1}
                clearcoat={0.5}
                clearcoatRoughness={0.3}
              />
            </mesh>

            {/* Front cover — hinged open around the spine (left edge) via this pivot group */}
            <group ref={coverPivotRef} position={[-HALF_WIDTH, 0, PAGE_THICKNESS / 2 + COVER_THICKNESS / 2]}>
              <mesh geometry={coverGeometry} position={[HALF_WIDTH, 0, 0]}>
                <meshPhysicalMaterial
                  map={coverTex ?? undefined}
                  emissive={color}
                  emissiveIntensity={hovered && canInteract ? 0.5 : 0.06}
                  roughness={0.35}
                  metalness={0.1}
                  clearcoat={0.5}
                  clearcoatRoughness={0.3}
                />
              </mesh>
            </group>

            {(hovered || isTarget) && (
              <Html center distanceFactor={8} position={[0, BOOK_HEIGHT / 2 + 0.35, 0]} occlude={false}>
                <div className="pointer-events-none whitespace-nowrap rounded-full border border-border bg-surface/90 px-2.5 py-1 text-[11px] font-bold text-navy shadow-sm">
                  {label}
                </div>
              </Html>
            )}
          </group>
        </group>
      </group>
    </group>
  );
}
