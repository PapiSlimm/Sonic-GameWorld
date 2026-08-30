import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LAYER_KINDS, type LayerKind } from '@sonic-gameworld/world-schema';
import { createMatch, type RTSBuilding, type RTSMatchState, type RTSUnit } from '@sonic-gameworld/rts-sim';
import { EntityRegistry } from '../engine/entities.js';
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
