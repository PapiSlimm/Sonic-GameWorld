import { describe, expect, it } from 'vitest';
import type { RTSMap } from '../types';
import { findPath } from './pathfinding';

function makeMap(gridWidth: number, gridDepth: number, cellSizeM = 10, blocked: [number, number][] = []): RTSMap {
  const occupancy = new Uint8Array(gridWidth * gridDepth);
  for (const [gx, gz] of blocked) occupancy[gz * gridWidth + gx] = 1;
  return { widthM: gridWidth * cellSizeM, depthM: gridDepth * cellSizeM, cellSizeM, gridWidth, gridDepth, occupancy };
}

describe('findPath', () => {
  it('finds a straight path across an empty grid', () => {
    const map = makeMap(20, 20);
    const path = findPath({ x: 5, y: 0, z: 5 }, { x: 195, y: 0, z: 5 }, map);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(0);
    const last = path![path!.length - 1]!;
    expect(last.x).toBeCloseTo(195, 0);
  });

  it('routes around a wall of obstacles', () => {
    const blocked: [number, number][] = [];
    for (let x = 0; x < 20; x++) if (x !== 10) blocked.push([x, 10]);
    // Wall across the whole grid except a gap at gx=10, forcing the path through it.
    const map = makeMap(20, 20, 10, blocked);

    const path = findPath({ x: 5, y: 0, z: 5 }, { x: 5, y: 0, z: 195 }, map);
    expect(path).not.toBeNull();
    // Every waypoint must land on a free cell.
    for (const p of path!) {
      const gx = Math.floor(p.x / 10);
      const gz = Math.floor(p.z / 10);
      expect(map.occupancy[gz * map.gridWidth + gx]).toBe(0);
    }
  });

  it('falls back to a direct-line path when genuinely unreachable but the target cell itself is free', () => {
    // Matches the reference exactly: when the search exhausts without reaching the target, but
    // the target's own cell isn't occupied, it returns a direct-line fallback rather than
    // stranding the unit with no path at all.
    const blocked: [number, number][] = [];
    for (let x = 0; x < 20; x++) blocked.push([x, 10]);
    const map = makeMap(20, 20, 10, blocked);

    const path = findPath({ x: 5, y: 0, z: 5 }, { x: 5, y: 0, z: 195 }, map);
    expect(path).toEqual([{ x: 5, y: 0, z: 195 }]);
  });

  it('returns null when the target cell itself is occupied', () => {
    const map = makeMap(20, 20, 10, [[15, 15]]);
    const path = findPath({ x: 5, y: 0, z: 5 }, { x: 155, y: 0, z: 155 }, map);
    expect(path).toBeNull();
  });

  it('returns null when start and target are in the same cell', () => {
    const map = makeMap(20, 20);
    const path = findPath({ x: 5, y: 0, z: 5 }, { x: 6, y: 0, z: 6 }, map);
    expect(path).toBeNull();
  });

  it('returns null for out-of-bounds start or target', () => {
    const map = makeMap(20, 20);
    expect(findPath({ x: -50, y: 0, z: 5 }, { x: 50, y: 0, z: 5 }, map)).toBeNull();
    expect(findPath({ x: 5, y: 0, z: 5 }, { x: 50000, y: 0, z: 5 }, map)).toBeNull();
  });

  it('is deterministic for the same inputs', () => {
    const map = makeMap(30, 30);
    const a = findPath({ x: 3, y: 0, z: 3 }, { x: 250, y: 0, z: 250 }, map);
    const b = findPath({ x: 3, y: 0, z: 3 }, { x: 250, y: 0, z: 250 }, map);
    expect(a).toEqual(b);
  });
});
