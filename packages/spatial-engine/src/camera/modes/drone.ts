import * as THREE from 'three';
import { interpolateKeyframes } from '../../engine/keyframes.js';
import { dampVec3, dampingToLambda } from '../damping.js';
import type { CameraModeContext, CameraModeHandler } from '../types.js';

/**
 * Free-flying aerial camera. When the rig has keyframes it flies the (looping) keyframe path;
 * otherwise it sweeps a wide, high-altitude circle above the target — useful for establishing shots
 * over a district with no explicit path authored yet.
 */
export class DroneMode implements CameraModeHandler {
  private desired = new THREE.Vector3();
  private lookAt = new THREE.Vector3();

  private computeSweep(ctx: CameraModeContext): { position: THREE.Vector3; lookAt: THREE.Vector3 } {
    const radius = ctx.params.distance ?? 250;
    const height = ctx.params.height ?? 180;
    const speed = (ctx.params as { sweepSpeed?: number }).sweepSpeed ?? 0.05;
    const angle = ctx.elapsed * speed;
    this.desired.set(
      ctx.targetPosition.x + Math.cos(angle) * radius,
      ctx.targetPosition.y + height,
      ctx.targetPosition.z + Math.sin(angle) * radius,
    );
    return { position: this.desired, lookAt: ctx.targetPosition };
  }

  reset(ctx: CameraModeContext): void {
    if (ctx.keyframes.length > 0) {
      const frame = interpolateKeyframes(ctx.keyframes, 0, true);
      if (frame) {
        ctx.camera.position.copy(frame.position);
        ctx.camera.quaternion.copy(frame.quaternion);
        ctx.camera.fov = frame.fov;
        return;
      }
    }
    const sweep = this.computeSweep(ctx);
    ctx.camera.position.copy(sweep.position);
    ctx.camera.lookAt(sweep.lookAt);
  }

  update(ctx: CameraModeContext): void {
    const lambda = dampingToLambda(ctx.params.damping, 2.5);
    if (ctx.keyframes.length > 0) {
      const frame = interpolateKeyframes(ctx.keyframes, ctx.elapsed, true);
      if (frame) {
        dampVec3(ctx.camera.position, frame.position, lambda, ctx.dt);
        ctx.camera.quaternion.slerp(frame.quaternion, Math.min(1, lambda * ctx.dt));
        ctx.camera.fov = frame.fov;
        return;
      }
    }
    const sweep = this.computeSweep(ctx);
    dampVec3(ctx.camera.position, sweep.position, lambda, ctx.dt);
    this.lookAt.copy(sweep.lookAt);
    ctx.camera.lookAt(this.lookAt);
    if (ctx.params.fov) ctx.camera.fov = ctx.params.fov;
  }
}
