/**
 * Starting-scenario seeding for a fresh RTS match. `createMatch()` (packages/rts-sim) always
 * returns an EMPTY world — per its README, placing bases/units/resources is "the integration
 * layer's job": in the shipped product that's Studio-authored `RTS_UNIT`/`RTS_BUILDING`
 * `WorldEntity` placements (docs/RTS-CONTRACTS.md §6), but that authoring flow hasn't landed in
 * apps/studio yet (this app's scope is §7, the player, not §6's Studio palette). Rather than block
 * on it, this module fills in a simple, symmetric default: one base per faction (Refinery/
 * Barracks/Factory + a small starting force) in opposite map corners, plus a few neutral Sotolium
 * nodes — recognizably the reference's opening layout, just not creator-authored yet.
 *
 * Determinism (docs/RTS-CONTRACTS.md §1) still matters here even though this never runs inside
 * `tickMatch`: every peer calls this once, immediately after `createMatch()`, before the first
 * tick — so it must produce byte-identical entities on every machine. It does, because it draws
 * only from `state`'s own seeded rng (continuing the exact stream `tickMatch` will pick up from
 * afterward) and iterates `state.factions` in array order — never `Math.random()`, never
 * `Set`/`Map` iteration order.
 */
import {
  RTS_BUILDING_STATS,
  RTS_UNIT_STATS,
  generateEntityId,
  rngFromState,
  type BuildingClass,
  type RTSBuilding,
  type RTSMatchState,
  type RTSResourceNode,
  type RTSUnit,
  type UnitClass,
} from '@sonic-gameworld/rts-sim';

/** Corner anchors as fractions of map width/depth — cycled through for >4 factions (§9's Pro-difficulty
 * allied factions will add up to 3 more), distinct for the 2 that ship today. */
const CORNER_FRACTIONS: { fx: number; fz: number }[] = [
  { fx: 0.15, fz: 0.15 },
  { fx: 0.85, fz: 0.85 },
  { fx: 0.85, fz: 0.15 },
  { fx: 0.15, fz: 0.85 },
];

const STARTING_BUILDINGS: BuildingClass[] = ['REFINERY', 'BARRACKS', 'FACTORY'];
const STARTING_UNITS: UnitClass[] = ['INFANTRY', 'INFANTRY', 'INFANTRY', 'ARMORED', 'ARMORED'];

const STARTING_RESOURCE_AMOUNT = 5000;
const NEUTRAL_RESOURCE_AMOUNT = 8000;

function cornerAnchor(index: number, widthM: number, depthM: number): { x: number; z: number } {
  const corner = CORNER_FRACTIONS[index % CORNER_FRACTIONS.length]!;
  return { x: widthM * corner.fx, z: depthM * corner.fz };
}

function clampCell(cell: number, gridSize: number, footprint: number): number {
  return Math.max(0, Math.min(cell, Math.max(gridSize - footprint, 0)));
}

/** Marks a building's footprint occupied on the pathfinding grid (`RTSMap.occupancy`, §2). */
function markOccupied(occupancy: Uint8Array, gridWidth: number, gridDepth: number, cellX: number, cellZ: number, size: { w: number; d: number }): void {
  for (let dz = 0; dz < size.d; dz++) {
    for (let dx = 0; dx < size.w; dx++) {
      const x = cellX + dx;
      const z = cellZ + dz;
      if (x < 0 || x >= gridWidth || z < 0 || z >= gridDepth) continue;
      occupancy[z * gridWidth + x] = 1;
    }
  }
}

function makeResourceNode(rng: ReturnType<typeof rngFromState>, x: number, z: number, amount: number): RTSResourceNode {
  return { id: generateEntityId(rng, 'resource'), position: { x, y: 0, z }, amount, isBeingHarvested: false };
}

/**
 * Mutates `state` in place (matching this package's own systems' "mutate a draft" convention) and
 * returns it, adding one base + starting force per faction plus a handful of neutral resource
 * nodes. Safe to call exactly once, immediately after `createMatch()` and before the first
 * `tickMatch()` call.
 */
export function seedStartingScenario(state: RTSMatchState): RTSMatchState {
  const rng = rngFromState(state.rngState);
  const { cellSizeM, gridWidth, gridDepth, widthM, depthM } = state.map;

  state.factions.forEach((faction, factionIndex) => {
    const anchor = cornerAnchor(factionIndex, widthM, depthM);
    let cellCursor = 0;

    for (const buildingClass of STARTING_BUILDINGS) {
      const stats = RTS_BUILDING_STATS[buildingClass];
      const cellX = clampCell(Math.round(anchor.x / cellSizeM) + cellCursor, gridWidth, stats.sizeCells.w);
      const cellZ = clampCell(Math.round(anchor.z / cellSizeM), gridDepth, stats.sizeCells.d);
      cellCursor += stats.sizeCells.w + 1;

      const building: RTSBuilding = {
        id: generateEntityId(rng, 'building'),
        factionId: faction.factionId,
        buildingClass,
        cellX,
        cellZ,
        sizeCells: stats.sizeCells,
        health: stats.health,
        maxHealth: stats.health,
        isOperational: true,
      };
      state.entities.buildings.push(building);
      markOccupied(state.map.occupancy, gridWidth, gridDepth, cellX, cellZ, stats.sizeCells);
    }

    STARTING_UNITS.forEach((unitClass, unitIndex) => {
      const stats = RTS_UNIT_STATS[unitClass];
      const x = anchor.x + (unitIndex - (STARTING_UNITS.length - 1) / 2) * 35;
      const z = anchor.z + (STARTING_BUILDINGS.length + 1) * cellSizeM;
      const unit: RTSUnit = {
        id: generateEntityId(rng, 'unit'),
        factionId: faction.factionId,
        unitClass,
        transform: { position: { x, y: unitClass === 'AIR' ? 30 : 0, z }, rotationY: 0 },
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
        lastFiredAtTick: 0,
        harvestedSotolium: 0,
        isDetected: true,
        heat: 0,
        isSelected: false,
      };
      state.entities.units.push(unit);
    });

    // A Sotolium node close to home so harvesting works from tick zero.
    state.entities.resources.push(makeResourceNode(rng, anchor.x + cellSizeM * 4, anchor.z + cellSizeM * 4, STARTING_RESOURCE_AMOUNT));
  });

  // A couple of contested, neutral nodes near the map center.
  const center = { x: widthM / 2, z: depthM / 2 };
  for (const offset of [{ x: -150, z: 0 }, { x: 150, z: 0 }]) {
    state.entities.resources.push(makeResourceNode(rng, center.x + offset.x, center.z + offset.z, NEUTRAL_RESOURCE_AMOUNT));
  }

  state.rngState = rng.getState();
  return state;
}
