import { describe, expect, it } from 'vitest';
import { boundsFromWorldBounds, headingToMinimapAngle, projectAndClampToMinimap, projectToMinimap, type MinimapBounds } from './projection.js';

const BOUNDS: MinimapBounds = { minX: -100, maxX: 100, minZ: -50, maxZ: 50 };
const SIZE = { width: 200, height: 100 };

describe('projectToMinimap', () => {
  it('maps the center of the world bounds to the center of the canvas', () => {
    expect(projectToMinimap({ x: 0, z: 0 }, BOUNDS, SIZE)).toEqual({ x: 100, y: 50 });
  });

  it('maps the min corner to the bottom-left of the canvas (world +Z is drawn toward the top)', () => {
    expect(projectToMinimap({ x: -100, z: -50 }, BOUNDS, SIZE)).toEqual({ x: 0, y: 100 });
  });

  it('maps the max corner to the top-right of the canvas', () => {
    expect(projectToMinimap({ x: 100, z: 50 }, BOUNDS, SIZE)).toEqual({ x: 200, y: 0 });
  });

  it('respects padding by insetting the mapped range on every edge', () => {
    const padded = { ...SIZE, padding: 10 };
    expect(projectToMinimap({ x: -100, z: -50 }, BOUNDS, padded)).toEqual({ x: 10, y: 90 });
    expect(projectToMinimap({ x: 100, z: 50 }, BOUNDS, padded)).toEqual({ x: 190, y: 10 });
    expect(projectToMinimap({ x: 0, z: 0 }, BOUNDS, padded)).toEqual({ x: 100, y: 50 });
  });

  it('falls back to the canvas center on a degenerate (zero-span) axis instead of dividing by zero', () => {
    const pointBounds: MinimapBounds = { minX: 5, maxX: 5, minZ: -50, maxZ: 50 };
    const result = projectToMinimap({ x: 5, z: 25 }, pointBounds, SIZE);
    expect(result.x).toBe(100); // width/2, degenerate X axis
    expect(Number.isFinite(result.y)).toBe(true);
  });

  it('extrapolates linearly for points outside the bounds (no implicit clamping)', () => {
    const result = projectToMinimap({ x: 200, z: 0 }, BOUNDS, SIZE);
    expect(result.x).toBe(300);
  });

  it('is linear/monotonic along X between the two corners', () => {
    const left = projectToMinimap({ x: -100, z: 0 }, BOUNDS, SIZE);
    const mid = projectToMinimap({ x: 0, z: 0 }, BOUNDS, SIZE);
    const right = projectToMinimap({ x: 100, z: 0 }, BOUNDS, SIZE);
    expect(left.x).toBeLessThan(mid.x);
    expect(mid.x).toBeLessThan(right.x);
  });
});

describe('projectAndClampToMinimap', () => {
  it('clamps out-of-bounds points to the canvas edge', () => {
    expect(projectAndClampToMinimap({ x: 1000, z: 0 }, BOUNDS, SIZE)).toEqual({ x: 200, y: 50 });
    expect(projectAndClampToMinimap({ x: -1000, z: 0 }, BOUNDS, SIZE)).toEqual({ x: 0, y: 50 });
  });

  it('clamps to the padded edge when padding is set', () => {
    const padded = { ...SIZE, padding: 8 };
    expect(projectAndClampToMinimap({ x: -1000, z: 1000 }, BOUNDS, padded)).toEqual({ x: 8, y: 8 });
  });

  it('leaves in-bounds points untouched', () => {
    expect(projectAndClampToMinimap({ x: 0, z: 0 }, BOUNDS, SIZE)).toEqual({ x: 100, y: 50 });
  });
});

describe('boundsFromWorldBounds', () => {
  it('extracts the X/Z plane from a WorldDocument-shaped bounds object, ignoring Y', () => {
    const bounds = boundsFromWorldBounds({ min: { x: -800, y: -10, z: -800 } as never, max: { x: 800, y: 300, z: 800 } as never });
    expect(bounds).toEqual({ minX: -800, maxX: 800, minZ: -800, maxZ: 800 });
  });
});

describe('headingToMinimapAngle', () => {
  it('maps yaw 0 (facing world +Z / "up" on the minimap) to screen angle -90deg (pointing up)', () => {
    expect(headingToMinimapAngle(0)).toBeCloseTo(Math.PI / 2);
  });

  it('maps a quarter turn to a quarter turn in screen space', () => {
    expect(headingToMinimapAngle(Math.PI / 2)).toBeCloseTo(0);
  });
});
