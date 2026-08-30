import * as THREE from 'three';
import type { Transform, WorldEntity } from '@sonic-gameworld/world-schema';
import type { RTSBuilding, RTSMatchState, RTSUnit, UnitClass } from '@sonic-gameworld/rts-sim';
import type { EntityRegistry } from '../engine/entities.js';
import { ENTITY_KIND_RADIUS } from '../types.js';

/**
 * `WorldEntity.id` prefixes this adapter uses for synced RTS entities, so they can never collide
 * with author-placed `WorldEntity`s in the same `EntityRegistry` (e.g. a Studio-placed `RTS_UNIT`
 * marking a starting position — see `apps/studio`'s entity palette) and so a stale entity left
 * over from a previous `syncRTSEntities` call (a unit that died, a building that was destroyed)
 * can be recognized and removed without this module needing to remember anything between calls.
 */
export const RTS_UNIT_ENTITY_PREFIX = 'rts-unit:';
export const RTS_BUILDING_ENTITY_PREFIX = 'rts-building:';

export function rtsUnitEntityId(unitId: string): string {
  return `${RTS_UNIT_ENTITY_PREFIX}${unitId}`;
}

export function rtsBuildingEntityId(buildingId: string): string {
  return `${RTS_BUILDING_ENTITY_PREFIX}${buildingId}`;
}

/** Inverse of `rtsUnitEntityId`/`rtsBuildingEntityId` — recovers the raw `RTSUnit`/`RTSBuilding` id from a raycast hit's `entityId`, or `null` if it isn't a synced RTS entity. */
export function parseRTSEntityId(worldEntityId: string): { kind: 'unit' | 'building'; id: string } | null {
  if (worldEntityId.startsWith(RTS_UNIT_ENTITY_PREFIX)) return { kind: 'unit', id: worldEntityId.slice(RTS_UNIT_ENTITY_PREFIX.length) };
  if (worldEntityId.startsWith(RTS_BUILDING_ENTITY_PREFIX)) return { kind: 'building', id: worldEntityId.slice(RTS_BUILDING_ENTITY_PREFIX.length) };
  return null;
}

export interface SyncRTSEntitiesOptions {
  /**
   * Real terrain-following height for ground units/buildings — `rts-sim` deliberately never
   * touches three.js/terrain (see its README's "y / terrain height is intentionally not this
   * package's job"), so the 3D integration layer supplies it here. Defaults to flat ground
   * (`() => 0`). `RTSUnit.transform.position.y` is added on top unchanged (0 for INFANTRY/ARMORED,
   * `AIR_FLIGHT_HEIGHT_M` for AIR — see rts-sim/src/constants.ts), so an AIR unit renders at
   * "terrain height + flight altitude" and a ground unit renders directly on the terrain surface.
   */
  sampleTerrainHeight?: (x: number, z: number) => number;
  /** Faction ownership tag written once at spawn (e.g. `permissions.ownerId`) — purely descriptive; nothing here reads it back. Defaults to the unit/building's `factionId`. */
  ownerId?: (factionId: string) => string;
}

const IDENTITY_ROTATION: Transform['rotation'] = { x: 0, y: 0, z: 0, w: 1 };
const UNIT_SCALE: Record<UnitClass, { x: number; y: number; z: number }> = {
  // Cheap, real per-class visual distinction on the one shared RTS_UNIT capsule geometry
  // (docs/RTS-CONTRACTS.md §6: "capsule/box per unit class... keep geometry cheap" — a separate
  // InstancedMesh bucket per unitClass would multiply draw-call bookkeeping for little benefit at
  // v1; per-instance scale on the shared bucket gets most of the visual read for free).
  INFANTRY: { x: 0.7, y: 0.9, z: 0.7 },
  ARMORED: { x: 1.6, y: 1.1, z: 2.1 },
  AIR: { x: 1.3, y: 0.6, z: 1.3 },
};

function unitToTransform(unit: RTSUnit, sampleTerrainHeight: (x: number, z: number) => number): Transform {
  const { x, y, z } = unit.transform.position;
  const half = unit.transform.rotationY / 2;
  return {
    position: { x, y: sampleTerrainHeight(x, z) + y, z },
    rotation: { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) },
    scale: UNIT_SCALE[unit.unitClass],
  };
}

function buildingToTransform(building: RTSBuilding, cellSizeM: number, sampleTerrainHeight: (x: number, z: number) => number): Transform {
  const worldX = (building.cellX + building.sizeCells.w / 2) * cellSizeM;
  const worldZ = (building.cellZ + building.sizeCells.d / 2) * cellSizeM;
  // The shared RTS_BUILDING box geometry has footprint `ENTITY_KIND_RADIUS.RTS_BUILDING * 2` on
  // each side (see types.ts) — scale it per-instance to the building's actual `sizeCells` footprint.
  const baseFootprint = ENTITY_KIND_RADIUS.RTS_BUILDING * 2;
  return {
    position: { x: worldX, y: sampleTerrainHeight(worldX, worldZ), z: worldZ },
    rotation: IDENTITY_ROTATION,
    scale: {
      x: (building.sizeCells.w * cellSizeM) / baseFootprint,
      y: 1,
      z: (building.sizeCells.d * cellSizeM) / baseFootprint,
    },
  };
}

function makeWorldEntity(id: string, kind: 'RTS_UNIT' | 'RTS_BUILDING', name: string, transform: Transform, ownerId: string): WorldEntity {
  return {
    id,
    kind,
    name,
    transform,
    tags: [],
    permissions: { ownerId, editors: [], visibility: 'PRIVATE' },
    metadata: {},
  };
}

/**
 * Mirrors `RTSMatchState.entities.{units,buildings}` onto `EntityRegistry` — position/rotation
 * only, per docs/RTS-CONTRACTS.md §6 ("health/isSelected/factionId etc. render as HUD
 * overlays/tinting, not `WorldEntity` fields, to avoid serializing full match state into the world
 * document every frame"). Call this once per render frame, after `tickMatch()`, with the latest
 * `RTSMatchState`.
 *
 * Stateless by design — it never remembers anything between calls. On every call it recomputes
 * which synced entity ids *should* exist from `state` alone, diffs that against whatever synced
 * ids (recognized by the `rts-unit:`/`rts-building:` id prefixes) are currently in `registry`, and
 * spawns/moves/removes accordingly. Reuses `EntityRegistry.spawn/move/remove` — the same instanced
 * per-`EntityKind` rendering path (see `engine/entities.ts`) every other `WorldEntity` uses — never
 * bypasses it, per §6's explicit requirement.
 */
export function syncRTSEntities(state: RTSMatchState, registry: EntityRegistry, opts: SyncRTSEntitiesOptions = {}): void {
  const sampleTerrainHeight = opts.sampleTerrainHeight ?? (() => 0);
  const ownerIdFor = opts.ownerId ?? ((factionId: string) => factionId);
  const wanted = new Set<string>();

  for (const unit of state.entities.units) {
    const id = rtsUnitEntityId(unit.id);
    wanted.add(id);
    const transform = unitToTransform(unit, sampleTerrainHeight);
    if (registry.slots.has(id)) {
      registry.move(id, transform);
    } else {
      registry.spawn(makeWorldEntity(id, 'RTS_UNIT', `${unit.unitClass} ${unit.id}`, transform, ownerIdFor(unit.factionId)));
    }
  }

  for (const building of state.entities.buildings) {
    const id = rtsBuildingEntityId(building.id);
    wanted.add(id);
    const transform = buildingToTransform(building, state.map.cellSizeM, sampleTerrainHeight);
    if (registry.slots.has(id)) {
      registry.move(id, transform);
    } else {
      registry.spawn(makeWorldEntity(id, 'RTS_BUILDING', `${building.buildingClass} ${building.id}`, transform, ownerIdFor(building.factionId)));
    }
  }

  // Sweep: any previously-synced RTS entity (unit died / building destroyed since the last call)
  // that isn't wanted this tick gets removed. Only ever touches ids this module owns (the
  // `rts-*:` prefixes) — author-placed WorldEntity ids from a loaded WorldDocument are untouched.
  for (const id of registry.slots.keys()) {
    if ((id.startsWith(RTS_UNIT_ENTITY_PREFIX) || id.startsWith(RTS_BUILDING_ENTITY_PREFIX)) && !wanted.has(id)) {
      registry.remove(id);
    }
  }
}

// Re-exported so a caller building a `THREE.Quaternion` from `unit.rotationY` elsewhere (e.g. to
// resolve a possessed unit's facing for FIRST_PERSON/THIRD_PERSON) doesn't need to duplicate this
// axis-angle math.
export function quaternionFromRotationY(rotationY: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
}
