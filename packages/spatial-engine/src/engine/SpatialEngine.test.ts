import { describe, expect, it } from 'vitest';
import { countByKind, createSampleWorld, transformAt, type CameraRig } from '@sonic-gameworld/world-schema';
import { createMatch } from '@sonic-gameworld/rts-sim';
import { SpatialEngine } from './SpatialEngine.js';
import type { RTSMode } from '../camera/modes/rts.js';
import { rtsUnitEntityId } from '../rts/syncEntities.js';

/** Every test constructs a headless engine (no `canvas` option) — `createRenderer` falls back to
 * `NullRenderer` automatically in that case, so no explicit WebGLRenderer mock is needed. */
function makeEngine(): SpatialEngine {
  return new SpatialEngine({ width: 320, height: 240 });
}

describe('SpatialEngine.loadWorld', () => {
  it('ingests every entity in the sample world and exposes correct HUD counts', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const byKind = countByKind(world);
    const engine = makeEngine();

    engine.loadWorld(world);

    expect(engine.document?.entities.length).toBe(world.entities.length);
    const hud = engine.getHUDState();
    expect(hud.counts.players).toBe(byKind.PLAYER_SPAWN ?? 0);
    expect(hud.counts.npcs).toBe(byKind.NPC ?? 0);
    expect(hud.counts.vehicles).toBe(byKind.VEHICLE ?? 0);
    expect(hud.counts.events).toBe(byKind.TRIGGER ?? 0);
    expect(hud.counts.missions).toBe(world.missions.length);
    // Sanity: the sample world actually has a mix of these kinds, so the assertions above are non-trivial.
    expect(byKind.NPC).toBeGreaterThan(0);
    expect(byKind.VEHICLE).toBeGreaterThan(0);
    expect(byKind.PLAYER_SPAWN).toBeGreaterThan(0);

    engine.dispose();
  });

  it('resets selection, tracking and cinematic state on every load', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);
    const firstEntity = world.entities[0]!;
    engine.select([firstEntity.id]);
    engine.track(firstEntity.id);
    expect(engine.getSelection()).toEqual([firstEntity.id]);
    expect(engine.getTracked()).toBe(firstEntity.id);

    engine.loadWorld(world);

    expect(engine.getSelection()).toEqual([]);
    expect(engine.getTracked()).toBeNull();
    engine.dispose();
  });

  it('getEntity finds entities by id after load', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);
    const target = world.entities.find((e) => e.kind === 'NPC')!;
    expect(engine.getEntity(target.id)?.name).toBe(target.name);
    expect(engine.getEntity('does-not-exist')).toBeUndefined();
    engine.dispose();
  });
});

describe('SpatialEngine layer toggles', () => {
  it('setLayerVisible flips visibility and is reflected by isLayerVisible + document.layers', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);

    const npcLayer = engine.getLayers().find((l) => l.kind === 'NPCS');
    expect(npcLayer).toBeDefined();
    expect(npcLayer!.visible).toBe(true);

    engine.setLayerVisible(npcLayer!.id, false);
    expect(engine.isLayerVisible(npcLayer!.id)).toBe(false);
    expect(engine.document?.layers.find((l) => l.id === npcLayer!.id)?.visible).toBe(false);

    engine.setLayerVisible(npcLayer!.id, true);
    expect(engine.isLayerVisible(npcLayer!.id)).toBe(true);

    engine.dispose();
  });

  it('DETECTION and SENSORS layers start hidden by default (per createDefaultLayers)', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);
    const detection = engine.getLayers().find((l) => l.kind === 'DETECTION');
    const sensors = engine.getLayers().find((l) => l.kind === 'SENSORS');
    expect(detection?.visible).toBe(false);
    expect(sensors?.visible).toBe(false);
    engine.dispose();
  });

  it('ignores setLayerVisible for an unknown layer id', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);
    expect(() => engine.setLayerVisible('nope', true)).not.toThrow();
    expect(engine.isLayerVisible('nope')).toBe(false);
    engine.dispose();
  });
});

describe('SpatialEngine selection', () => {
  it('select() replaces the current selection and emits a select event once per call', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);
    const [a, b, c] = world.entities;
    const seen: string[][] = [];
    engine.on('select', (e) => seen.push(e.ids));

    engine.select([a!.id, b!.id]);
    expect(engine.getSelection().sort()).toEqual([a!.id, b!.id].sort());

    engine.select([c!.id]);
    expect(engine.getSelection()).toEqual([c!.id]);

    expect(seen).toHaveLength(2);
    engine.dispose();
  });

  it('select([]) clears the selection', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);
    engine.select([world.entities[0]!.id]);
    expect(engine.getSelection()).toHaveLength(1);
    engine.select([]);
    expect(engine.getSelection()).toEqual([]);
    engine.dispose();
  });

  it('removing a selected/tracked entity clears it from selection and tracking', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);
    const target = world.entities.find((e) => e.kind === 'NPC')!;
    engine.select([target.id]);
    engine.track(target.id);

    engine.remove(target.id);

    expect(engine.getSelection()).not.toContain(target.id);
    expect(engine.getTracked()).toBeNull();
    expect(engine.getEntity(target.id)).toBeUndefined();
    engine.dispose();
  });
});

describe('SpatialEngine possession (docs/RTS-CONTRACTS.md §6)', () => {
  it('possessEntity switches to FIRST_PERSON targeting the given entity, and releasePossession restores the prior camera', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);
    const unit = world.entities.find((e) => e.kind === 'VEHICLE')!;

    engine.setCameraMode('RTS', { params: { distance: 150 } });
    expect(engine.isPossessing()).toBe(false);

    engine.possessEntity(unit.id, 'FIRST_PERSON');

    expect(engine.isPossessing()).toBe(true);
    expect(engine.getCameraMode()).toBe('FIRST_PERSON');
    expect(engine.getTracked()).toBe(unit.id);

    engine.releasePossession();

    expect(engine.isPossessing()).toBe(false);
    expect(engine.getCameraMode()).toBe('RTS');
    expect(engine.getTracked()).toBeNull();
    engine.dispose();
  });

  it('possessEntity defaults to FIRST_PERSON and supports THIRD_PERSON explicitly', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);
    const unit = world.entities.find((e) => e.kind === 'NPC')!;

    engine.possessEntity(unit.id);
    expect(engine.getCameraMode()).toBe('FIRST_PERSON');

    engine.possessEntity(unit.id, 'THIRD_PERSON');
    expect(engine.getCameraMode()).toBe('THIRD_PERSON');
    // Still possessing (the pre-possession snapshot from the *first* possessEntity call is kept).
    expect(engine.isPossessing()).toBe(true);
    engine.dispose();
  });

  it('a second possessEntity call while already possessing does not overwrite the original pre-possession snapshot', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);
    const [unitA, unitB] = world.entities.filter((e) => e.kind === 'NPC');

    engine.setCameraMode('ORBIT');
    engine.possessEntity(unitA!.id);
    engine.possessEntity(unitB!.id, 'THIRD_PERSON'); // switching possessed unit mid-possession

    engine.releasePossession();

    expect(engine.getCameraMode()).toBe('ORBIT'); // restored to what was active before the *first* possession, not ORBIT-via-unitA
    engine.dispose();
  });

  it('releasePossession is a no-op when not currently possessing', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);
    engine.setCameraMode('DRONE');

    expect(() => engine.releasePossession()).not.toThrow();
    expect(engine.getCameraMode()).toBe('DRONE');
    engine.dispose();
  });

  it('loadWorld() clears any in-progress possession state', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);
    const unit = world.entities.find((e) => e.kind === 'NPC')!;
    engine.possessEntity(unit.id);
    expect(engine.isPossessing()).toBe(true);

    engine.loadWorld(world);

    expect(engine.isPossessing()).toBe(false);
    engine.dispose();
  });
});

describe('SpatialEngine entity lifecycle', () => {
  it('spawn() adds a new entity that getEntity can retrieve', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);
    const before = engine.document!.entities.length;

    engine.spawn({
      id: 'entity_test_spawn',
      kind: 'PROP',
      name: 'Test Prop',
      transform: transformAt(1, 2, 3),
      tags: [],
      permissions: { ownerId: 'usr_test', editors: [], visibility: 'PUBLIC' },
      metadata: {},
    });

    expect(engine.document!.entities.length).toBe(before + 1);
    expect(engine.getEntity('entity_test_spawn')?.name).toBe('Test Prop');
    engine.dispose();
  });

  it('move() updates the entity transform', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);
    const target = world.entities[0]!;
    const newTransform = transformAt(10, 20, 30);

    engine.move(target.id, newTransform);

    expect(engine.getEntity(target.id)?.transform).toEqual(newTransform);
    engine.dispose();
  });
});

describe('SpatialEngine camera + HUD', () => {
  it('setCameraMode updates getCameraMode and getHUDState().mode', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);

    engine.setCameraMode('DRONE');

    expect(engine.getCameraMode()).toBe('DRONE');
    expect(engine.getHUDState().mode).toBe('DRONE');
    engine.dispose();
  });

  it('setCameraMode("RTS") activates the strategic camera mode (docs/RTS-CONTRACTS.md §6)', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);

    engine.setCameraMode('RTS', { params: { distance: 150, pitchDeg: 60 } as CameraRig['params'] });

    expect(engine.getCameraMode()).toBe('RTS');
    expect(engine.getHUDState().mode).toBe('RTS');
    engine.dispose();
  });

  it('cameraController.getModeHandler("RTS") returns the same RTSMode instance the controller drives', () => {
    const engine = makeEngine();
    engine.setCameraMode('RTS');
    const handler = engine.cameraController.getModeHandler<RTSMode>('RTS');
    handler.jumpTo(42, -7);
    expect(handler.getAnchor()).toEqual({ x: 42, z: -7 });
    engine.dispose();
  });

  it('tick() advances without throwing and reports a finite fps after warmup', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);
    for (let i = 0; i < 5; i++) engine.tick(1 / 60);
    const hud = engine.getHUDState();
    expect(Number.isFinite(hud.fps)).toBe(true);
    expect(hud.fps).toBeGreaterThan(0);
    engine.dispose();
  });

  it('syncRTSEntities mirrors an rts-sim RTSMatchState into the scene without disturbing the loaded WorldDocument (docs/RTS-CONTRACTS.md §6)', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);
    const docEntityCountBefore = engine.document!.entities.length;

    const match = createMatch({
      seed: 1,
      mapWidthM: 400,
      mapDepthM: 400,
      cellSizeM: 40,
      factions: [{ factionId: 'raven-alliance', isAIControlled: false }],
    });
    match.entities.units.push({
      id: 'u1',
      factionId: 'raven-alliance',
      unitClass: 'INFANTRY',
      transform: { position: { x: 10, y: 0, z: 10 }, rotationY: 0 },
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
    });

    // Never throws, and doesn't grow the authored WorldDocument's entity list (§6: RTS match
    // state is mirrored straight to the renderer, not round-tripped through the world document).
    expect(() => engine.syncRTSEntities(match)).not.toThrow();
    expect(engine.document!.entities.length).toBe(docEntityCountBefore);
    expect(engine.getEntity(rtsUnitEntityId('u1'))).toBeUndefined();

    // The engine keeps rendering normally afterward.
    expect(() => engine.tick(1 / 60)).not.toThrow();
    engine.dispose();
  });

  it('recordSnapshot returns JSON + a png field (empty string headless) without throwing', () => {
    const world = createSampleWorld('NEON_TOKYO_2099');
    const engine = makeEngine();
    engine.loadWorld(world);
    const snapshot = engine.recordSnapshot();
    expect(snapshot.json.worldId).toBe(world.id);
    expect(snapshot.json.entityCount).toBe(world.entities.length);
    expect(typeof snapshot.png).toBe('string');
    engine.dispose();
  });
});
