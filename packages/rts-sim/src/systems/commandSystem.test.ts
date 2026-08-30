import { describe, expect, it } from 'vitest';
import { FACTION_A, FACTION_B, makeBuilding, makeMatch, makeResourceNode, makeUnit } from '../testFixtures';
import { applyCommand, commandSystem } from './commandSystem';

describe('applyCommand', () => {
  it('fans a multi-unit MOVE command out into each unit\'s own command queue', () => {
    const state = makeMatch();
    const u1 = makeUnit({ factionId: FACTION_A });
    const u2 = makeUnit({ factionId: FACTION_A });
    state.entities.units.push(u1, u2);

    applyCommand(state, { type: 'MOVE', unitIds: [u1.id, u2.id], targetPos: { x: 50, y: 0, z: 50 } });

    expect(u1.commands).toEqual([{ type: 'MOVE', targetPos: { x: 50, y: 0, z: 50 }, targetId: undefined }]);
    expect(u2.commands).toEqual([{ type: 'MOVE', targetPos: { x: 50, y: 0, z: 50 }, targetId: undefined }]);
  });

  it('ignores dead units and unknown ids', () => {
    const state = makeMatch();
    const dead = makeUnit({ factionId: FACTION_A, state: 'DEAD' });
    state.entities.units.push(dead);

    expect(() => applyCommand(state, { type: 'MOVE', unitIds: [dead.id, 'nope'], targetPos: { x: 1, y: 0, z: 1 } })).not.toThrow();
    expect(dead.commands).toEqual([]);
  });

  it('STOP clears commands, path, and target node, and sets IDLE', () => {
    const state = makeMatch();
    const unit = makeUnit({
      factionId: FACTION_A,
      state: 'MOVING',
      path: [{ x: 1, y: 0, z: 1 }],
      commands: [{ type: 'MOVE', targetPos: { x: 1, y: 0, z: 1 } }],
      targetNodeId: 'some-node',
    });
    state.entities.units.push(unit);

    applyCommand(state, { type: 'STOP', unitIds: [unit.id] });

    expect(unit.commands).toEqual([]);
    expect(unit.path).toEqual([]);
    expect(unit.targetNodeId).toBeNull();
    expect(unit.state).toBe('IDLE');
  });

  it('BUILD routes to the targeted building\'s faction via enqueueProduction instead of touching unitIds', () => {
    const state = makeMatch();
    const barracks = makeBuilding({ factionId: FACTION_A, buildingClass: 'BARRACKS' });
    state.entities.buildings.push(barracks);
    const creditsBefore = state.economy[FACTION_A]!.credits;

    applyCommand(state, { type: 'BUILD', unitIds: [], targetId: barracks.id, buildType: 'INFANTRY' });

    expect(state.productionQueue).toHaveLength(1);
    expect(state.productionQueue[0]!.factionId).toBe(FACTION_A);
    expect(state.economy[FACTION_A]!.credits).toBeLessThan(creditsBefore);
  });

  it('BUILD against a destroyed building is a no-op', () => {
    const state = makeMatch();
    const barracks = makeBuilding({ factionId: FACTION_A, buildingClass: 'BARRACKS', health: 0 });
    state.entities.buildings.push(barracks);

    applyCommand(state, { type: 'BUILD', unitIds: [], targetId: barracks.id, buildType: 'INFANTRY' });

    expect(state.productionQueue).toHaveLength(0);
  });
});

describe('commandSystem (per-tick progression)', () => {
  it('assigns a path for a MOVE command and transitions to MOVING', () => {
    const state = makeMatch();
    const unit = makeUnit({
      factionId: FACTION_A,
      transform: { position: { x: 5, y: 0, z: 5 }, rotationY: 0 },
      commands: [{ type: 'MOVE', targetPos: { x: 195, y: 0, z: 5 } }],
    });
    state.entities.units.push(unit);

    commandSystem(state);

    expect(unit.state).toBe('MOVING');
    expect(unit.path.length).toBeGreaterThan(0);
  });

  it('HARVEST: paths toward a distant node, then switches to HARVESTING once in range', () => {
    const state = makeMatch();
    const node = makeResourceNode({ position: { x: 20, y: 0, z: 20 } });
    state.entities.resources.push(node);

    // HARVEST_RANGE is 60 world units — start well outside it.
    const far = makeUnit({
      factionId: FACTION_A,
      transform: { position: { x: 300, y: 0, z: 300 }, rotationY: 0 },
      commands: [{ type: 'HARVEST', targetId: node.id }],
    });
    state.entities.units.push(far);
    commandSystem(state);
    expect(far.state).toBe('MOVING');

    const near = makeUnit({
      factionId: FACTION_A,
      transform: { position: { x: 21, y: 0, z: 21 } , rotationY: 0 },
      commands: [{ type: 'HARVEST', targetId: node.id }],
    });
    state.entities.units.push(near);
    commandSystem(state);
    expect(near.state).toBe('HARVESTING');
    expect(near.targetNodeId).toBe(node.id);
  });

  it('HARVEST against a depleted node pops the command and goes IDLE', () => {
    const state = makeMatch();
    const node = makeResourceNode({ amount: 0, position: { x: 10, y: 0, z: 10 } });
    state.entities.resources.push(node);
    const unit = makeUnit({
      factionId: FACTION_A,
      transform: { position: { x: 10, y: 0, z: 10 }, rotationY: 0 },
      commands: [{ type: 'HARVEST', targetId: node.id }],
    });
    state.entities.units.push(unit);

    commandSystem(state);

    expect(unit.commands).toEqual([]);
    expect(unit.state).toBe('IDLE');
  });

  it('ATTACK: chases a target while out of range, holds and attacks once in range', () => {
    const state = makeMatch();
    const attacker = makeUnit({
      factionId: FACTION_A,
      unitClass: 'INFANTRY',
      transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 },
    });
    const target = makeUnit({
      factionId: FACTION_B,
      transform: { position: { x: 190, y: 0, z: 0 }, rotationY: 0 },
    });
    attacker.commands = [{ type: 'ATTACK', targetId: target.id }];
    state.entities.units.push(attacker, target);

    commandSystem(state);
    expect(attacker.state).toBe('MOVING');
    expect(attacker.path.length).toBeGreaterThan(0);

    // Move the target within attackRange (160 for infantry) and re-run.
    target.transform.position.x = 50;
    attacker.path = [];
    commandSystem(state);
    expect(attacker.state).toBe('ATTACKING');
    expect(attacker.path).toEqual([]);
  });

  it('idle units with no commands remain IDLE and stopped units become IDLE once their queue drains', () => {
    const state = makeMatch();
    const unit = makeUnit({ factionId: FACTION_A, state: 'MOVING', commands: [] });
    state.entities.units.push(unit);
    commandSystem(state);
    expect(unit.state).toBe('IDLE');
  });

  it('never touches dead units', () => {
    const state = makeMatch();
    const dead = makeUnit({
      factionId: FACTION_A,
      state: 'DEAD',
      commands: [{ type: 'MOVE', targetPos: { x: 1, y: 0, z: 1 } }],
    });
    state.entities.units.push(dead);
    commandSystem(state);
    expect(dead.path).toEqual([]);
  });
});
