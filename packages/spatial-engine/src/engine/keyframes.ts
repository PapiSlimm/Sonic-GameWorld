import * as THREE from 'three';
import type { CameraKeyframe, Transform } from '@sonic-gameworld/world-schema';

export interface InterpolatedFrame {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  fov: number;
}

function transformToVecs(t: Transform): { pos: THREE.Vector3; quat: THREE.Quaternion } {
  return {
    pos: new THREE.Vector3(t.position.x, t.position.y, t.position.z),
    quat: new THREE.Quaternion(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w),
  };
}

/**
 * Interpolates a `CameraRig.keyframes` timeline at time `t` (seconds). Linear position/fov lerp +
 * spherical quaternion interpolation between the two bracketing keyframes. `loop:true` wraps `t`
 * into `[0, duration]`; otherwise `t` is clamped to the timeline's ends.
 */
export function interpolateKeyframes(keyframes: CameraKeyframe[], t: number, loop = true): InterpolatedFrame | null {
  if (keyframes.length === 0) return null;
  if (keyframes.length === 1) {
    const first = keyframes[0];
    if (!first) return null;
    const { pos, quat } = transformToVecs(first.transform);
    return { position: pos, quaternion: quat, fov: first.fov };
  }
  const sorted = [...keyframes].sort((a, b) => a.t - b.t);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;
  const duration = Math.max(last.t - first.t, 1e-6);
  let localT = loop ? first.t + (((t - first.t) % duration) + duration) % duration : Math.min(Math.max(t, first.t), last.t);

  let a = sorted[0];
  let b = sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (!cur || !next) continue;
    if (localT >= cur.t && localT <= next.t) {
      a = cur;
      b = next;
      break;
    }
  }
  if (!a || !b) return null;
  const span = Math.max(b.t - a.t, 1e-6);
  const alpha = Math.min(Math.max((localT - a.t) / span, 0), 1);

  const av = transformToVecs(a.transform);
  const bv = transformToVecs(b.transform);
  const position = av.pos.clone().lerp(bv.pos, alpha);
  const quaternion = av.quat.clone().slerp(bv.quat, alpha);
  const fov = a.fov + (b.fov - a.fov) * alpha;
  return { position, quaternion, fov };
}
