import * as THREE from 'three';
import { dampVec3, dampingToLambda } from '../damping.js';
import type { CameraModeContext, CameraModeHandler } from '../types.js';

/** Orbits the target at a fixed distance/height, auto-rotating slowly around the vertical axis. */
export class OrbitMode implements CameraModeHandler {
  private theta = 0;
  private desired = new THREE.Vector3();

  reset(ctx: CameraModeContext): void {
    this.theta = 0;
    this.desired.copy(this.computeDesired(ctx));
    ctx.camera.position.copy(this.desired);
    ctx.camera.lookAt(ctx.targetPosition);
  }

  private computeDesired(ctx: CameraModeContext): THREE.Vector3 {
    const distance = ctx.params.distance ?? 25;
    const height = ctx.params.height ?? 12;
    return new THREE.Vector3(
      ctx.targetPosition.x + Math.sin(this.theta) * distance,
      ctx.targetPosition.y + height,
      ctx.targetPosition.z + Math.cos(this.theta) * distance,
    );
  }

  update(ctx: CameraModeContext): void {
    const rotateSpeed = (ctx.params as { rotateSpeed?: number }).rotateSpeed ?? 0.15;
    this.theta += rotateSpeed * ctx.dt;
    this.desired.copy(this.computeDesired(ctx));
    const lambda = dampingToLambda(ctx.params.damping, 3);
    dampVec3(ctx.camera.position, this.desired, lambda, ctx.dt);
    ctx.camera.lookAt(ctx.targetPosition);
    if (ctx.params.fov) ctx.camera.fov = ctx.params.fov;
  }
}
