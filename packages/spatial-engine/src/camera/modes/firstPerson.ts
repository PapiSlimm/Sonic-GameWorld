import * as THREE from 'three';
import { damp } from '../damping.js';
import type { CameraModeContext, CameraModeHandler } from '../types.js';

/** Camera rides at the tracked entity's eye height, using its orientation directly (near-zero rotational lag). */
export class FirstPersonMode implements CameraModeHandler {
  private eyeHeight(ctx: CameraModeContext): number {
    return (ctx.params as { eyeHeightM?: number }).eyeHeightM ?? ctx.params.height ?? 1.7;
  }

  reset(ctx: CameraModeContext): void {
    ctx.camera.position.copy(ctx.targetPosition).add(new THREE.Vector3(0, this.eyeHeight(ctx), 0));
    ctx.camera.quaternion.copy(ctx.targetQuaternion);
  }

  update(ctx: CameraModeContext): void {
    const eye = ctx.targetPosition.clone().add(new THREE.Vector3(0, this.eyeHeight(ctx), 0));
    // Minimal positional damping (handheld micro-smoothing); rotation follows the entity immediately —
    // first person should not feel laggy.
    ctx.camera.position.x = damp(ctx.camera.position.x, eye.x, 30, ctx.dt);
    ctx.camera.position.y = damp(ctx.camera.position.y, eye.y, 30, ctx.dt);
    ctx.camera.position.z = damp(ctx.camera.position.z, eye.z, 30, ctx.dt);
    ctx.camera.quaternion.copy(ctx.targetQuaternion);
    if (ctx.params.fov) ctx.camera.fov = ctx.params.fov;
  }
}
