import * as THREE from 'three';
import { dampVec3, dampingToLambda } from '../damping.js';
import type { CameraModeContext, CameraModeHandler } from '../types.js';

const DEFAULT_PITCH_DEG = 58;
const DEFAULT_MIN_DISTANCE_M = 40;
const DEFAULT_MAX_DISTANCE_M = 420;
const DEFAULT_DISTANCE_M = 150;

export interface RTSModeParams {
  /** Elevation angle (degrees) above the ground plane the camera looks down at. 90 = straight top-down. Default 58. */
  pitchDeg?: number;
  /** Closest the camera may zoom in to the anchor (meters). Default 40. */
  minDistanceM?: number;
  /** Farthest the camera may zoom out from the anchor (meters). Default 420. */
  maxDistanceM?: number;
}

/**
 * Fixed-pitch overhead strategic camera for the RTS game template (docs/RTS-CONTRACTS.md §6).
 *
 * Unlike every other mode in this file, RTS play doesn't "track" a single entity the way
 * FOLLOW/CHASE/ORBIT do — the player pans a free-floating ground anchor point (edge-pan or
 * click-drag) and zooms in/out (scroll wheel) independently of any unit. So this mode owns its
 * own anchor + distance state (mutated via `pan`/`jumpTo`/`zoom`, called by the input-handling
 * layer in `apps/player`) instead of reading `ctx.targetPosition` every frame the way a
 * unit-tracking mode would. `reset()` still seeds the anchor from `ctx.targetPosition` when a
 * target is supplied (e.g. framing a starting base on session start), matching the interface's
 * "seed camera position to avoid a first-frame snap" contract.
 *
 * Deliberately does not orbit (no yaw rotation) or roll — the camera always looks the same
 * direction (north, -Z), only the anchor (pan) and distance (zoom) change, per the contract's
 * "no orbit/roll" requirement.
 */
export class RTSMode implements CameraModeHandler {
  private anchor = new THREE.Vector3(0, 0, 0);
  private distance: number;
  private desired = new THREE.Vector3();

  constructor(initialDistanceM = DEFAULT_DISTANCE_M) {
    this.distance = initialDistanceM;
  }

  private bounds(ctx: CameraModeContext): { min: number; max: number; pitchRad: number } {
    const p = ctx.params as RTSModeParams;
    const min = p.minDistanceM ?? DEFAULT_MIN_DISTANCE_M;
    const max = p.maxDistanceM ?? DEFAULT_MAX_DISTANCE_M;
    const pitchDeg = p.pitchDeg ?? DEFAULT_PITCH_DEG;
    return { min, max: Math.max(max, min), pitchRad: (pitchDeg * Math.PI) / 180 };
  }

  /** Pans the anchor in world-space meters (XZ plane — no vertical pan). Drives edge-pan/click-drag input. */
  pan(dxM: number, dzM: number): void {
    this.anchor.x += dxM;
    this.anchor.z += dzM;
  }

  /** Snaps the anchor to a world XZ point — e.g. minimap click-to-jump. */
  jumpTo(x: number, z: number): void {
    this.anchor.set(x, 0, z);
  }

  /** Zooms by `deltaM` (positive = zoom out, negative = zoom in), clamped to the mode's bounds. Drives scroll-wheel input. */
  zoom(deltaM: number, ctx: CameraModeContext): void {
    const { min, max } = this.bounds(ctx);
    this.distance = Math.min(max, Math.max(min, this.distance + deltaM));
  }

  /** Current pan anchor (world-space XZ), e.g. for a minimap viewport-rectangle overlay. */
  getAnchor(): { x: number; z: number } {
    return { x: this.anchor.x, z: this.anchor.z };
  }

  /** Current zoom distance (meters from the anchor). */
  getDistance(): number {
    return this.distance;
  }

  private computeDesired(ctx: CameraModeContext): THREE.Vector3 {
    const { min, max, pitchRad } = this.bounds(ctx);
    this.distance = Math.min(max, Math.max(min, this.distance));
    const horizontal = Math.cos(pitchRad) * this.distance;
    const vertical = Math.sin(pitchRad) * this.distance;
    return this.desired.set(this.anchor.x, this.anchor.y + vertical, this.anchor.z + horizontal);
  }

  reset(ctx: CameraModeContext): void {
    if (ctx.hasTarget) this.anchor.set(ctx.targetPosition.x, 0, ctx.targetPosition.z);
    if (typeof ctx.params.distance === 'number') this.distance = ctx.params.distance;
    const pos = this.computeDesired(ctx);
    ctx.camera.position.copy(pos);
    ctx.camera.lookAt(this.anchor);
    if (ctx.params.fov) ctx.camera.fov = ctx.params.fov;
  }

  update(ctx: CameraModeContext): void {
    const desired = this.computeDesired(ctx);
    const lambda = dampingToLambda(ctx.params.damping, 8);
    dampVec3(ctx.camera.position, desired, lambda, ctx.dt);
    ctx.camera.lookAt(this.anchor);
    if (ctx.params.fov) ctx.camera.fov = ctx.params.fov;
  }
}
