// §9 depth extension: stealth + radar detection helpers (docs/RTS-CONTRACTS.md §9, "Stealth +
// radar"). Pure, read-only functions over `RTSMatchState` — nothing here mutates state.
//
// Two detection mechanisms coexist in this package, deliberately at different fidelity:
//   1. `fogOfWarSystem` (run automatically every tick by `tickMatch`) computes a cheap, cell-based
//      visibility set per viewer faction, and — as of §9 — additionally auto-reveals any
//      thermally-exposed unit and grants RADAR buildings a much larger visibility radius than a
//      plain building. It does NOT model cover, because cover halves the *target's* effective
//      detection range rather than the *viewer's*, which doesn't fit that cell-marking algorithm
//      without a per-unit distance pass (see below) — an intentional, documented simplification.
//   2. `computeDetection` (this file) is the fully spec-compliant per-unit query — heat exposure OR
//      radar range OR proximity-with-cover-halving — for callers that want the exact §9 rule for
//      one specific unit (a HUD detail panel, an AI stealth decision, a test). It's a direct
//      distance check rather than the cell-grid `fogOfWarSystem` uses, since it only ever needs to
//      answer for one unit at a time.
import { HEAT_DETECTION_THRESHOLD, RTS_BUILDING_STATS, RTS_RADAR_DETECTION_RADIUS_M } from '../constants';
import type { RTSMap, RTSMatchState, RTSUnit } from '../types';
import { distanceXZ } from './util';

/** True once `unit.heat` is at or above `HEAT_DETECTION_THRESHOLD` — see module doc. */
export function isThermallyExposed(unit: RTSUnit): boolean {
  return unit.heat >= HEAT_DETECTION_THRESHOLD;
}

function cellIndex(map: RTSMap, cellX: number, cellZ: number): number {
  return cellZ * map.gridWidth + cellX;
}

/**
 * True when `(cellX, cellZ)` is flagged as cover on `map.coverCells` (see `RTSMap.coverCells`'s
 * doc). Always false for a map with no cover grid allocated (e.g. one deserialized from before §9)
 * or for an out-of-bounds cell, rather than throwing.
 */
export function isCoverCell(map: RTSMap, cellX: number, cellZ: number): boolean {
  if (!map.coverCells) return false;
  if (cellX < 0 || cellX >= map.gridWidth || cellZ < 0 || cellZ >= map.gridDepth) return false;
  return map.coverCells[cellIndex(map, cellX, cellZ)] === 1;
}

/** True when `position` falls in a cover cell — world-meters convenience over `isCoverCell`. */
export function isPositionInCover(map: RTSMap, position: { x: number; z: number }): boolean {
  const cellX = Math.floor(position.x / map.cellSizeM);
  const cellZ = Math.floor(position.z / map.cellSizeM);
  return isCoverCell(map, cellX, cellZ);
}

/**
 * The full §9 detection rule for one unit, from one viewer faction's perspective:
 * `heatExposed OR withinViewerRadarRange OR withinViewerProximityDetection` (proximity range
 * halved when `unit` occupies a cover cell). A viewer faction's own units are always detected by
 * itself, matching `fogOfWarSystem`'s existing "own faction is always visible to itself" rule.
 * Dead units are never detected (nothing to reveal).
 */
export function computeDetection(state: RTSMatchState, unit: RTSUnit, viewerFactionId: string): boolean {
  if (unit.factionId === viewerFactionId) return true;
  if (unit.state === 'DEAD') return false;
  if (isThermallyExposed(unit)) return true;

  const inCover = isPositionInCover(state.map, unit.transform.position);

  for (const building of state.entities.buildings) {
    if (building.factionId !== viewerFactionId || building.health <= 0) continue;
    if (building.buildingClass !== 'RADAR') continue;
    const radius = RTS_BUILDING_STATS.RADAR.detectionRadiusM ?? RTS_RADAR_DETECTION_RADIUS_M;
    const centerX = (building.cellX + building.sizeCells.w / 2) * state.map.cellSizeM;
    const centerZ = (building.cellZ + building.sizeCells.d / 2) * state.map.cellSizeM;
    if (distanceXZ({ x: centerX, y: 0, z: centerZ }, unit.transform.position) <= radius) return true;
  }

  for (const viewerUnit of state.entities.units) {
    if (viewerUnit.factionId !== viewerFactionId || viewerUnit.state === 'DEAD') continue;
    const radius = inCover ? viewerUnit.detectionRadius / 2 : viewerUnit.detectionRadius;
    if (distanceXZ(viewerUnit.transform.position, unit.transform.position) <= radius) return true;
  }

  return false;
}
