// §9 depth extension: stealth + radar detection (docs/RTS-CONTRACTS.md §9). Covers
// isThermallyExposed, cover-cell flagging, computeDetection's heat/radar/cover-halving rule, and
// fogOfWarSystem's real (not inert) heat-auto-reveal + RADAR-radius wiring.
import { describe, expect, it } from 'vitest';
import { HEAT_DETECTION_THRESHOLD, RTS_RADAR_DETECTION_RADIUS_M } from '../constants';
import { fogOfWarSystem } from './fogOfWarSystem';
import { computeDetection, isCoverCell, isThermallyExposed } from './stealth';
import { FACTION_A, FACTION_B, makeBuilding, makeMatch, makeUnit } from '../testFixtures';

describe('isThermallyExposed', () => {
  it('is false below the threshold and true at/above it', () => {
    expect(isThermallyExposed(makeUnit({ factionId: FACTION_A, heat: HEAT_DETECTION_THRESHOLD - 0.01 }))).toBe(false);
    expect(isThermallyExposed(makeUnit({ factionId: FACTION_A, heat: HEAT_DETECTION_THRESHOLD }))).toBe(true);
  });
});

describe('isCoverCell', () => {
  it('is false everywhere on a map with no cover grid allocated', () => {
    const state = makeMatch();
    state.map.coverCells = undefined;
    expect(isCoverCell(state.map, 0, 0)).toBe(false);
  });

  it('reflects a flagged cell and stays false for its neighbors', () => {
    const state = makeMatch();
    state.map.coverCells![0 * state.map.gridWidth + 3] = 1; // cellX=3, cellZ=0
    expect(isCoverCell(state.map, 3, 0)).toBe(true);
    expect(isCoverCell(state.map, 4, 0)).toBe(false);
  });

  it('is false out of bounds rather than throwing', () => {
    const state = makeMatch();
    expect(isCoverCell(state.map, -1, 0)).toBe(false);
    expect(isCoverCell(state.map, 999999, 0)).toBe(false);
  });
});

describe('computeDetection', () => {
  it('always detects a viewer faction\'s own units', () => {
    const state = makeMatch();
    const own = makeUnit({ factionId: FACTION_A, transform: { position: { x: 9999, y: 0, z: 9999 }, rotationY: 0 } });
    state.entities.units.push(own);
    expect(computeDetection(state, own, FACTION_A)).toBe(true);
  });

  it('never detects a dead unit', () => {
    const state = makeMatch();
    const dead = makeUnit({ factionId: FACTION_B, state: 'DEAD', heat: 5 });
    state.entities.units.push(dead);
    expect(computeDetection(state, dead, FACTION_A)).toBe(false);
  });

  it('detects a thermally-exposed enemy regardless of distance', () => {
    const state = makeMatch();
    const viewer = makeUnit({ factionId: FACTION_A, transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } });
    const hotEnemy = makeUnit({
      factionId: FACTION_B,
      heat: HEAT_DETECTION_THRESHOLD,
      transform: { position: { x: 100_000, y: 0, z: 100_000 }, rotationY: 0 },
    });
    state.entities.units.push(viewer, hotEnemy);
    expect(computeDetection(state, hotEnemy, FACTION_A)).toBe(true);
  });

  it('detects an enemy inside a live RADAR building\'s range, far outside any unit\'s own detectionRadius', () => {
    const state = makeMatch({ mapWidthM: 4000, mapDepthM: 4000 });
    const radar = makeBuilding({ factionId: FACTION_A, buildingClass: 'RADAR', cellX: 0, cellZ: 0 });
    state.entities.buildings.push(radar);
    const farEnemy = makeUnit({
      factionId: FACTION_B,
      transform: { position: { x: RTS_RADAR_DETECTION_RADIUS_M - 10, y: 0, z: 0 }, rotationY: 0 },
    });
    state.entities.units.push(farEnemy);

    expect(computeDetection(state, farEnemy, FACTION_A)).toBe(true);
  });

  it('does not detect via a destroyed RADAR building', () => {
    const state = makeMatch({ mapWidthM: 4000, mapDepthM: 4000 });
    const radar = makeBuilding({ factionId: FACTION_A, buildingClass: 'RADAR', cellX: 0, cellZ: 0, health: 0 });
    state.entities.buildings.push(radar);
    const farEnemy = makeUnit({
      factionId: FACTION_B,
      transform: { position: { x: RTS_RADAR_DETECTION_RADIUS_M - 10, y: 0, z: 0 }, rotationY: 0 },
    });
    state.entities.units.push(farEnemy);

    expect(computeDetection(state, farEnemy, FACTION_A)).toBe(false);
  });

  it('halves proximity detection range for an enemy standing in a cover cell', () => {
    const state = makeMatch();
    const viewer = makeUnit({ factionId: FACTION_A, transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } });
    state.entities.units.push(viewer);
    const halfRange = viewer.detectionRadius / 2;

    // Just past the halved range, but still within the un-halved range.
    const enemyPos = { x: halfRange + 5, y: 0, z: 0 };
    const enemy = makeUnit({ factionId: FACTION_B, transform: { position: enemyPos, rotationY: 0 } });
    state.entities.units.push(enemy);

    // No cover: detected (within the full detectionRadius).
    expect(computeDetection(state, enemy, FACTION_A)).toBe(true);

    // Flag the enemy's cell as cover: now outside the halved range, so no longer detected via
    // proximity (it has no radar range and heat is 0).
    const cellX = Math.floor(enemyPos.x / state.map.cellSizeM);
    const cellZ = Math.floor(enemyPos.z / state.map.cellSizeM);
    state.map.coverCells![cellZ * state.map.gridWidth + cellX] = 1;
    expect(computeDetection(state, enemy, FACTION_A)).toBe(false);
  });
});

describe('fogOfWarSystem heat/radar wiring (§9)', () => {
  it('auto-reveals a thermally-exposed enemy even outside the cell-based visibility set', () => {
    const state = makeMatch();
    const viewer = makeUnit({ factionId: FACTION_A, transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } });
    const hotFarEnemy = makeUnit({
      factionId: FACTION_B,
      heat: HEAT_DETECTION_THRESHOLD,
      transform: { position: { x: 100_000, y: 0, z: 100_000 }, rotationY: 0 },
    });
    state.entities.units.push(viewer, hotFarEnemy);

    fogOfWarSystem(state, [FACTION_A]);

    expect(hotFarEnemy.isDetected).toBe(true);
  });

  it('does not auto-reveal a cold, far enemy (no regression vs. pre-§9 behavior)', () => {
    const state = makeMatch();
    const viewer = makeUnit({ factionId: FACTION_A, transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } });
    const coldFarEnemy = makeUnit({ factionId: FACTION_B, transform: { position: { x: 100_000, y: 0, z: 100_000 }, rotationY: 0 } });
    state.entities.units.push(viewer, coldFarEnemy);

    fogOfWarSystem(state, [FACTION_A]);

    expect(coldFarEnemy.isDetected).toBe(false);
  });

  it('a RADAR building reveals a far enemy well beyond the flat building-visibility radius', () => {
    const state = makeMatch({ mapWidthM: 4000, mapDepthM: 4000 });
    const radar = makeBuilding({ factionId: FACTION_A, buildingClass: 'RADAR', cellX: 0, cellZ: 0 });
    state.entities.buildings.push(radar);
    const farEnemy = makeUnit({
      factionId: FACTION_B,
      transform: { position: { x: RTS_RADAR_DETECTION_RADIUS_M - 10, y: 0, z: 0 }, rotationY: 0 },
    });
    state.entities.units.push(farEnemy);

    fogOfWarSystem(state, [FACTION_A]);

    expect(farEnemy.isDetected).toBe(true);
  });
});
