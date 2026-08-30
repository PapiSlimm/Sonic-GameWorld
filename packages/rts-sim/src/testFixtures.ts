// Shared test scaffolding — not part of the public API (not exported from index.ts). Builds a
// small, valid match by hand (createMatch() alone returns an empty world; placing starting
// buildings/units is the integration layer's job in the real product — see README.md).
import { RTS_BUILDING_STATS, RTS_UNIT_STATS } from './constants';
import { createMatch } from './index';
import type { RTSBuilding, RTSMatchState, RTSResourceNode, RTSUnit, UnitClass } from './types';

export const FACTION_A = 'raven-alliance';
export const FACTION_B = 'united-dragon-nations';

export function makeMatch(overrides?: Partial<Parameters<typeof createMatch>[0]>): RTSMatchState {
  return createMatch({
    seed: 12345,
    mapWidthM: 400,
    mapDepthM: 400,
    cellSizeM: 10,
    factions: [
      { factionId: FACTION_A, isAIControlled: false },
      { factionId: FACTION_B, isAIControlled: false },
    ],
    ...overrides,
  });
}

let nextTestId = 0;
function testId(prefix: string): string {
  nextTestId += 1;
  return `${prefix}-${nextTestId}`;
}

/**
 * Resets the incrementing id counter used by makeUnit/makeBuilding/makeResourceNode. Call this
 * before constructing two scenarios that must come out byte-identical (e.g. two independent runs
 * in a determinism test) — otherwise the two scenarios' hand-authored entities get different ids
 * purely from fixture bookkeeping, which has nothing to do with the simulation's own determinism.
 */
export function resetTestIds(): void {
  nextTestId = 0;
}

export function makeUnit(overrides: Partial<RTSUnit> & { factionId: string; unitClass?: UnitClass }): RTSUnit {
  const unitClass: UnitClass = overrides.unitClass ?? 'INFANTRY';
  const stats = RTS_UNIT_STATS[unitClass];
  return {
    id: testId('unit'),
    transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    path: [],
    health: stats.health,
    maxHealth: stats.health,
    speed: stats.speed,
    attackRange: stats.attackRange,
    damage: stats.damage,
    detectionRadius: stats.detectionRadius,
    state: 'IDLE',
    commands: [],
    targetNodeId: null,
    // Very negative so a freshly-built test unit can fire immediately regardless of state.tick,
    // instead of every test having to know about FIRE_COOLDOWN_TICKS just to get a first shot off.
    lastFiredAtTick: -1_000_000,
    harvestedSotolium: 0,
    isDetected: true,
    heat: 0,
    isSelected: false,
    ...overrides,
    unitClass,
  };
}

export function makeBuilding(overrides: Partial<RTSBuilding> & { factionId: string }): RTSBuilding {
  const buildingClass = overrides.buildingClass ?? 'BARRACKS';
  const stats = RTS_BUILDING_STATS[buildingClass];
  return {
    id: testId('building'),
    cellX: 0,
    cellZ: 0,
    sizeCells: { ...stats.sizeCells },
    health: stats.health,
    maxHealth: stats.health,
    isOperational: true,
    ...overrides,
    buildingClass,
  };
}

export function makeResourceNode(overrides: Partial<RTSResourceNode> = {}): RTSResourceNode {
  return {
    id: testId('node'),
    position: { x: 100, y: 0, z: 100 },
    amount: 1000,
    isBeingHarvested: false,
    ...overrides,
  };
}
