// Ported from docs/reference/global-dominance/src/engine/UnitProduction.ts
// (docs/RTS-CONTRACTS.md §3). Build queue is keyed by faction, cost/duration come from
// `RTS_UNIT_STATS`/`PRODUCTION_DURATION_TICKS`, and spawns happen at the building that started
// the order (or, if it has since been destroyed, any surviving compatible building of that
// faction). `enqueueProduction` is exposed as a standalone, command-adjacent API per §3, since a
// BUILD order targets a building rather than a unit selection and so doesn't flow through
// `commandSystem`'s per-unit fan-out.
//
// Deviation from the reference: if a faction's production finishes but every compatible building
// has since been destroyed, the reference silently drops the spent credits. This package refunds
// them instead — losing your factory mid-build shouldn't also erase the credits you already
// spent, and silently eating a player's economy on a rebuildable setback is a worse multiplayer
// experience than a refund. Documented in README.md's "Deviations from the reference" section.
//
// §9 depth extension (docs/RTS-CONTRACTS.md §9, "Economy + roster caps"): hard per-faction
// production caps — RTS_UNIT_CAP_GROUND (250, combined INFANTRY+ARMORED) and RTS_UNIT_CAP_AIR (50)
// — enforced here, plus an optional `unitType` argument that layers `RTS_UNIT_TYPE_STATS`'s
// cost/health/damage/speed on top of the plain per-`unitClass` numbers (naval archetypes are
// additionally rejected outside a `biome: 'SEA'` map). `tryEnqueueProduction` is the new "clear
// result/error shape" the spec asks for, so a caller can tell *why* a request was rejected instead
// of getting a silent no-op; `enqueueProduction`'s original boolean signature is preserved exactly
// (an added trailing optional `unitType` param is backward-compatible) and now simply wraps it.
import {
  AIR_FLIGHT_HEIGHT_M,
  PRODUCTION_DURATION_TICKS,
  RTS_UNIT_CAP_AIR,
  RTS_UNIT_CAP_GROUND,
  RTS_UNIT_STATS,
  RTS_UNIT_TYPE_STATS,
} from '../constants';
import { generateEntityId, type Rng } from '../rng';
import type { ProductionQueueItem, RTSMatchState, RTSUnit, UnitClass, UnitType } from '../types';
import { findBuilding } from './util';

export type ProductionRejectionReason = 'INSUFFICIENT_CREDITS' | 'UNIT_CAP_REACHED' | 'NAVAL_REQUIRES_SEA_BIOME';

export type ProductionResult =
  | { ok: true; queueItemId: string }
  | { ok: false; reason: ProductionRejectionReason };

/** Living units + already-queued orders of `factionId` whose `unitClass` is in `classes`. */
function countCommittedUnits(state: RTSMatchState, factionId: string, classes: readonly UnitClass[]): number {
  const alive = state.entities.units.filter((u) => u.factionId === factionId && u.state !== 'DEAD' && classes.includes(u.unitClass)).length;
  const queued = state.productionQueue.filter((q) => q.factionId === factionId && classes.includes(q.unitClass)).length;
  return alive + queued;
}

function capFor(unitClass: UnitClass): { cap: number; classes: UnitClass[] } {
  return unitClass === 'AIR' ? { cap: RTS_UNIT_CAP_AIR, classes: ['AIR'] } : { cap: RTS_UNIT_CAP_GROUND, classes: ['INFANTRY', 'ARMORED'] };
}

/**
 * Queues one unit of `unitClass` (optionally the specific `unitType` archetype) for `factionId`,
 * deducting its cost immediately (matching the reference — credits are spent on order, not on
 * completion). Returns a typed rejection instead of silently no-opping when the request can't
 * proceed: `'UNIT_CAP_REACHED'` (the per-faction INFANTRY+ARMORED/AIR cap — see
 * `RTS_UNIT_CAP_GROUND`/`RTS_UNIT_CAP_AIR`), `'NAVAL_REQUIRES_SEA_BIOME'` (a naval `unitType` on a
 * non-`SEA` map), or `'INSUFFICIENT_CREDITS'`. `buildingId`, when given, is the building the order
 * was issued from (see `commandSystem.applyCommand`'s BUILD handling); production still proceeds
 * even if that specific building is destroyed mid-build (see module deviation note above).
 */
export function tryEnqueueProduction(
  state: RTSMatchState,
  factionId: string,
  unitClass: UnitClass,
  tick: number,
  buildingId?: string,
  unitType?: string,
): ProductionResult {
  const econ = state.economy[factionId];
  if (!econ) return { ok: false, reason: 'INSUFFICIENT_CREDITS' };

  const typeStats = unitType && RTS_UNIT_TYPE_STATS[unitType as UnitType]?.unitClass === unitClass ? RTS_UNIT_TYPE_STATS[unitType as UnitType] : undefined;

  if (typeStats?.navalOnly && state.map.biome !== 'SEA') {
    return { ok: false, reason: 'NAVAL_REQUIRES_SEA_BIOME' };
  }

  const { cap, classes } = capFor(unitClass);
  if (countCommittedUnits(state, factionId, classes) >= cap) {
    return { ok: false, reason: 'UNIT_CAP_REACHED' };
  }

  const cost = typeStats?.cost ?? RTS_UNIT_STATS[unitClass].cost;
  if (econ.credits < cost) return { ok: false, reason: 'INSUFFICIENT_CREDITS' };

  econ.credits -= cost;
  const queueItemId = `${factionId}:${unitClass}:${tick}:${state.productionQueue.length}`;
  const item: ProductionQueueItem = {
    id: queueItemId,
    factionId,
    unitClass,
    buildingId,
    startedAtTick: tick,
    durationTicks: PRODUCTION_DURATION_TICKS,
  };
  if (typeStats) item.unitType = unitType;
  state.productionQueue.push(item);
  return { ok: true, queueItemId };
}

/**
 * Original §1-4 boolean API, preserved exactly (the trailing `unitType` param is additive and
 * optional). See `tryEnqueueProduction` for the richer result shape §9 adds.
 */
export function enqueueProduction(state: RTSMatchState, factionId: string, unitClass: UnitClass, tick: number, buildingId?: string, unitType?: string): boolean {
  return tryEnqueueProduction(state, factionId, unitClass, tick, buildingId, unitType).ok;
}

function findSpawnBuilding(state: RTSMatchState, factionId: string, unitClass: UnitClass, preferredBuildingId?: string) {
  if (preferredBuildingId) {
    const preferred = findBuilding(state, preferredBuildingId);
    if (preferred && preferred.factionId === factionId && preferred.health > 0) return preferred;
  }

  const compatibleClass = unitClass === 'INFANTRY' ? 'BARRACKS' : undefined;
  const compatible = state.entities.buildings.find(
    (b) =>
      b.factionId === factionId &&
      b.health > 0 &&
      (compatibleClass ? b.buildingClass === compatibleClass : b.buildingClass === 'FACTORY' || b.buildingClass === 'AIRFIELD'),
  );
  if (compatible) return compatible;

  return state.entities.buildings.find((b) => b.factionId === factionId && b.health > 0);
}

function spawnUnit(state: RTSMatchState, factionId: string, unitClass: UnitClass, buildingId: string | undefined, rng: Rng, unitType?: string): void {
  const baseStats = RTS_UNIT_STATS[unitClass];
  // §9: layer unitType-specific cost/health/damage/speed on top of the plain per-class numbers
  // when the order named an archetype (validated against unitClass in tryEnqueueProduction, but
  // re-checked here defensively since a queue item could in principle be hand-constructed by a
  // test/tool).
  const typeStats = unitType && RTS_UNIT_TYPE_STATS[unitType as UnitType]?.unitClass === unitClass ? RTS_UNIT_TYPE_STATS[unitType as UnitType] : undefined;
  const stats = { ...baseStats, ...(typeStats ? { cost: typeStats.cost, health: typeStats.health, damage: typeStats.damage, speed: typeStats.speed } : {}) };
  const building = findSpawnBuilding(state, factionId, unitClass, buildingId);

  if (!building) {
    // No surviving building to spawn from: refund (see module deviation note) and drop the order.
    const econ = state.economy[factionId];
    if (econ) econ.credits += stats.cost;
    return;
  }

  const spawnX = building.cellX * state.map.cellSizeM + state.map.cellSizeM;
  const spawnZ = building.cellZ * state.map.cellSizeM + state.map.cellSizeM;

  const newUnit: RTSUnit = {
    id: generateEntityId(rng, 'unit'),
    factionId,
    unitClass,
    unitType,
    transform: { position: { x: spawnX, y: unitClass === 'AIR' ? AIR_FLIGHT_HEIGHT_M : 0, z: spawnZ }, rotationY: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    path: [],
    health: stats.health,
    maxHealth: stats.health,
    speed: stats.speed,
    attackRange: baseStats.attackRange,
    damage: stats.damage,
    detectionRadius: baseStats.detectionRadius,
    state: 'IDLE',
    commands: [],
    targetNodeId: null,
    lastFiredAtTick: 0,
    harvestedSotolium: 0,
    isDetected: true,
    heat: 0,
    isSelected: false,
  };

  state.entities.units.push(newUnit);
}

/** Advances every in-flight production order by one tick, spawning any that have completed. */
export function productionSystem(state: RTSMatchState, rng: Rng): void {
  const stillPending: ProductionQueueItem[] = [];

  for (const item of state.productionQueue) {
    const elapsedTicks = state.tick - item.startedAtTick;
    if (elapsedTicks >= item.durationTicks) {
      spawnUnit(state, item.factionId, item.unitClass, item.buildingId, rng, item.unitType);
    } else {
      stillPending.push(item);
    }
  }

  state.productionQueue = stillPending;
}
