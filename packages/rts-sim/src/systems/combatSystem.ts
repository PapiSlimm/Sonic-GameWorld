// Ported from docs/reference/global-dominance/src/engine/GameEngine.ts's `combatSystem`
// (docs/RTS-CONTRACTS.md §3). Range/targeting uses pure XZ distance (COMBAT_HEIGHT_TOLERANCE_M =
// Infinity in constants.ts) so AIR units flying at AIR_FLIGHT_HEIGHT_M are always in range of, and
// can always be targeted by, ground units — otherwise Air would never be "in range" of ground
// units and the reference's combat feel would break. Projectile ids are generated from the
// match's shared `Rng` instead of `Math.random()`, per docs/RTS-CONTRACTS.md §1.
//
// §9 depth extension: when a unit has a `unitType` with a `RTS_UNIT_TYPE_STATS` entry, its
// heat-per-shot and cooling rate come from that entry instead of the plain per-`unitClass`
// defaults — this is the "wire heat up for real" requirement from docs/RTS-CONTRACTS.md §9. A unit
// with no `unitType` (every unit spawned before §9, and any spawned without specifying one) keeps
// the exact original `RTS_UNIT_STATS`/`COOLING_RATE` behavior, unchanged.
import { COOLING_RATE, FIRE_COOLDOWN_TICKS, PROJECTILE_SPEED, RTS_UNIT_STATS, RTS_UNIT_TYPE_STATS } from '../constants';
import { generateEntityId, type Rng } from '../rng';
import type { RTSMatchState, RTSUnit, UnitType } from '../types';
import type { SpatialGrid } from './spatialGrid';
import { distanceXZ, findUnit } from './util';

function heatPerShotFor(unit: RTSUnit): number {
  const typeStats = unit.unitType ? RTS_UNIT_TYPE_STATS[unit.unitType as UnitType] : undefined;
  return typeStats?.heatPerShot ?? RTS_UNIT_STATS[unit.unitClass]?.heatPerShot ?? 0.12;
}

function coolingRateFor(unit: RTSUnit): number {
  const typeStats = unit.unitType ? RTS_UNIT_TYPE_STATS[unit.unitType as UnitType] : undefined;
  return typeStats?.coolingRate ?? COOLING_RATE;
}

export function combatSystem(state: RTSMatchState, dtSeconds: number, grid: SpatialGrid, rng: Rng): void {
  const possessed = new Set(state.possessedUnitIds);

  for (const unit of state.entities.units) {
    if (unit.state === 'DEAD') continue;
    if (possessed.has(unit.id)) continue;

    unit.heat = Math.max(0, unit.heat - coolingRateFor(unit) * dtSeconds);

    const nearbyIds = grid.getNearby(unit.transform.position.x, unit.transform.position.z, unit.attackRange);
    let nearestEnemyId: string | undefined;
    let minDist = unit.attackRange;

    for (const id of nearbyIds) {
      const enemy = findUnit(state, id);
      if (!enemy || enemy.factionId === unit.factionId || enemy.state === 'DEAD') continue;
      const d = distanceXZ(unit.transform.position, enemy.transform.position);
      if (d < minDist) {
        minDist = d;
        nearestEnemyId = enemy.id;
      }
    }

    if (nearestEnemyId) {
      const nearestEnemy = findUnit(state, nearestEnemyId)!;
      unit.state = 'ATTACKING';

      if (state.tick - unit.lastFiredAtTick >= FIRE_COOLDOWN_TICKS) {
        unit.lastFiredAtTick = state.tick;
        unit.heat = Math.min(1.2, unit.heat + heatPerShotFor(unit));

        state.entities.projectiles.push({
          id: generateEntityId(rng, 'proj'),
          position: { ...unit.transform.position },
          targetPosition: { ...nearestEnemy.transform.position },
          speed: PROJECTILE_SPEED,
          damage: unit.damage,
          ownerId: unit.id,
          factionId: unit.factionId,
        });
      }
    }
  }
}
