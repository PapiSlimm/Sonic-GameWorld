import { describe, expect, it } from 'vitest';
import { FACTION_A, makeMatch, makeResourceNode, makeUnit } from '../testFixtures';
import { harvestingSystem } from './harvestingSystem';

describe('harvestingSystem', () => {
  it('accumulates harvested Sotolium on the unit and drains the node', () => {
    const state = makeMatch();
    const node = makeResourceNode({ amount: 1000 });
    state.entities.resources.push(node);
    const unit = makeUnit({ factionId: FACTION_A, state: 'HARVESTING', targetNodeId: node.id, harvestedSotolium: 0 });
    state.entities.units.push(unit);

    harvestingSystem(state, 1);

    expect(unit.harvestedSotolium).toBeGreaterThan(0);
    expect(node.amount).toBeLessThan(1000);
    expect(node.isBeingHarvested).toBe(true);
  });

  it('converts to credits once the batch threshold is reached, then resets the counter', () => {
    const state = makeMatch();
    const node = makeResourceNode({ amount: 1000 });
    state.entities.resources.push(node);
    const unit = makeUnit({ factionId: FACTION_A, state: 'HARVESTING', targetNodeId: node.id, harvestedSotolium: 39 });
    state.entities.units.push(unit);
    const creditsBefore = state.economy[FACTION_A]!.credits;

    harvestingSystem(state, 1); // +12.5 -> 51.5 >= 40 threshold

    expect(unit.harvestedSotolium).toBe(0);
    expect(state.economy[FACTION_A]!.credits).toBeGreaterThan(creditsBefore);
  });

  it('idles the unit and pops the HARVEST command once the node is depleted', () => {
    const state = makeMatch();
    const node = makeResourceNode({ amount: 0 });
    state.entities.resources.push(node);
    const unit = makeUnit({
      factionId: FACTION_A,
      state: 'HARVESTING',
      targetNodeId: node.id,
      commands: [{ type: 'HARVEST', targetId: node.id }],
    });
    state.entities.units.push(unit);

    harvestingSystem(state, 1);

    expect(unit.state).toBe('IDLE');
    expect(unit.targetNodeId).toBeNull();
    expect(unit.commands).toEqual([]);
  });

  it('ignores units that are not in the HARVESTING state', () => {
    const state = makeMatch();
    const node = makeResourceNode({ amount: 1000 });
    state.entities.resources.push(node);
    const unit = makeUnit({ factionId: FACTION_A, state: 'IDLE', targetNodeId: node.id });
    state.entities.units.push(unit);

    harvestingSystem(state, 1);

    expect(unit.harvestedSotolium).toBe(0);
    expect(node.amount).toBe(1000);
  });

  it('marks nodes with no active harvester as not being harvested', () => {
    const state = makeMatch();
    const activeNode = makeResourceNode({ amount: 1000 });
    const idleNode = makeResourceNode({ amount: 1000, isBeingHarvested: true });
    state.entities.resources.push(activeNode, idleNode);
    const unit = makeUnit({ factionId: FACTION_A, state: 'HARVESTING', targetNodeId: activeNode.id });
    state.entities.units.push(unit);

    harvestingSystem(state, 1);

    expect(idleNode.isBeingHarvested).toBe(false);
  });
});
