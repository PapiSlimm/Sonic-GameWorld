// Ported from docs/reference/global-dominance/src/engine/GameEngine.ts's `fogOfWarSystem`
// (docs/RTS-CONTRACTS.md §3). Two responsibilities carried over verbatim from the reference,
// which combined them in one pass:
//   1. Death transition: any unit whose health has dropped to 0 (from combat, this same tick)
//      flips to the DEAD state and drops its velocity/path/commands. This runs unconditionally,
//      independent of any viewer.
//   2. Visibility: instead of the reference's single hardcoded `input.selectedFaction`, this takes
//      an explicit list of faction ids to compute visibility *for* — one shared visibility set is
//      built as the union of every living unit's/building's detection radius belonging to any of
//      those factions, and `RTSUnit.isDetected` is set accordingly for everyone else. `tickMatch`
//      passes only the human-controlled factions (AI factions don't need fog of war), matching
//      §3's "compute one visibility map per human-controlled faction that's actually being
//      queried, not all factions eagerly".
//
// §9 depth extension (docs/RTS-CONTRACTS.md §9, "Stealth + radar"), both wired in for real rather
// than left as inert exports:
//   - A thermally-exposed unit (`isThermallyExposed`) is auto-revealed regardless of the cell-based
//     visibility computed below, matching "a unit above a detection threshold is auto-revealed
//     regardless of fog-of-war/cover".
//   - A `RADAR` building grants its owning faction `RTS_RADAR_DETECTION_RADIUS_M` of visibility
//     instead of the flat `BUILDING_VISIBILITY_RADIUS_CELLS` every other building gets.
// Cover-cell halving of proximity detection is deliberately NOT modeled here — see
// `src/systems/stealth.ts`'s module doc for why, and use `computeDetection` when that per-unit
// fidelity is needed.
import { RTS_BUILDING_STATS, RTS_RADAR_DETECTION_RADIUS_M } from '../constants';
import type { RTSMatchState, RTSUnit, Vec3 } from '../types';
import { isThermallyExposed } from './stealth';

function addUnitVisibility(cells: Set<string>, unit: RTSUnit, cellSizeM: number): void {
  const gx = Math.floor(unit.transform.position.x / cellSizeM);
  const gz = Math.floor(unit.transform.position.z / cellSizeM);
  const r = Math.ceil(unit.detectionRadius / cellSizeM);

  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dz * dz <= r * r) {
        cells.add(`${gx + dx},${gz + dz}`);
      }
    }
  }
}

function addBuildingVisibility(
  cells: Set<string>,
  building: { cellX: number; cellZ: number; sizeCells: { w: number; d: number } },
  radiusCells: number,
): void {
  for (let dx = -radiusCells; dx <= radiusCells + building.sizeCells.w; dx++) {
    for (let dz = -radiusCells; dz <= radiusCells + building.sizeCells.d; dz++) {
      cells.add(`${building.cellX + dx},${building.cellZ + dz}`);
    }
  }
}

const BUILDING_VISIBILITY_RADIUS_CELLS = 8;

/**
 * Mutates the match draft: transitions dead units, then recomputes `isDetected` for every unit
 * relative to the union of visibility granted by `viewerFactionIds`'s living units/buildings.
 * Units belonging to a viewer faction are always `isDetected = true` (matching the reference's
 * "own faction is always visible to itself").
 */
export function fogOfWarSystem(state: RTSMatchState, viewerFactionIds: readonly string[]): void {
  for (const unit of state.entities.units) {
    if (unit.health <= 0 && unit.state !== 'DEAD') {
      unit.state = 'DEAD';
      unit.velocity = zeroVec();
      unit.path = [];
      unit.commands = [];
    }
  }

  const viewers = new Set(viewerFactionIds);
  if (viewers.size === 0) {
    // No human-controlled faction is querying this tick — nothing to compute or mark.
    for (const unit of state.entities.units) unit.isDetected = false;
    return;
  }

  const visibleCells = new Set<string>();
  const cellSizeM = state.map.cellSizeM;

  for (const unit of state.entities.units) {
    if (unit.state === 'DEAD' || !viewers.has(unit.factionId)) continue;
    addUnitVisibility(visibleCells, unit, cellSizeM);
  }
  for (const building of state.entities.buildings) {
    if (building.health <= 0 || !viewers.has(building.factionId)) continue;
    const radiusCells =
      building.buildingClass === 'RADAR'
        ? Math.ceil((RTS_BUILDING_STATS.RADAR.detectionRadiusM ?? RTS_RADAR_DETECTION_RADIUS_M) / cellSizeM)
        : BUILDING_VISIBILITY_RADIUS_CELLS;
    addBuildingVisibility(visibleCells, building, radiusCells);
  }

  for (const unit of state.entities.units) {
    if (viewers.has(unit.factionId)) {
      unit.isDetected = true;
      continue;
    }
    const gx = Math.floor(unit.transform.position.x / cellSizeM);
    const gz = Math.floor(unit.transform.position.z / cellSizeM);
    // §9: heat-exposed units are auto-revealed regardless of cell-based visibility.
    unit.isDetected = visibleCells.has(`${gx},${gz}`) || isThermallyExposed(unit);
  }
}

function zeroVec(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}
