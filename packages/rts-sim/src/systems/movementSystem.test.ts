import { describe, expect, it } from 'vitest';
import { FACTION_A, makeMatch, makeUnit } from '../testFixtures';
import { movementSystem } from './movementSystem';
import { buildSpatialGridForUnits } from './spatialGrid';

describe('movementSystem', () => {
  it('moves a unit along its path toward the next waypoint', () => {
    const state = makeMatch();
    const unit = makeUnit({
      factionId: FACTION_A,
      transform: { position: { x: 10, y: 0, z: 10 }, rotationY: 0 },
      path: [{ x: 200, y: 0, z: 10 }],
    });
    state.entities.units.push(unit);

    const startX = unit.transform.position.x;
    for (let i = 0; i < 10; i++) {
      const grid = buildSpatialGridForUnits(state.entities.units);
      movementSystem(state, 0.1, grid);
    }

    expect(unit.transform.position.x).toBeGreaterThan(startX);
  });

  it('pops the waypoint and MOVE command, and goes IDLE on arrival', () => {
    const state = makeMatch();
    const unit = makeUnit({
      factionId: FACTION_A,
      transform: { position: { x: 100, y: 0, z: 100 }, rotationY: 0 },
      path: [{ x: 101, y: 0, z: 100 }],
      commands: [{ type: 'MOVE', targetPos: { x: 101, y: 0, z: 100 } }],
      state: 'MOVING',
    });
    state.entities.units.push(unit);

    const grid = buildSpatialGridForUnits(state.entities.units);
    movementSystem(state, 0.1, grid);

    expect(unit.path).toEqual([]);
    expect(unit.commands).toEqual([]);
    expect(unit.state).toBe('IDLE');
  });

  it('never moves a dead unit', () => {
    const state = makeMatch();
    const unit = makeUnit({
      factionId: FACTION_A,
      state: 'DEAD',
      transform: { position: { x: 10, y: 0, z: 10 }, rotationY: 0 },
      path: [{ x: 200, y: 0, z: 10 }],
    });
    state.entities.units.push(unit);

    const grid = buildSpatialGridForUnits(state.entities.units);
    movementSystem(state, 0.1, grid);

    expect(unit.transform.position).toEqual({ x: 10, y: 0, z: 10 });
  });

  it('never moves a possessed unit', () => {
    const state = makeMatch();
    const unit = makeUnit({
      factionId: FACTION_A,
      transform: { position: { x: 10, y: 0, z: 10 }, rotationY: 0 },
      path: [{ x: 200, y: 0, z: 10 }],
    });
    state.entities.units.push(unit);
    state.possessedUnitIds = [unit.id];

    const grid = buildSpatialGridForUnits(state.entities.units);
    movementSystem(state, 0.1, grid);

    expect(unit.transform.position).toEqual({ x: 10, y: 0, z: 10 });
  });

  it('clamps positions to the map boundary', () => {
    const state = makeMatch({ mapWidthM: 100, mapDepthM: 100, cellSizeM: 10 });
    const unit = makeUnit({
      factionId: FACTION_A,
      transform: { position: { x: 5, y: 0, z: 5 }, rotationY: 0 },
      velocity: { x: -1000, y: 0, z: -1000 },
    });
    state.entities.units.push(unit);

    const grid = buildSpatialGridForUnits(state.entities.units);
    movementSystem(state, 1, grid);

    expect(unit.transform.position.x).toBeGreaterThanOrEqual(12);
    expect(unit.transform.position.z).toBeGreaterThanOrEqual(12);
  });

  it('sets AIR units to the fixed flight height and ground units to y=0', () => {
    const state = makeMatch();
    const air = makeUnit({ factionId: FACTION_A, unitClass: 'AIR', transform: { position: { x: 10, y: 0, z: 10 }, rotationY: 0 } });
    const ground = makeUnit({ factionId: FACTION_A, unitClass: 'INFANTRY', transform: { position: { x: 10, y: 999, z: 10 }, rotationY: 0 } });
    state.entities.units.push(air, ground);

    const grid = buildSpatialGridForUnits(state.entities.units);
    movementSystem(state, 0.1, grid);

    expect(air.transform.position.y).toBeGreaterThan(0);
    expect(ground.transform.position.y).toBe(0);
  });

  it('separates two overlapping units of the same class', () => {
    const state = makeMatch();
    const a = makeUnit({ factionId: FACTION_A, transform: { position: { x: 100, y: 0, z: 100 }, rotationY: 0 } });
    const b = makeUnit({ factionId: FACTION_A, transform: { position: { x: 105, y: 0, z: 100 }, rotationY: 0 } });
    state.entities.units.push(a, b);

    const distBefore = Math.abs(a.transform.position.x - b.transform.position.x);
    for (let i = 0; i < 20; i++) {
      const grid = buildSpatialGridForUnits(state.entities.units);
      movementSystem(state, 0.1, grid);
    }
    const distAfter = Math.abs(a.transform.position.x - b.transform.position.x);

    expect(distAfter).toBeGreaterThan(distBefore);
  });
});
