import { describe, expect, it } from 'vitest';
import { FACTION_A, FACTION_B, makeMatch, makeUnit } from '../testFixtures';
import { fogOfWarSystem } from './fogOfWarSystem';

describe('fogOfWarSystem', () => {
  it('transitions a unit whose health reached zero to DEAD and clears its motion/orders', () => {
    const state = makeMatch();
    const unit = makeUnit({
      factionId: FACTION_A,
      health: 0,
      state: 'ATTACKING',
      velocity: { x: 5, y: 0, z: 5 },
      path: [{ x: 1, y: 0, z: 1 }],
      commands: [{ type: 'MOVE', targetPos: { x: 1, y: 0, z: 1 } }],
    });
    state.entities.units.push(unit);

    fogOfWarSystem(state, [FACTION_A]);

    expect(unit.state).toBe('DEAD');
    expect(unit.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(unit.path).toEqual([]);
    expect(unit.commands).toEqual([]);
  });

  it('does not re-transition an already-dead unit', () => {
    const state = makeMatch();
    const unit = makeUnit({ factionId: FACTION_A, health: 0, state: 'DEAD' });
    state.entities.units.push(unit);
    expect(() => fogOfWarSystem(state, [FACTION_A])).not.toThrow();
    expect(unit.state).toBe('DEAD');
  });

  it('always marks a viewer faction\'s own units as detected', () => {
    const state = makeMatch();
    const own = makeUnit({ factionId: FACTION_A, transform: { position: { x: 9999, y: 0, z: 9999 }, rotationY: 0 } });
    state.entities.units.push(own);
    fogOfWarSystem(state, [FACTION_A]);
    expect(own.isDetected).toBe(true);
  });

  it('marks an enemy unit outside detection radius as not detected, and inside as detected', () => {
    const state = makeMatch();
    const viewer = makeUnit({ factionId: FACTION_A, transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } });
    const nearEnemy = makeUnit({ factionId: FACTION_B, transform: { position: { x: 10, y: 0, z: 10 }, rotationY: 0 } });
    const farEnemy = makeUnit({ factionId: FACTION_B, transform: { position: { x: 100000, y: 0, z: 100000 }, rotationY: 0 } });
    state.entities.units.push(viewer, nearEnemy, farEnemy);

    fogOfWarSystem(state, [FACTION_A]);

    expect(nearEnemy.isDetected).toBe(true);
    expect(farEnemy.isDetected).toBe(false);
  });

  it('computes no visibility (all false) when there are no viewer factions', () => {
    const state = makeMatch();
    const unit = makeUnit({ factionId: FACTION_A, transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } });
    state.entities.units.push(unit);

    fogOfWarSystem(state, []);
    expect(unit.isDetected).toBe(false);
  });
});
