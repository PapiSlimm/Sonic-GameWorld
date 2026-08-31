import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LAYER_KINDS, type LayerKind } from '@sonic-gameworld/world-schema';
import { createMatch, getTeamColor, type RTSBuilding, type RTSMatchState, type RTSUnit } from '@sonic-gameworld/rts-sim';
import { EntityRegistry, GEOMETRY_BUCKET_METADATA_KEY, TEAM_COLOR_METADATA_KEY } from '../engine/entities.js';
import {
  parseRTSEntityId,
  rtsBuildingEntityId,
  rtsUnitEntityId,
  syncRTSEntities,
} from './syncEntities.js';

function makeRegistry(): EntityRegistry {
  const layerGroups = new Map<LayerKind, THREE.Group>();
  for (const kind of LAYER_KINDS) layerGroups.set(kind, new THREE.Group());
  return new EntityRegistry(layerGroups);
}

function makeMatch(): RTSMatchState {
  return createMatch({
    seed: 1,
    mapWidthM: 800,
    mapDepthM: 800,
    cellSizeM: 40,
    factions: [
      { factionId: 'raven-alliance', isAIControlled: false },
      { factionId: 'united-dragon-nations', isAIControlled: true },
    ],
  });
}

function makeUnit(overrides: Partial<RTSUnit> = {}): RTSUnit {
  return {
    id: 'u1',
    factionId: 'raven-alliance',
    unitClass: 'INFANTRY',
    transform: { position: { x: 10, y: 0, z: 20 }, rotationY: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    path: [],
    health: 100,
    maxHealth: 100,
    speed: 2.2,
    attackRange: 160,
    damage: 12,
    detectionRadius: 200,
    state: 'IDLE',
    commands: [],
    targetNodeId: null,
    lastFiredAtTick: 0,
    harvestedSotolium: 0,
    isDetected: false,
    heat: 0,
    isSelected: false,
    ...overrides,
  };
}

function makeBuilding(overrides: Partial<RTSBuilding> = {}): RTSBuilding {
  return {
    id: 'b1',
    factionId: 'raven-alliance',
    buildingClass: 'BARRACKS',
    cellX: 2,
    cellZ: 3,
    sizeCells: { w: 2, d: 2 },
    health: 1000,
    maxHealth: 1000,
    isOperational: true,
    ...overrides,
  };
}

/** Finds the actual `InstancedMesh` bucket a spawned entity landed in, by trying every instanced
 * mesh `EntityRegistry` currently knows about and asking it to resolve the entity's own instance
 * index back to its id — the only way to get at a bucket from outside the registry's private
 * `buckets` map, and a good end-to-end check that geometry sub-bucketing actually separated
 * instances into different meshes rather than just tagging metadata nobody reads. */
function meshForEntity(registry: EntityRegistry, id: string): THREE.InstancedMesh {
  const slot = registry.slots.get(id)!;
  for (const obj of registry.raycastTargets()) {
    if (obj instanceof THREE.InstancedMesh && registry.resolveHit(obj, slot.index) === id) return obj;
  }
  throw new Error(`no InstancedMesh bucket found for entity ${id}`);
}

function instanceColorOf(registry: EntityRegistry, id: string): THREE.Color {
  const slot = registry.slots.get(id)!;
  const mesh = meshForEntity(registry, id);
  const color = new THREE.Color();
  mesh.getColorAt(slot.index!, color);
  return color;
}

describe('rtsUnitEntityId / rtsBuildingEntityId / parseRTSEntityId', () => {
  it('round-trips a unit id', () => {
    const id = rtsUnitEntityId('unit_abc');
    expect(parseRTSEntityId(id)).toEqual({ kind: 'unit', id: 'unit_abc' });
  });

  it('round-trips a building id', () => {
    const id = rtsBuildingEntityId('bldg_xyz');
    expect(parseRTSEntityId(id)).toEqual({ kind: 'building', id: 'bldg_xyz' });
  });

  it('returns null for an id that is not a synced RTS entity', () => {
    expect(parseRTSEntityId('some-author-placed-entity')).toBeNull();
  });
});

describe('syncRTSEntities — spawning', () => {
  it('spawns a WorldEntity of kind RTS_UNIT per unit, at its world position', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    state.entities.units.push(makeUnit());

    syncRTSEntities(state, registry);

    const id = rtsUnitEntityId('u1');
    expect(registry.slots.has(id)).toBe(true);
    const slot = registry.slots.get(id)!;
    expect(slot.kind).toBe('RTS_UNIT');
    expect(slot.entity.transform.position.x).toBe(10);
    expect(slot.entity.transform.position.z).toBe(20);
  });

  it('spawns a WorldEntity of kind RTS_BUILDING, positioned at the center of its cell footprint', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    state.entities.buildings.push(makeBuilding({ cellX: 0, cellZ: 0, sizeCells: { w: 2, d: 2 } }));

    syncRTSEntities(state, registry);

    const id = rtsBuildingEntityId('b1');
    const slot = registry.slots.get(id)!;
    expect(slot.kind).toBe('RTS_BUILDING');
    // cellX=0, cellZ=0, sizeCells 2x2, cellSizeM=40 => center at (1*40, 1*40) = (40, 40).
    expect(slot.entity.transform.position.x).toBeCloseTo(40, 5);
    expect(slot.entity.transform.position.z).toBeCloseTo(40, 5);
  });

  it('scales a building instance by its actual sizeCells footprint, larger buildings getting larger scale', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    state.entities.buildings.push(makeBuilding({ id: 'small', sizeCells: { w: 2, d: 2 } }));
    state.entities.buildings.push(makeBuilding({ id: 'large', cellX: 10, cellZ: 10, sizeCells: { w: 3, d: 3 } }));

    syncRTSEntities(state, registry);

    const small = registry.slots.get(rtsBuildingEntityId('small'))!.entity.transform.scale;
    const large = registry.slots.get(rtsBuildingEntityId('large'))!.entity.transform.scale;
    expect(large.x).toBeGreaterThan(small.x);
    expect(large.z).toBeGreaterThan(small.z);
  });

  it('gives different unit classes different scale on the shared capsule geometry', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    state.entities.units.push(makeUnit({ id: 'inf', unitClass: 'INFANTRY' }));
    state.entities.units.push(makeUnit({ id: 'arm', unitClass: 'ARMORED' }));

    syncRTSEntities(state, registry);

    const inf = registry.slots.get(rtsUnitEntityId('inf'))!.entity.transform.scale;
    const arm = registry.slots.get(rtsUnitEntityId('arm'))!.entity.transform.scale;
    expect(arm.x).toBeGreaterThan(inf.x);
  });

  it('computes rotation from rotationY as a Y-axis quaternion', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    state.entities.units.push(makeUnit({ transform: { position: { x: 0, y: 0, z: 0 }, rotationY: Math.PI / 2 } }));

    syncRTSEntities(state, registry);

    const rot = registry.slots.get(rtsUnitEntityId('u1'))!.entity.transform.rotation;
    const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
    expect(euler.y).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe('syncRTSEntities — terrain height', () => {
  it('defaults to flat ground (y=0) when no sampleTerrainHeight is given', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    state.entities.units.push(makeUnit());

    syncRTSEntities(state, registry);

    expect(registry.slots.get(rtsUnitEntityId('u1'))!.entity.transform.position.y).toBe(0);
  });

  it('adds sampled terrain height under a ground unit, and under an AIR unit on top of its flight altitude', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    state.entities.units.push(makeUnit({ id: 'ground', unitClass: 'INFANTRY', transform: { position: { x: 5, y: 0, z: 5 }, rotationY: 0 } }));
    state.entities.units.push(makeUnit({ id: 'air', unitClass: 'AIR', transform: { position: { x: 5, y: 30, z: 5 }, rotationY: 0 } }));

    syncRTSEntities(state, registry, { sampleTerrainHeight: () => 12 });

    expect(registry.slots.get(rtsUnitEntityId('ground'))!.entity.transform.position.y).toBeCloseTo(12, 5);
    expect(registry.slots.get(rtsUnitEntityId('air'))!.entity.transform.position.y).toBeCloseTo(42, 5); // 12 (terrain) + 30 (flight altitude)
  });

  it('places buildings directly on sampled terrain (no altitude offset)', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    state.entities.buildings.push(makeBuilding());

    syncRTSEntities(state, registry, { sampleTerrainHeight: () => 7 });

    expect(registry.slots.get(rtsBuildingEntityId('b1'))!.entity.transform.position.y).toBeCloseTo(7, 5);
  });
});

describe('syncRTSEntities — updates and removal', () => {
  it('moves an already-synced unit instead of re-spawning it', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    state.entities.units.push(makeUnit());
    syncRTSEntities(state, registry);

    state.entities.units[0]!.transform.position = { x: 99, y: 0, z: 55 };
    syncRTSEntities(state, registry);

    expect(registry.slots.size).toBe(1); // not duplicated
    const slot = registry.slots.get(rtsUnitEntityId('u1'))!;
    expect(slot.entity.transform.position.x).toBe(99);
    expect(slot.entity.transform.position.z).toBe(55);
  });

  it('removes a unit that died (no longer present in state.entities.units) between calls', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    state.entities.units.push(makeUnit({ id: 'dies-soon' }));
    syncRTSEntities(state, registry);
    expect(registry.slots.has(rtsUnitEntityId('dies-soon'))).toBe(true);

    state.entities.units = [];
    syncRTSEntities(state, registry);

    expect(registry.slots.has(rtsUnitEntityId('dies-soon'))).toBe(false);
  });

  it('removes a destroyed building the same way', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    state.entities.buildings.push(makeBuilding());
    syncRTSEntities(state, registry);
    expect(registry.slots.has(rtsBuildingEntityId('b1'))).toBe(true);

    state.entities.buildings = [];
    syncRTSEntities(state, registry);

    expect(registry.slots.has(rtsBuildingEntityId('b1'))).toBe(false);
  });

  it('does not re-tag geometryBucket/teamColor metadata on a unit that only moved (no re-spawn)', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    state.entities.units.push(makeUnit({ unitClass: 'ARMORED' }));
    syncRTSEntities(state, registry);
    const before = registry.slots.get(rtsUnitEntityId('u1'))!.entity.metadata[GEOMETRY_BUCKET_METADATA_KEY];

    state.entities.units[0]!.transform.position = { x: 1, y: 0, z: 1 };
    syncRTSEntities(state, registry);

    expect(registry.slots.get(rtsUnitEntityId('u1'))!.entity.metadata[GEOMETRY_BUCKET_METADATA_KEY]).toBe(before);
  });

  it('never touches an author-placed WorldEntity that is not one of its own synced ids', () => {
    const registry = makeRegistry();
    registry.spawn({
      id: 'studio-placed-prop',
      kind: 'PROP',
      name: 'Author Prop',
      transform: { position: { x: 1, y: 0, z: 1 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
      tags: [],
      permissions: { ownerId: 'u1', editors: [], visibility: 'PRIVATE' },
      metadata: {},
    });
    const state = makeMatch(); // no RTS units/buildings at all this tick

    syncRTSEntities(state, registry);

    expect(registry.slots.has('studio-placed-prop')).toBe(true);
  });
});

describe('syncRTSEntities — geometry bucket selection (docs/RTS-CONTRACTS.md §9 unitType roster)', () => {
  it.each([
    ['INFANTRY', 'INFANTRY'],
    ['ARMORED', 'ARMORED'],
    ['AIR', 'AIR'],
  ] as const)('a %s unit with no unitType set falls back to the plain per-class %s bucket', (unitClass, expectedBucket) => {
    const registry = makeRegistry();
    const state = makeMatch();
    state.entities.units.push(makeUnit({ unitClass }));

    syncRTSEntities(state, registry);

    const metadata = registry.slots.get(rtsUnitEntityId('u1'))!.entity.metadata;
    expect(metadata[GEOMETRY_BUCKET_METADATA_KEY]).toBe(expectedBucket);
  });

  it('routes a naval unitType to the NAVAL bucket even though rts-sim models it as unitClass ARMORED', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    // DESTROYER is one of rts-sim's naval archetypes (RTS_UNIT_TYPE_STATS) and, per that package's
    // README, is modeled as unitClass: 'ARMORED' — geometry bucketing must not take that at face
    // value, or every ship would render as a tank.
    state.entities.units.push(makeUnit({ unitClass: 'ARMORED', unitType: 'DESTROYER' }));

    syncRTSEntities(state, registry);

    const metadata = registry.slots.get(rtsUnitEntityId('u1'))!.entity.metadata;
    expect(metadata[GEOMETRY_BUCKET_METADATA_KEY]).toBe('NAVAL');
  });

  it('keeps a non-naval unitType on its plain per-class bucket', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    state.entities.units.push(makeUnit({ unitClass: 'ARMORED', unitType: 'MAIN_BATTLE_TANK' }));

    syncRTSEntities(state, registry);

    const metadata = registry.slots.get(rtsUnitEntityId('u1'))!.entity.metadata;
    expect(metadata[GEOMETRY_BUCKET_METADATA_KEY]).toBe('ARMORED');
  });

  it('routes a RADAR building to the TECH bucket', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    state.entities.buildings.push(makeBuilding({ buildingClass: 'RADAR' }));

    syncRTSEntities(state, registry);

    const metadata = registry.slots.get(rtsBuildingEntityId('b1'))!.entity.metadata;
    expect(metadata[GEOMETRY_BUCKET_METADATA_KEY]).toBe('TECH');
  });

  it.each(['BARRACKS', 'FACTORY', 'REFINERY', 'AIRFIELD'] as const)(
    'routes a %s building to the PRODUCTION bucket',
    (buildingClass) => {
      const registry = makeRegistry();
      const state = makeMatch();
      state.entities.buildings.push(makeBuilding({ buildingClass }));

      syncRTSEntities(state, registry);

      const metadata = registry.slots.get(rtsBuildingEntityId('b1'))!.entity.metadata;
      expect(metadata[GEOMETRY_BUCKET_METADATA_KEY]).toBe('PRODUCTION');
    },
  );

  it('actually renders different unit-geometry buckets as different InstancedMesh objects, not just different metadata', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    state.entities.units.push(makeUnit({ id: 'inf', unitClass: 'INFANTRY' }));
    state.entities.units.push(makeUnit({ id: 'tank', unitClass: 'ARMORED', unitType: 'MAIN_BATTLE_TANK' }));
    state.entities.units.push(makeUnit({ id: 'ship', unitClass: 'ARMORED', unitType: 'DESTROYER' }));
    state.entities.units.push(makeUnit({ id: 'plane', unitClass: 'AIR' }));

    syncRTSEntities(state, registry);

    const infMesh = meshForEntity(registry, rtsUnitEntityId('inf'));
    const tankMesh = meshForEntity(registry, rtsUnitEntityId('tank'));
    const shipMesh = meshForEntity(registry, rtsUnitEntityId('ship'));
    const planeMesh = meshForEntity(registry, rtsUnitEntityId('plane'));

    // Four distinct families -> four distinct InstancedMesh buckets (one draw call each).
    expect(new Set([infMesh, tankMesh, shipMesh, planeMesh]).size).toBe(4);
    // A ship must not land in the same bucket as a tank despite sharing unitClass ARMORED.
    expect(shipMesh).not.toBe(tankMesh);
  });

  it('shares one InstancedMesh bucket across multiple units of the same geometry bucket (still one draw call per family)', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    state.entities.units.push(makeUnit({ id: 'tank1', unitClass: 'ARMORED', unitType: 'MAIN_BATTLE_TANK' }));
    state.entities.units.push(makeUnit({ id: 'tank2', unitClass: 'ARMORED', unitType: 'SELF_PROPELLED_ARTILLERY' }));

    syncRTSEntities(state, registry);

    const mesh1 = meshForEntity(registry, rtsUnitEntityId('tank1'));
    const mesh2 = meshForEntity(registry, rtsUnitEntityId('tank2'));
    expect(mesh1).toBe(mesh2);
    expect(mesh1.count).toBe(2);
  });

  it('routes a building with no explicit RTS building class metadata to a distinct mesh than a RADAR building', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    state.entities.buildings.push(makeBuilding({ id: 'barracks', buildingClass: 'BARRACKS' }));
    state.entities.buildings.push(makeBuilding({ id: 'radar', buildingClass: 'RADAR', cellX: 10, cellZ: 10 }));

    syncRTSEntities(state, registry);

    const barracksMesh = meshForEntity(registry, rtsBuildingEntityId('barracks'));
    const radarMesh = meshForEntity(registry, rtsBuildingEntityId('radar'));
    expect(barracksMesh).not.toBe(radarMesh);
  });
});

describe('syncRTSEntities — team color tinting (docs/RTS-CONTRACTS.md §9 biome team colors)', () => {
  it('tints a spawned unit with getTeamColor(factionId, biome) on the default URBAN biome', () => {
    const registry = makeRegistry();
    const state = makeMatch(); // createMatch defaults map.biome to 'URBAN'
    state.entities.units.push(makeUnit({ factionId: 'raven-alliance' }));

    syncRTSEntities(state, registry);

    const metadata = registry.slots.get(rtsUnitEntityId('u1'))!.entity.metadata;
    const expected = getTeamColor('raven-alliance', 'URBAN');
    expect(metadata[TEAM_COLOR_METADATA_KEY]).toBe(expected);
    expect(instanceColorOf(registry, rtsUnitEntityId('u1')).getHexString()).toBe(new THREE.Color(expected).getHexString());
  });

  it('follows the map biome for team color — United Dragon Nations renders green on JUNGLE, red on URBAN', () => {
    const registry = makeRegistry();
    const urbanState = makeMatch();
    urbanState.entities.units.push(makeUnit({ id: 'urban-dragon', factionId: 'united-dragon-nations' }));
    syncRTSEntities(urbanState, registry);

    const jungleRegistry = makeRegistry();
    const jungleState = makeMatch();
    jungleState.map.biome = 'JUNGLE';
    jungleState.entities.units.push(makeUnit({ id: 'jungle-dragon', factionId: 'united-dragon-nations' }));
    syncRTSEntities(jungleState, jungleRegistry);

    const urbanColor = registry.slots.get(rtsUnitEntityId('urban-dragon'))!.entity.metadata[TEAM_COLOR_METADATA_KEY];
    const jungleColor = jungleRegistry.slots.get(rtsUnitEntityId('jungle-dragon'))!.entity.metadata[TEAM_COLOR_METADATA_KEY];
    expect(urbanColor).toBe(getTeamColor('united-dragon-nations', 'URBAN'));
    expect(jungleColor).toBe(getTeamColor('united-dragon-nations', 'JUNGLE'));
    expect(urbanColor).not.toBe(jungleColor);
  });

  it('defaults to URBAN team colors when state.map.biome is absent (older serialized match state)', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    delete (state.map as { biome?: unknown }).biome;
    state.entities.buildings.push(makeBuilding({ factionId: 'raven-alliance' }));

    syncRTSEntities(state, registry);

    const metadata = registry.slots.get(rtsBuildingEntityId('b1'))!.entity.metadata;
    expect(metadata[TEAM_COLOR_METADATA_KEY]).toBe(getTeamColor('raven-alliance', 'URBAN'));
  });

  it('preserves a unit\'s own team-color tint through select/deselect', () => {
    const registry = makeRegistry();
    const state = makeMatch();
    state.entities.units.push(makeUnit({ factionId: 'united-dragon-nations' }));
    syncRTSEntities(state, registry);
    const id = rtsUnitEntityId('u1');
    const expectedHex = new THREE.Color(getTeamColor('united-dragon-nations', 'URBAN')).getHexString();

    registry.setSelected(id, true);
    registry.setSelected(id, false);

    expect(instanceColorOf(registry, id).getHexString()).toBe(expectedHex);
  });
});
