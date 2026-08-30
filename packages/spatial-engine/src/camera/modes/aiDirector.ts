import * as THREE from 'three';
import { dampVec3, dampingToLambda } from '../damping.js';
import type { CameraModeContext, CameraModeHandler } from '../types.js';

/**
 * A heuristic "smart" camera for AI-driven scenes: frames the tracked entity like FOLLOW, but widens
 * distance and lowers orbit speed when the target is moving fast (giving the player more visual
 * breathing room during combat/chases) and tightens back in when it's calm. Deterministic given
 * (targetPosition, targetVelocity, elapsed), so it's unit-testable without an actual AI provider.
 */
export class AIDirectorMode implements CameraModeHandler {
  private theta = 0;
  private desired = new THREE.Vector3();

  private computeDesired(ctx: CameraModeContext): THREE.Vector3 {
    const baseDistance = ctx.params.distance ?? 14;
    const baseHeight = ctx.params.height ?? 6;
    const speed = ctx.targetVelocity.length();
    const excitement = Math.min(1, speed / 8); // 0 = calm, 1 = fast/dangerous
    const distance = baseDistance * (1 + excitement * 0.8);
    const height = baseHeight * (1 + excitement * 0.5);
    const orbitSpeed = 0.05 * (1 - excitement * 0.6);
    this.theta += orbitSpeed * ctx.dt;
    return this.desired.set(
      ctx.targetPosition.x + Math.sin(this.theta) * distance,
      ctx.targetPosition.y + height,
      ctx.targetPosition.z + Math.cos(this.theta) * distance,
    );
  }

  reset(ctx: CameraModeContext): void {
    this.theta = 0;
    ctx.camera.position.copy(this.computeDesired(ctx));
    ctx.camera.lookAt(ctx.targetPosition);
  }

  update(ctx: CameraModeContext): void {
    const desired = this.computeDesired(ctx);
    const lambda = dampingToLambda(ctx.params.damping, 3);
    dampVec3(ctx.camera.position, desired, lambda, ctx.dt);
    ctx.camera.lookAt(ctx.targetPosition);
    if (ctx.params.fov) ctx.camera.fov = ctx.params.fov;
  }
}
