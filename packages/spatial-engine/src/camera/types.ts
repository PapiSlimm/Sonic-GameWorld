import * as THREE from 'three';
import type { CameraRig } from '@sonic-gameworld/world-schema';

export interface CameraModeContext {
  camera: THREE.PerspectiveCamera;
  /** World-space position of the tracked entity, or the world origin when nothing is tracked. */
  targetPosition: THREE.Vector3;
  /** Orientation of the tracked entity (identity when nothing is tracked / entity has none). */
  targetQuaternion: THREE.Quaternion;
  /** Approximate world-space velocity of the tracked entity (meters/second), from frame-to-frame deltas. */
  targetVelocity: THREE.Vector3;
  hasTarget: boolean;
  params: CameraRig['params'];
  keyframes: CameraRig['keyframes'];
  dt: number;
  /** Seconds since this mode was activated — resets on setCameraMode / reset(). */
  elapsed: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface CameraModeHandler {
  /** Called once when the mode is activated (or re-activated with new params). Seeds camera position to avoid a first-frame snap. */
  reset(ctx: CameraModeContext): void;
  /** Called every tick. Must be smooth/damped — no instant teleporting except in reset(). */
  update(ctx: CameraModeContext): void;
}

export const FORWARD = new THREE.Vector3(0, 0, 1);
export const UP = new THREE.Vector3(0, 1, 0);

export function entityForward(quat: THREE.Quaternion, out = new THREE.Vector3()): THREE.Vector3 {
  return out.copy(FORWARD).applyQuaternion(quat).normalize();
}
