import { describe, expect, it } from 'vitest';
import { makeUnit } from '../testFixtures';
import { buildSpatialGridForUnits, SpatialGrid } from './spatialGrid';

describe('SpatialGrid', () => {
  it('finds inserted ids within radius', () => {
    const grid = new SpatialGrid(100);
    grid.insert('a', 10, 10);
    grid.insert('b', 500, 500);

    const nearby = grid.getNearby(10, 10, 50);
    expect(nearby).toContain('a');
    expect(nearby).not.toContain('b');
  });

  it('finds ids across adjacent cells within radius', () => {
    const grid = new SpatialGrid(100);
    grid.insert('edge', 99, 99); // cell (0,0)
    const nearby = grid.getNearby(101, 101, 20); // querying from cell (1,1)
    expect(nearby).toContain('edge');
  });

  it('clear() empties the grid', () => {
    const grid = new SpatialGrid(100);
    grid.insert('a', 10, 10);
    grid.clear();
    expect(grid.getNearby(10, 10, 100)).toEqual([]);
  });

  it('returns no matches beyond radius', () => {
    const grid = new SpatialGrid(100);
    grid.insert('far', 10000, 10000);
    expect(grid.getNearby(0, 0, 50)).toEqual([]);
  });
});

describe('buildSpatialGridForUnits', () => {
  it('excludes dead units', () => {
    const alive = makeUnit({ factionId: 'f1', transform: { position: { x: 5, y: 0, z: 5 }, rotationY: 0 } });
    const dead = makeUnit({ factionId: 'f1', state: 'DEAD', transform: { position: { x: 5, y: 0, z: 5 }, rotationY: 0 } });

    const grid = buildSpatialGridForUnits([alive, dead]);
    const nearby = grid.getNearby(5, 5, 10);

    expect(nearby).toContain(alive.id);
    expect(nearby).not.toContain(dead.id);
  });
});
