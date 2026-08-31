import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LAYER_KINDS, type LayerKind, type WorldEntity } from '@sonic-gameworld/world-schema';
import { EntityRegistry, GEOMETRY_BUCKET_METADATA_KEY, TEAM_COLOR_METADATA_KEY } from './entities.js';

function makeRegistry(): EntityRegistry {
  const layerGroups = new Map<LayerKind, THREE.Group>();
  for (const kind of LAYER_KINDS) layerGroups.set(kind, new THREE.Group());
  return new EntityRegistry(layerGroups);
}

const IDENTITY_TRANSFORM: WorldEntity['transform'] = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
};

function makeEntity(overrides: Partial<WorldEntity> = {}): WorldEntity {
  return {
    id: 'e1',
    kind: 'RTS_UNIT',
    name: 'Entity',
    transform: IDENTITY_TRANSFORM,
    tags: [],
    permissions: { ownerId: 'owner', editors: [], visibility: 'PRIVATE' },
    metadata: {},
    ...overrides,
  };
}

/** Same technique `rts/syncEntities.test.ts` uses: the only way to recover a bucket's actual
 * `InstancedMesh` from outside `EntityRegistry`'s private `buckets` map is to ask the registry to
 * resolve the entity's own instance index back to its id against every instanced mesh it knows about. */
function meshForEntity(registry: EntityRegistry, id: string): THREE.InstancedMesh {
  const slot = registry.slots.get(id)!;
  for (const obj of registry.raycastTargets()) {
    if (obj instanceof THREE.InstancedMesh && registry.resolveHit(obj, slot.index) === id) return obj;
  }
  throw new Error(`no InstancedMesh bucket found for entity ${id}`);
}

describe('EntityRegistry — geometry sub-bucketing (GEOMETRY_BUCKET_METADATA_KEY)', () => {
  it('two RTS_UNIT entities with different geometryBucket metadata land in different InstancedMesh buckets', () => {
    const registry = makeRegistry();
    registry.spawn(makeEntity({ id: 'a', metadata: { [GEOMETRY_BUCKET_METADATA_KEY]: 'INFANTRY' } }));
    registry.spawn(makeEntity({ id: 'b', metadata: { [GEOMETRY_BUCKET_METADATA_KEY]: 'ARMORED' } }));

    expect(meshForEntity(registry, 'a')).not.toBe(meshForEntity(registry, 'b'));
  });

  it('two RTS_UNIT entities with the same geometryBucket metadata share one InstancedMesh (one draw call per family)', () => {
    const registry = makeRegistry();
    registry.spawn(makeEntity({ id: 'a', metadata: { [GEOMETRY_BUCKET_METADATA_KEY]: 'ARMORED' } }));
    registry.spawn(makeEntity({ id: 'b', metadata: { [GEOMETRY_BUCKET_METADATA_KEY]: 'ARMORED' } }));

    const mesh = meshForEntity(registry, 'a');
    expect(meshForEntity(registry, 'b')).toBe(mesh);
    expect(mesh.count).toBe(2);
  });

  it('an entity with no geometryBucket metadata falls back to the kind\'s original single default bucket', () => {
    const registry = makeRegistry();
    registry.spawn(makeEntity({ id: 'no-hint' })); // metadata: {} — no GEOMETRY_BUCKET_METADATA_KEY
    registry.spawn(makeEntity({ id: 'armored', metadata: { [GEOMETRY_BUCKET_METADATA_KEY]: 'ARMORED' } }));

    // The no-hint entity must not silently join the ARMORED bucket — it gets its own default one.
    expect(meshForEntity(registry, 'no-hint')).not.toBe(meshForEntity(registry, 'armored'));
  });

  it('an unrecognized geometryBucket value falls back to the same default bucket as no hint at all', () => {
    const registry = makeRegistry();
    registry.spawn(makeEntity({ id: 'no-hint' }));
    registry.spawn(makeEntity({ id: 'garbage', metadata: { [GEOMETRY_BUCKET_METADATA_KEY]: 'NOT_A_REAL_BUCKET' } }));

    expect(meshForEntity(registry, 'garbage')).toBe(meshForEntity(registry, 'no-hint'));
  });

  it('RTS_BUILDING sub-buckets by geometryBucket independently of RTS_UNIT (PRODUCTION vs TECH)', () => {
    const registry = makeRegistry();
    registry.spawn(makeEntity({ id: 'prod', kind: 'RTS_BUILDING', metadata: { [GEOMETRY_BUCKET_METADATA_KEY]: 'PRODUCTION' } }));
    registry.spawn(makeEntity({ id: 'tech', kind: 'RTS_BUILDING', metadata: { [GEOMETRY_BUCKET_METADATA_KEY]: 'TECH' } }));
    registry.spawn(makeEntity({ id: 'unit', kind: 'RTS_UNIT', metadata: { [GEOMETRY_BUCKET_METADATA_KEY]: 'PRODUCTION' } }));

    const prodMesh = meshForEntity(registry, 'prod');
    const techMesh = meshForEntity(registry, 'tech');
    const unitMesh = meshForEntity(registry, 'unit');
    // Same variant string ('PRODUCTION') on a different EntityKind must still be a different
    // bucket — the composite key is (kind, variant), not variant alone.
    expect(prodMesh).not.toBe(techMesh);
    expect(prodMesh).not.toBe(unitMesh);
  });

  it('a non-RTS kind (e.g. NPC) is entirely unaffected by geometryBucket metadata — always one shared bucket', () => {
    const registry = makeRegistry();
    registry.spawn(makeEntity({ id: 'npc-a', kind: 'NPC', metadata: { [GEOMETRY_BUCKET_METADATA_KEY]: 'ARMORED' } }));
    registry.spawn(makeEntity({ id: 'npc-b', kind: 'NPC', metadata: {} }));

    // geometryBucket is only consulted by RTS_UNIT/RTS_BUILDING's geometryForKind branches — an NPC
    // ignores it entirely and both instances land in NPC's one bucket regardless.
    expect(meshForEntity(registry, 'npc-a')).toBe(meshForEntity(registry, 'npc-b'));
  });
});

describe('EntityRegistry — per-instance team-color tint (TEAM_COLOR_METADATA_KEY)', () => {
  it('tints an instance with its metadata color instead of the bucket base color when set', () => {
    const registry = makeRegistry();
    registry.spawn(makeEntity({ id: 'red', metadata: { [TEAM_COLOR_METADATA_KEY]: '#ff0000' } }));
    const slot = registry.slots.get('red')!;
    const mesh = meshForEntity(registry, 'red');

    const color = new THREE.Color();
    mesh.getColorAt(slot.index!, color);
    expect(color.getHexString()).toBe('ff0000');
  });

  it('falls back to the bucket base color when no teamColor metadata is set', () => {
    const registry = makeRegistry();
    registry.spawn(makeEntity({ id: 'plain', metadata: {} }));
    const slot = registry.slots.get('plain')!;
    const mesh = meshForEntity(registry, 'plain');

    const color = new THREE.Color();
    mesh.getColorAt(slot.index!, color);
    expect(color.getHex()).not.toBe(0); // some real base color, not left at the default black
  });

  it('restores its own team-color tint (not the bucket base color) after deselect', () => {
    const registry = makeRegistry();
    registry.spawn(makeEntity({ id: 'blue', metadata: { [TEAM_COLOR_METADATA_KEY]: '#0033ff' } }));

    registry.setSelected('blue', true);
    registry.setSelected('blue', false);

    const slot = registry.slots.get('blue')!;
    const mesh = meshForEntity(registry, 'blue');
    const color = new THREE.Color();
    mesh.getColorAt(slot.index!, color);
    expect(color.getHexString()).toBe('0033ff');
  });
});
