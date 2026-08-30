import * as THREE from 'three';
import type { CameraMode, CameraRig } from '@sonic-gameworld/world-schema';
import type { CameraModeContext, CameraModeHandler } from './types.js';
import { OrbitMode } from './modes/orbit.js';
import { FollowMode } from './modes/follow.js';
import { ChaseMode } from './modes/chase.js';
import { DroneMode } from './modes/drone.js';
import { FirstPersonMode } from './modes/firstPerson.js';
import { ThirdPersonMode } from './modes/thirdPerson.js';
import { RailMode } from './modes/rail.js';
import { CraneMode } from './modes/crane.js';
import { AIDirectorMode } from './modes/aiDirector.js';
import { RTSMode } from './modes/rts.js';

const DEFAULT_PARAMS: CameraRig['params'] = {};

export interface TargetSample {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

/**
 * Owns the THREE.PerspectiveCamera and dispatches per-frame updates to the active CameraMode handler.
 * Tracks a resolved world-space target (position/quaternion/velocity) supplied by the engine each tick
 * so individual modes never need to know how entities are stored (instanced mesh vs. discrete GLB).
 */
export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  private mode: CameraMode = 'ORBIT';
  private params: CameraRig['params'] = DEFAULT_PARAMS;
  private keyframes: CameraRig['keyframes'] = [];
  private elapsed = 0;
  private handlers: Record<CameraMode, CameraModeHandler>;

  private prevTargetPos = new THREE.Vector3();
  private velocity = new THREE.Vector3();
  private hasPrevTarget = false;
  private focusOverride: THREE.Vector3 | null = null;

  constructor(aspect = 1) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 20000);
    this.camera.position.set(0, 40, 80);
    this.handlers = {
      ORBIT: new OrbitMode(),
      FOLLOW: new FollowMode(),
      CHASE: new ChaseMode(),
      DRONE: new DroneMode(),
      FIRST_PERSON: new FirstPersonMode(),
      THIRD_PERSON: new ThirdPersonMode(),
      RAIL: new RailMode(),
      CRANE: new CraneMode(),
      AI_DIRECTOR: new AIDirectorMode(),
      RTS: new RTSMode(),
    };
  }

  getMode(): CameraMode {
    return this.mode;
  }

  getParams(): CameraRig['params'] {
    return this.params;
  }

  /**
   * Direct access to a mode's handler instance, keyed by `CameraMode` — e.g.
   * `controller.getModeHandler('RTS')` to drive `RTSMode.pan()/zoom()/jumpTo()` from edge-pan,
   * click-drag and scroll-wheel input in `apps/player`, or `.getAnchor()`/`.getDistance()` for a
   * minimap viewport-rectangle overlay. Every other mode also has a handler here, but only RTS
   * currently exposes extra public methods beyond `reset`/`update`.
   */
  getModeHandler<T extends CameraModeHandler = CameraModeHandler>(mode: CameraMode): T {
    return this.handlers[mode] as T;
  }

  /** Overrides the resolved target with a fixed world-space point (used by `SpatialEngine.frame()`), independent of any tracked entity. Pass null to go back to following the tracked entity. */
  setFocusOverride(point: THREE.Vector3 | null): void {
    this.focusOverride = point ? point.clone() : null;
  }

  setMode(mode: CameraMode, params?: CameraRig['params'], keyframes?: CameraRig['keyframes'], initialSample?: TargetSample | null): void {
    this.mode = mode;
    this.params = params ?? {};
    this.keyframes = keyframes ?? [];
    this.elapsed = 0;
    this.hasPrevTarget = false;
    const targetPosition = this.focusOverride ?? initialSample?.position ?? new THREE.Vector3(0, 0, 0);
    const targetQuaternion = initialSample?.quaternion ?? new THREE.Quaternion();
    const ctx = this.buildContext(targetPosition, targetQuaternion, !!this.focusOverride || !!initialSample, 0, 1, 1);
    this.handlers[this.mode].reset(ctx);
  }

  setAspect(aspect: number): void {
    if (Number.isFinite(aspect) && aspect > 0) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
  }

  private buildContext(
    targetPosition: THREE.Vector3,
    targetQuaternion: THREE.Quaternion,
    hasTarget: boolean,
    dt: number,
    viewportWidth: number,
    viewportHeight: number,
  ): CameraModeContext {
    return {
      camera: this.camera,
      targetPosition,
      targetQuaternion,
      targetVelocity: this.velocity,
      hasTarget,
      params: this.params,
      keyframes: this.keyframes,
      dt,
      elapsed: this.elapsed,
      viewportWidth,
      viewportHeight,
    };
  }

  /** `sample` is null when nothing is tracked (world origin / identity orientation is used instead, unless a focus override is active). */
  update(dt: number, sample: TargetSample | null, viewportWidth: number, viewportHeight: number): void {
    const targetPosition = this.focusOverride ?? sample?.position ?? new THREE.Vector3(0, 0, 0);
    const targetQuaternion = sample?.quaternion ?? new THREE.Quaternion();
    const hasTarget = !!this.focusOverride || !!sample;

    if (this.hasPrevTarget && dt > 0) {
      this.velocity.copy(targetPosition).sub(this.prevTargetPos).divideScalar(dt);
    } else {
      this.velocity.set(0, 0, 0);
    }
    this.prevTargetPos.copy(targetPosition);
    this.hasPrevTarget = true;

    this.elapsed += dt;
    this.camera.fov = this.params.fov ?? this.camera.fov;
    this.camera.updateProjectionMatrix();

    const ctx = this.buildContext(targetPosition, targetQuaternion, hasTarget, dt, viewportWidth, viewportHeight);
    this.handlers[this.mode].update(ctx);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    /* PerspectiveCamera holds no disposable GPU resources */
  }
}
