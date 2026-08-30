import { beforeEach, describe, expect, it } from 'vitest';
import { createSampleWorld, SAMPLE_OWNER_ID } from '@sonic-gameworld/world-schema';
import { documentToWorldMeta } from './offline';
import { useStudioStore } from './store';

function reset() {
  const doc = createSampleWorld('NEON_TOKYO_2099');
  useStudioStore.getState().loadWorld(doc, documentToWorldMeta(doc), true);
}

describe('studio store', () => {
  beforeEach(reset);

  it('loads the offline sample world with no pending history', () => {
    const s = useStudioStore.getState();
    expect(s.document?.entities.length).toBeGreaterThan(0);
    expect(s.canUndo()).toBe(false);
    expect(s.canRedo()).toBe(false);
    expect(s.dirty).toBe(false);
  });

  it('commits an entity update, marks dirty, and supports undo/redo', () => {
    const s = useStudioStore.getState();
    const entity = s.document!.entities[0]!;
    const originalName = entity.name;

    s.updateEntity(entity.id, { name: 'Renamed Entity' });

    let state = useStudioStore.getState();
    expect(state.document!.entities.find((e) => e.id === entity.id)!.name).toBe('Renamed Entity');
    expect(state.dirty).toBe(true);
    expect(state.canUndo()).toBe(true);
    expect(state.canRedo()).toBe(false);

    state.undo();
    state = useStudioStore.getState();
    expect(state.document!.entities.find((e) => e.id === entity.id)!.name).toBe(originalName);
    expect(state.canUndo()).toBe(false);
    expect(state.canRedo()).toBe(true);

    state.redo();
    state = useStudioStore.getState();
    expect(state.document!.entities.find((e) => e.id === entity.id)!.name).toBe('Renamed Entity');
    expect(state.canUndo()).toBe(true);
    expect(state.canRedo()).toBe(false);
  });

  it('branches history: a new commit after undo discards the redo stack', () => {
    const s = useStudioStore.getState();
    const entity = s.document!.entities[0]!;

    s.updateEntity(entity.id, { name: 'First Edit' });
    useStudioStore.getState().undo();
    useStudioStore.getState().updateEntity(entity.id, { name: 'Second Edit' });

    const state = useStudioStore.getState();
    expect(state.document!.entities.find((e) => e.id === entity.id)!.name).toBe('Second Edit');
    expect(state.canRedo()).toBe(false);
  });

  it('adds and removes entities (with descendant cleanup) through the undo stack', () => {
    const s = useStudioStore.getState();
    const parent = s.document!.entities[0]!;
    const childId = `${parent.id}-child-test`;
    s.addEntity({
      id: childId,
      kind: 'PROP',
      name: 'Test Prop',
      parentId: parent.id,
      transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
      tags: [],
      permissions: { ownerId: SAMPLE_OWNER_ID, editors: [], visibility: 'PRIVATE' },
      metadata: {},
    });
    expect(useStudioStore.getState().document!.entities.some((e) => e.id === childId)).toBe(true);

    useStudioStore.getState().removeEntity(childId);
    expect(useStudioStore.getState().document!.entities.some((e) => e.id === childId)).toBe(false);

    useStudioStore.getState().undo();
    expect(useStudioStore.getState().document!.entities.some((e) => e.id === childId)).toBe(true);
  });

  it('caps history at 50 frames', () => {
    const s = useStudioStore.getState();
    const entity = s.document!.entities[0]!;
    for (let i = 0; i < 60; i += 1) {
      useStudioStore.getState().updateEntity(entity.id, { name: `Name ${i}` });
    }
    expect(useStudioStore.getState().past.length).toBe(50);
  });

  it('ignores no-op commits so an unchanged document does not pollute history', () => {
    const s = useStudioStore.getState();
    s.commitDocument(s.document!, 'no-op');
    expect(useStudioStore.getState().past.length).toBe(0);
  });

  it('places RTS_UNIT/RTS_BUILDING entities and persists faction assignment (docs/RTS-CONTRACTS.md §6)', () => {
    const s = useStudioStore.getState();
    s.addEntity({
      id: 'rts-unit-test',
      kind: 'RTS_UNIT',
      name: 'Rifleman Squad',
      transform: { position: { x: 10, y: 0, z: 10 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
      tags: [],
      permissions: { ownerId: SAMPLE_OWNER_ID, editors: [], visibility: 'PRIVATE' },
      metadata: {},
    });
    s.addEntity({
      id: 'rts-building-test',
      kind: 'RTS_BUILDING',
      name: 'Barracks',
      transform: { position: { x: 20, y: 0, z: 20 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
      tags: [],
      permissions: { ownerId: SAMPLE_OWNER_ID, editors: [], visibility: 'PRIVATE' },
      metadata: {},
    });

    // Faction/unitClass assignment (the Inspector's "RTS placement" fields) round-trips through
    // the same generic behavior.params bag every other entity kind already uses.
    useStudioStore.getState().updateEntity('rts-unit-test', {
      behavior: { params: { factionId: 'raven-alliance', unitClass: 'INFANTRY' } },
    });
    useStudioStore.getState().updateEntity('rts-building-test', {
      behavior: { params: { factionId: 'united-dragon-nations', buildingClass: 'BARRACKS' } },
    });

    const doc = useStudioStore.getState().document!;
    const unit = doc.entities.find((e) => e.id === 'rts-unit-test')!;
    const building = doc.entities.find((e) => e.id === 'rts-building-test')!;
    expect(unit.behavior?.params.factionId).toBe('raven-alliance');
    expect(unit.behavior?.params.unitClass).toBe('INFANTRY');
    expect(building.behavior?.params.factionId).toBe('united-dragon-nations');
    expect(building.behavior?.params.buildingClass).toBe('BARRACKS');
  });
});
