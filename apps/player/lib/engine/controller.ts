/**
 * Minimal, framework-free THIRD_PERSON player controller: pure input → movement-vector →
 * physics-integration math, with no dependency on React, Three.js, or `SpatialEngine` itself.
 * `PlayViewport.tsx` is what wires this into `@sonic-gameworld/spatial-engine`'s real
 * `SpatialEngine` class (§11) — calling `spawn()`/`move()` with the transforms computed here —
 * so keeping it dependency-free is what makes it trivial to unit test in isolation
 * (see `controller.test.ts`).
 */

export type MoveKey = 'KeyW' | 'KeyA' | 'KeyS' | 'KeyD' | 'ArrowUp' | 'ArrowLeft' | 'ArrowDown' | 'ArrowRight';

export interface KeyState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
}

export const EMPTY_KEY_STATE: KeyState = { forward: false, back: false, left: false, right: false };

/** Map a `KeyboardEvent.code` to the WASD/arrow-key axis it drives, or `null` if irrelevant. */
export function keyToAxis(code: string): keyof KeyState | null {
  switch (code as MoveKey) {
    case 'KeyW':
    case 'ArrowUp':
      return 'forward';
    case 'KeyS':
    case 'ArrowDown':
      return 'back';
    case 'KeyA':
    case 'ArrowLeft':
      return 'left';
    case 'KeyD':
    case 'ArrowRight':
      return 'right';
    default:
      return null;
  }
}

export interface Vec2 {
  x: number;
  z: number;
}

/** World-space (X/Z), camera-relative-yaw movement vector for the current key state. Normalized. */
export function movementVector(keys: KeyState, cameraYaw: number): Vec2 {
  let fwd = 0;
  let strafe = 0;
  if (keys.forward) fwd += 1;
  if (keys.back) fwd -= 1;
  if (keys.right) strafe += 1;
  if (keys.left) strafe -= 1;

  if (fwd === 0 && strafe === 0) return { x: 0, z: 0 };

  // Forward = camera's look direction projected onto the ground plane; strafe = perpendicular.
  const sinY = Math.sin(cameraYaw);
  const cosY = Math.cos(cameraYaw);
  let x = fwd * sinY + strafe * cosY;
  let z = fwd * cosY - strafe * sinY;

  const len = Math.hypot(x, z);
  if (len > 0) {
    x /= len;
    z /= len;
  }
  return { x, z };
}

export interface PlayerPhysicsState {
  position: Vec2;
  yaw: number;
}

export interface WorldBounds2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Integrate one physics step of THIRD_PERSON movement: moves the player along `move` at
 * `speed` m/s for `dt` seconds, turns to face the movement direction, and clamps to the
 * world's playable bounds (with a small margin) so the player can't walk off the map.
 */
export function integrateMovement(state: PlayerPhysicsState, move: Vec2, speed: number, dt: number, bounds: WorldBounds2D, margin = 4): PlayerPhysicsState {
  if (move.x === 0 && move.z === 0) return state;
  const dx = move.x * speed * dt;
  const dz = move.z * speed * dt;
  const nextX = clamp(state.position.x + dx, bounds.minX + margin, bounds.maxX - margin);
  const nextZ = clamp(state.position.z + dz, bounds.minZ + margin, bounds.maxZ - margin);
  const yaw = Math.atan2(move.x, move.z);
  return { position: { x: nextX, z: nextZ }, yaw };
}

export interface ThirdPersonCameraParams {
  distance: number;
  height: number;
  /** 0..1, exponential smoothing factor applied per call (higher = snappier). */
  damping: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Desired THIRD_PERSON camera position: behind and above the player, looking toward them. */
export function thirdPersonCameraTarget(playerPos: Vec2, playerYaw: number, params: ThirdPersonCameraParams): Vec3Like {
  return {
    x: playerPos.x - Math.sin(playerYaw) * params.distance,
    y: params.height,
    z: playerPos.z - Math.cos(playerYaw) * params.distance,
  };
}

/** Exponential damping toward a target scalar — frame-rate independent given a stable dt. */
export function damp(current: number, target: number, damping: number, dt: number): number {
  const t = 1 - Math.exp(-damping * dt * 60);
  return current + (target - current) * clamp(t, 0, 1);
}
