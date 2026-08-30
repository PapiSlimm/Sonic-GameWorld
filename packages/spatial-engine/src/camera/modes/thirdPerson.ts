import * as THREE from 'three';
import { dampVec3, dampingToLambda } from '../damping.js';
import { entityForward, UP } from '../types.js';
import type { CameraModeContext, CameraModeHandler } from '../types.js';

/** Classic over-the-shoulder third person: close, slightly offset to the side, higher damping than FOLLOW. */
export class ThirdPersonMode implements CameraModeHandler {
  private desired = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();

  private computeDesired(ctx: CameraModeContext): THREE.Vector3 {
    const distance = ctx.params.distance ?? 4;
    const height = ctx.params.height ?? 1.8;
    const shoulder = (ctx.params as { shoulderOffsetM?: number }).shoulderOffsetM ?? 0.6;
    entityForward(ctx.targetQuaternion, this.forward);
    this.right.crossVectors(this.forward, UP).normalize();
    return this.desired
      .copy(ctx.targetPosition)
      .addScaledVector(this.forward, -distance)
      .addScaledVector(this.right, shoulder)
      .add(new THREE.Vector3(0, height, 0));
  }

  reset(ctx: CameraModeContext): void {
    ctx.camera.position.copy(this.computeDesired(ctx));
    ctx.camera.lookAt(ctx.targetPosition.clone().add(new THREE.Vector3(0, 1.2, 0)));
  }

  update(ctx: CameraModeContext): void {
    const desired = this.computeDesired(ctx);
    const lambda = dampingToLambda(ctx.params.damping, 6);
    dampVec3(ctx.camera.position, desired, lambda, ctx.dt);
    ctx.camera.lookAt(ctx.targetPosition.clone().add(new THREE.Vector3(0, 1.2, 0)));
    if (ctx.params.fov) ctx.camera.fov = ctx.params.fov;
  }
}
