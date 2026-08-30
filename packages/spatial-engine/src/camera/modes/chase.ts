import * as THREE from 'three';
import { dampVec3, dampingToLambda } from '../damping.js';
import { entityForward } from '../types.js';
import type { CameraModeContext, CameraModeHandler } from '../types.js';

/**
 * A tight, fast-reacting chase cam (vehicles, combat): sits behind the entity's direction of *travel*
 * (falling back to facing direction when nearly stationary), closer and lower than FOLLOW, with a
 * forward look-ahead so the camera leads slightly into turns.
 */
export class ChaseMode implements CameraModeHandler {
  private desired = new THREE.Vector3();
  private behind = new THREE.Vector3();

  private computeDesired(ctx: CameraModeContext): THREE.Vector3 {
    const distance = ctx.params.distance ?? 6;
    const height = ctx.params.height ?? 2;
    const speed = ctx.targetVelocity.length();
    if (speed > 0.5) {
      this.behind.copy(ctx.targetVelocity).normalize();
    } else {
      entityForward(ctx.targetQuaternion, this.behind);
    }
    return this.desired
      .copy(ctx.targetPosition)
      .addScaledVector(this.behind, -distance)
      .add(new THREE.Vector3(0, height, 0));
  }

  reset(ctx: CameraModeContext): void {
    ctx.camera.position.copy(this.computeDesired(ctx));
    ctx.camera.lookAt(ctx.targetPosition);
  }

  update(ctx: CameraModeContext): void {
    const desired = this.computeDesired(ctx);
    const lambda = dampingToLambda(ctx.params.damping, 8);
    dampVec3(ctx.camera.position, desired, lambda, ctx.dt);
    const lookAhead = ctx.targetPosition.clone().addScaledVector(ctx.targetVelocity, 0.35);
    ctx.camera.lookAt(lookAhead);
    if (ctx.params.fov) ctx.camera.fov = ctx.params.fov;
  }
}
