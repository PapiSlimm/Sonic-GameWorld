import * as THREE from 'three';
import { dampVec3, dampingToLambda } from '../damping.js';
import type { CameraModeContext, CameraModeHandler } from '../types.js';

/**
 * A vertical boom/crane shot: slowly rises from ground level to `height` above the target while
 * gently orbiting, then holds — the classic "boss reveal" cinematic move.
 */
export class CraneMode implements CameraModeHandler {
  private desired = new THREE.Vector3();

  private riseFactor(ctx: CameraModeContext): number {
    const riseDurationS = (ctx.params as { riseDurationS?: number }).riseDurationS ?? 5;
    return Math.min(1, ctx.elapsed / Math.max(riseDurationS, 0.001));
  }

  private computeDesired(ctx: CameraModeContext): THREE.Vector3 {
    const distance = ctx.params.distance ?? 15;
    const height = ctx.params.height ?? 20;
    const orbitSpeed = (ctx.params as { orbitSpeed?: number }).orbitSpeed ?? 0.08;
    const rise = this.riseFactor(ctx);
    // ease-out cubic for the boom rise
    const eased = 1 - Math.pow(1 - rise, 3);
    const angle = ctx.elapsed * orbitSpeed;
    const currentHeight = 1.5 + (height - 1.5) * eased;
    const currentDistance = distance * (0.6 + 0.4 * eased);
    return this.desired.set(
      ctx.targetPosition.x + Math.sin(angle) * currentDistance,
      ctx.targetPosition.y + currentHeight,
      ctx.targetPosition.z + Math.cos(angle) * currentDistance,
    );
  }

  reset(ctx: CameraModeContext): void {
    ctx.camera.position.copy(this.computeDesired(ctx));
    ctx.camera.lookAt(ctx.targetPosition);
  }

  update(ctx: CameraModeContext): void {
    const desired = this.computeDesired(ctx);
    const lambda = dampingToLambda(ctx.params.damping, 3.5);
    dampVec3(ctx.camera.position, desired, lambda, ctx.dt);
    ctx.camera.lookAt(ctx.targetPosition);
    if (ctx.params.fov) ctx.camera.fov = ctx.params.fov;
  }
}
