/**
 * Pure, framework-free math for the play-page minimap: projects world-space (X/Z, top-down —
 * Y/height is ignored) positions onto a 2D canvas. Kept dependency-free and side-effect-free so
 * it is trivial to unit test (see projection.test.ts) independently of Canvas 2D / three.js.
 */

export interface MinimapBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface MinimapSize {
  width: number;
  height: number;
  /** Inset in pixels applied on every edge before mapping, default 0. */
  padding?: number;
}

export interface WorldPoint {
  x: number;
  z: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Derive minimap bounds from a `WorldDocument.bounds` (`{ min: Vec3, max: Vec3 }`). */
export function boundsFromWorldBounds(bounds: { min: { x: number; z: number }; max: { x: number; z: number } }): MinimapBounds {
  return { minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z };
}

/** Clamp a value into [lo, hi], tolerating lo > hi by swapping. */
function clamp(v: number, lo: number, hi: number): number {
  const [min, max] = lo <= hi ? [lo, hi] : [hi, lo];
  return Math.min(max, Math.max(min, v));
}

/**
 * Project a world-space X/Z point onto the minimap canvas.
 *
 * Conventions:
 * - World +X maps to screen +X (right).
 * - World +Z ("forward" in the spatial-engine/world-schema convention) maps to screen -Y (up),
 *   matching a standard top-down minimap where "forward" is drawn toward the top of the canvas.
 * - Degenerate bounds (zero-width/height span, e.g. a single-entity world) fall back to the
 *   center of the canvas instead of dividing by zero.
 * - The result is NOT clamped to the canvas by default — callers who want off-map markers
 *   pinned to the edge should use `projectAndClampToMinimap`.
 */
export function projectToMinimap(point: WorldPoint, bounds: MinimapBounds, size: MinimapSize): ScreenPoint {
  const padding = size.padding ?? 0;
  const innerW = Math.max(0, size.width - padding * 2);
  const innerH = Math.max(0, size.height - padding * 2);

  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;

  const nx = spanX === 0 ? 0.5 : (point.x - bounds.minX) / spanX;
  const nz = spanZ === 0 ? 0.5 : (point.z - bounds.minZ) / spanZ;

  return {
    x: padding + nx * innerW,
    y: padding + (1 - nz) * innerH,
  };
}

/** Same as `projectToMinimap`, but clamps the result to stay within the canvas rectangle. */
export function projectAndClampToMinimap(point: WorldPoint, bounds: MinimapBounds, size: MinimapSize): ScreenPoint {
  const p = projectToMinimap(point, bounds, size);
  const padding = size.padding ?? 0;
  return {
    x: clamp(p.x, padding, size.width - padding),
    y: clamp(p.y, padding, size.height - padding),
  };
}

/**
 * Convert a yaw angle (radians, 0 = facing world +Z / "forward", increasing counter-clockwise
 * around +Y as in three.js) into a screen-space angle (radians, 0 = pointing right/+X,
 * increasing clockwise as in Canvas 2D) suitable for drawing a rotated heading indicator.
 */
export function headingToMinimapAngle(yawRadians: number): number {
  return Math.PI / 2 - yawRadians;
}
