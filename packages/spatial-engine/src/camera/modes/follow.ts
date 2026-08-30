import * as THREE from 'three';
import { dampVec3, dampingToLambda } from '../damping.js';
import { entityForward } from '../types.js';
import type { CameraModeContext, CameraModeHandler } from '../types.js';

/** Stays behind + above the tracked entity, offset opposite its facing direction. Smooth, cinematic-adventure feel. */
export class FollowMode implements CameraModeHandler {
  private desired = new THREE.Vector3();
  private forward = new THREE.Vector3();

  private computeDesired(ctx: CameraModeContext): THREE.Vector3 {
    const distance = ctx.params.distance ?? 8;
    const height = ctx.params.height ?? 3;
    entityForward(ctx.targetQuaternion, this.forward);
    return this.desired
      .copy(ctx.targetPosition)
      .addScaledVector(this.forward, -distance)
      .add(new THREE.Vector3(0, height, 0));
  }

  reset(ctx: CameraModeContext): void {
    ctx.camera.position.copy(this.computeDesired(ctx));
    ctx.camera.lookAt(ctx.targetPosition.clone().add(new THREE.Vector3(0, (ctx.params.height ?? 3) * 0.4, 0)));
  }

  update(ctx: CameraModeContext): void {
    const desired = this.computeDesired(ctx);
    const lambda = dampingToLambda(ctx.params.damping, 4);
    dampVec3(ctx.camera.position, desired, lambda, ctx.dt);
    const lookAt = ctx.targetPosition.clone().add(new THREE.Vector3(0, (ctx.params.height ?? 3) * 0.4, 0));
    ctx.camera.lookAt(lookAt);
    if (ctx.params.fov) ctx.camera.fov = ctx.params.fov;
  }
}
