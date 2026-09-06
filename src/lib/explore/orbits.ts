import * as THREE from 'three';

// Shared orbital mechanics for /explore. Both the book (SubjectBook) and the trail it drags
// behind it (CometTrail) read from here, so the drawn path and the travelled path can never
// drift apart — previously each drew its own circle and agreed only because both were circles.
//
// These are real ellipses swept at a real variable rate, not a carousel: a book visibly
// accelerates through periapsis and coasts through apoapsis. That motion is most of what makes
// the scene read as a system rather than a turntable, and it costs a few lines of algebra.

export interface OrbitParams {
  /** Semi-major axis — the orbit's "size". */
  semiMajor: number;
  /** 0 = circle. Kept modest so wide orbits don't swing books off-screen. */
  eccentricity: number;
  /** Tilt of the orbital plane, radians. */
  inclination: number;
  /** Rotation of that tilted plane about Y, radians — spreads the planes apart. */
  ascendingNode: number;
  /** Specific angular momentum. Sets the sweep rate; see advance(). */
  angularMomentum: number;
  /** Starting true anomaly, radians. */
  phase: number;
}

const GOLDEN_ANGLE = 2.399963; // spreads N bodies around the system with minimal overlap
const BASE_SEMI_MAJOR = 3.6;
const SEMI_MAJOR_STEP = 1.35;
const SPEED_SCALE = 0.22;

/** Deterministic per-index orbit. Index order is stable (enrolled subject order), so a given
 *  subject always occupies the same orbit between renders and reloads. */
export function orbitParamsFor(index: number): OrbitParams {
  const semiMajor = BASE_SEMI_MAJOR + index * SEMI_MAJOR_STEP;

  return {
    semiMajor,
    // Alternating, gently increasing — enough that the ellipse is legible against its
    // neighbours without any orbit crossing another.
    eccentricity: 0.08 + (index % 3) * 0.05,
    inclination: ((index % 5) - 2) * 0.13,
    ascendingNode: index * GOLDEN_ANGLE * 0.5,
    // Kepler's third law falls out of this: for a circle, dθ/dt = h/a² = SPEED_SCALE/√a, so
    // outer bodies orbit slower exactly as they should — and it preserves the pacing the
    // previous circular version was tuned to.
    angularMomentum: SPEED_SCALE * Math.pow(semiMajor, 1.5),
    phase: index * GOLDEN_ANGLE,
  };
}

/** Orbital radius at a given true anomaly — the polar form of an ellipse with the focus (the
 *  planet) at the origin, which is why the planet sits off-centre inside each trail. */
export function radiusAt(params: OrbitParams, trueAnomaly: number): number {
  const { semiMajor: a, eccentricity: e } = params;
  return (a * (1 - e * e)) / (1 + e * Math.cos(trueAnomaly));
}

/** World position at a given true anomaly, written into `out` (never allocates — this runs
 *  per-book per-frame). */
export function positionAt(params: OrbitParams, trueAnomaly: number, out: THREE.Vector3): THREE.Vector3 {
  const r = radiusAt(params, trueAnomaly);

  // In the orbital plane first.
  const x = r * Math.cos(trueAnomaly);
  const z = r * Math.sin(trueAnomaly);

  // Tilt the plane (about X), then swing the tilted plane about Y. Done by hand rather than
  // with Matrix4/Euler objects so this stays allocation-free in the frame loop.
  const cosI = Math.cos(params.inclination);
  const sinI = Math.sin(params.inclination);
  const y1 = -z * sinI;
  const z1 = z * cosI;

  const cosN = Math.cos(params.ascendingNode);
  const sinN = Math.sin(params.ascendingNode);

  return out.set(x * cosN + z1 * sinN, y1, -x * sinN + z1 * cosN);
}

/** Advance the true anomaly by `delta` seconds.
 *
 *  dθ/dt = h / r² is Kepler's second law (equal areas in equal times) stated directly — no
 *  iterative solve of Kepler's equation needed, because we integrate the anomaly forward each
 *  frame rather than evaluating it from an absolute epoch. This is what produces the visible
 *  speed-up at periapsis. */
export function advance(params: OrbitParams, trueAnomaly: number, delta: number): number {
  const r = radiusAt(params, trueAnomaly);
  return trueAnomaly + (params.angularMomentum / (r * r)) * delta;
}

/** Farthest any body gets from the planet — used to frame the camera and size the starfield. */
export function apoapsisOf(params: OrbitParams): number {
  return params.semiMajor * (1 + params.eccentricity);
}
