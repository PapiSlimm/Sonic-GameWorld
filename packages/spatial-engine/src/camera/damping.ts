import * as THREE from 'three';

/**
 * Framerate-independent exponential damping ("smooth damp"): converges towards `target` at a rate
 * controlled by `lambda` regardless of `dt`. lambda is in units of 1/seconds — a `damping` param in
 * [0,1] (as stored on CameraRig.params) is converted via `dampingToLambda` below.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return current;
  const t = 1 - Math.exp(-lambda * dt);
  return current + (target - current) * t;
}

export function dampVec3(out: THREE.Vector3, target: THREE.Vector3, lambda: number, dt: number): THREE.Vector3 {
  out.x = damp(out.x, target.x, lambda, dt);
  out.y = damp(out.y, target.y, lambda, dt);
  out.z = damp(out.z, target.z, lambda, dt);
  return out;
}

/** Map a CameraRig `damping` (0..1, higher = snappier) to an exponential-decay lambda (1/s). */
export function dampingToLambda(damping: number | undefined, fallback = 4): number {
  const d = damping === undefined ? undefined : Math.min(1, Math.max(0, damping));
  if (d === undefined) return fallback;
  // 0 -> ~0.2 (very loose/floaty), 1 -> ~20 (snaps almost immediately)
  return 0.2 + d * 19.8;
}
