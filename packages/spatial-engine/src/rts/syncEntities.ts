import * as THREE from 'three';
import type { Transform, WorldEntity } from '@sonic-gameworld/world-schema';
import type { Biome, RTSBuilding, RTSMatchState, RTSUnit, UnitClass } from '@sonic-gameworld/rts-sim';
import { getTeamColor, isNavalUnit } from '@sonic-gameworld/rts-sim';
import type { EntityRegistry } from '../engine/entities.js';
import { GEOMETRY_BUCKET_METADATA_KEY, TEAM_COLOR_METADATA_KEY } from '../engine/entities.js';
import { ENTITY_KIND_RADIUS, type RTSBuildingGeometryBucket, type RTSUnitGeometryBucket } from '../types.js';

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
  // Per-class size variety layered on top of whichever geometry bucket a unit lands in (see
  // `unitGeometryBucket` below) — kept even though geometry now also varies by bucket, since it
  // still gives useful size read *within* a family (e.g. every ARMORED-bucket instance is bigger
  // than every INFANTRY-bucket one, regardless of which specific unitType each is).
  INFANTRY: { x: 0.7, y: 0.9, z: 0.7 },
  ARMORED: { x: 1.6, y: 1.1, z: 2.1 },
  AIR: { x: 1.3, y: 0.6, z: 1.3 },
};

/**
 * Chooses this unit's `RTSUnitGeometryBucket` (see `types.ts`) — engine/entities.ts's
 * `geometryForRTSUnitBucket` renders each as a distinct cheap primitive. `isNavalUnit` (keyed off
 * the optional §9 `unitType` field) takes priority over the plain per-class mapping, since a naval
 * archetype is modeled as `unitClass: 'ARMORED'` in rts-sim (ships trade fire like a ground
 * vehicle) but should read as a hull, not a tank, at RTS zoom. A unit with no `unitType` at all —
 * i.e. every unit from match state saved before docs/RTS-CONTRACTS.md §9 — always falls through to
 * the plain per-`unitClass` bucket here, exactly as it always has, since `isNavalUnit` on such a
 * unit is unconditionally `false`.
 */
function unitGeometryBucket(unit: RTSUnit): RTSUnitGeometryBucket {
  if (isNavalUnit(unit)) return 'NAVAL';
  return unit.unitClass;
}

/**
 * Chooses this building's `RTSBuildingGeometryBucket` (see `types.ts`) — every production building
 * (`REFINERY`/`BARRACKS`/`FACTORY`/`AIRFIELD`) shares the boxy `PRODUCTION` silhouette; `RADAR`
 * (the §9 "Radar Array" tech building) gets the taller `TECH` one so it reads as distinct at a
 * glance, per docs/RTS-CONTRACTS.md §6's "at least 2 silhouette variants" ask.
 */
function buildingGeometryBucket(building: RTSBuilding): RTSBuildingGeometryBucket {
  return building.buildingClass === 'RADAR' ? 'TECH' : 'PRODUCTION';
}

/**
 * `getTeamColor` needs a `Biome`; `RTSMap.biome` is optional (data from before docs/RTS-CONTRACTS.md
 * §9's biome variants added it, or a hand-built test fixture) — `createMatch` always fills it in for
 * new matches, but this adapter tolerates its absence the same way `rts-sim` itself does, defaulting
 * to `'URBAN'` rather than passing `undefined` through.
 */
function teamColorFor(factionId: string, biome: Biome | undefined): string {
  return getTeamColor(factionId, biome ?? 'URBAN');
}

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

function makeWorldEntity(
  id: string,
  kind: 'RTS_UNIT' | 'RTS_BUILDING',
  name: string,
  transform: Transform,
  ownerId: string,
  geometryBucket: RTSUnitGeometryBucket | RTSBuildingGeometryBucket,
  teamColor: string,
): WorldEntity {
  return {
    id,
    kind,
    name,
    transform,
    tags: [],
    permissions: { ownerId, editors: [], visibility: 'PRIVATE' },
    // Rendering-only hints EntityRegistry reads to pick a geometry sub-bucket and per-instance
    // tint (see engine/entities.ts's GEOMETRY_BUCKET_METADATA_KEY/TEAM_COLOR_METADATA_KEY) — set
    // once at spawn and never touched again, same as everything else about this WorldEntity's
    // shape; a unit's unitClass/naval-ness and a faction's team color never change mid-match, so
    // `move()` never needs to update either. Still just two small strings, not full match state,
    // so this doesn't reopen §6's "don't serialize full match state onto WorldEntity" concern.
    metadata: { [GEOMETRY_BUCKET_METADATA_KEY]: geometryBucket, [TEAM_COLOR_METADATA_KEY]: teamColor },
  };
}

/**
 * Mirrors `RTSMatchState.entities.{units,buildings}` onto `EntityRegistry` — position/rotation
 * (plus, at spawn time only, a geometry-bucket hint and a team-color tint — see `makeWorldEntity`),
 * per docs/RTS-CONTRACTS.md §6 ("health/isSelected/factionId etc. render as HUD overlays/tinting,
 * not `WorldEntity` fields, to avoid serializing full match state into the world document every
 * frame"). Call this once per render frame, after `tickMatch()`, with the latest `RTSMatchState`.
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
      const geometryBucket = unitGeometryBucket(unit);
      const teamColor = teamColorFor(unit.factionId, state.map.biome);
      registry.spawn(makeWorldEntity(id, 'RTS_UNIT', `${unit.unitClass} ${unit.id}`, transform, ownerIdFor(unit.factionId), geometryBucket, teamColor));
    }
  }

  for (const building of state.entities.buildings) {
    const id = rtsBuildingEntityId(building.id);
    wanted.add(id);
    const transform = buildingToTransform(building, state.map.cellSizeM, sampleTerrainHeight);
    if (registry.slots.has(id)) {
      registry.move(id, transform);
    } else {
      const geometryBucket = buildingGeometryBucket(building);
      const teamColor = teamColorFor(building.factionId, state.map.biome);
      registry.spawn(makeWorldEntity(id, 'RTS_BUILDING', `${building.buildingClass} ${building.id}`, transform, ownerIdFor(building.factionId), geometryBucket, teamColor));
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
