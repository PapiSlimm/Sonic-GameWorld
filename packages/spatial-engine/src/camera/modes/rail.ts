import { interpolateKeyframes } from '../../engine/keyframes.js';
import type { CameraModeContext, CameraModeHandler } from '../types.js';

/**
 * Moves the camera along the rig's authored keyframe path (position/rotation/fov all interpolated),
 * looping when it reaches the end. Looks at the tracked entity when one is set, otherwise follows the
 * path's own authored orientation. With no keyframes it holds a static shot at the target.
 */
export class RailMode implements CameraModeHandler {
  reset(ctx: CameraModeContext): void {
    this.apply(ctx, 0);
  }

  update(ctx: CameraModeContext): void {
    this.apply(ctx, ctx.elapsed);
  }

  private apply(ctx: CameraModeContext, t: number): void {
    if (ctx.keyframes.length === 0) {
      const distance = ctx.params.distance ?? 20;
      ctx.camera.position.set(ctx.targetPosition.x, ctx.targetPosition.y + (ctx.params.height ?? 10), ctx.targetPosition.z + distance);
      ctx.camera.lookAt(ctx.targetPosition);
      return;
    }
    const frame = interpolateKeyframes(ctx.keyframes, t, true);
    if (!frame) return;
    ctx.camera.position.copy(frame.position);
    ctx.camera.fov = frame.fov;
    if (ctx.hasTarget) {
      ctx.camera.lookAt(ctx.targetPosition);
    } else {
      ctx.camera.quaternion.copy(frame.quaternion);
    }
  }
}
