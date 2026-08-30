import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { FACTION_A, FACTION_B, makeMatch, makeUnit } from '../testFixtures';
import { combatSystem } from './combatSystem';
import { buildSpatialGridForUnits } from './spatialGrid';

describe('combatSystem', () => {
  it('fires a projectile at the nearest in-range enemy', () => {
    const state = makeMatch();
    // ARMORED's 240 range reaches the enemy; the enemy's own 160 INFANTRY range doesn't reach
    // back at this distance, so only the shooter fires (isolates one-directional targeting).
    const shooter = makeUnit({
      factionId: FACTION_A,
      unitClass: 'ARMORED',
      transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 },
    });
    const enemy = makeUnit({
      factionId: FACTION_B,
      transform: { position: { x: 200, y: 0, z: 0 }, rotationY: 0 },
    });
    state.entities.units.push(shooter, enemy);

    const grid = buildSpatialGridForUnits(state.entities.units);
    combatSystem(state, 0.1, grid, createRng(1));

    expect(state.entities.projectiles).toHaveLength(1);
    expect(state.entities.projectiles[0]!.ownerId).toBe(shooter.id);
    expect(shooter.state).toBe('ATTACKING');
  });

  it('does not fire at units of the same faction', () => {
    const state = makeMatch();
    const a = makeUnit({ factionId: FACTION_A, transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } });
    const b = makeUnit({ factionId: FACTION_A, transform: { position: { x: 20, y: 0, z: 0 }, rotationY: 0 } });
    state.entities.units.push(a, b);

    const grid = buildSpatialGridForUnits(state.entities.units);
    combatSystem(state, 0.1, grid, createRng(1));

    expect(state.entities.projectiles).toHaveLength(0);
  });

  it('respects the fire cooldown', () => {
    const state = makeMatch();
    const shooter = makeUnit({ factionId: FACTION_A, transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 }, lastFiredAtTick: 0 });
    // The enemy is also within its own cooldown, so it can't return fire and confound the assertion.
    const enemy = makeUnit({ factionId: FACTION_B, transform: { position: { x: 20, y: 0, z: 0 }, rotationY: 0 }, lastFiredAtTick: 0 });
    state.entities.units.push(shooter, enemy);
    state.tick = 1; // within cooldown of lastFiredAtTick=0 (cooldown is 10 ticks at 10Hz)

    const grid = buildSpatialGridForUnits(state.entities.units);
    combatSystem(state, 0.1, grid, createRng(1));

    expect(state.entities.projectiles).toHaveLength(0);
  });

  it('ignores dead enemies and does not fire from dead or possessed units', () => {
    const state = makeMatch();
    const shooter = makeUnit({ factionId: FACTION_A, transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } });
    const deadEnemy = makeUnit({ factionId: FACTION_B, state: 'DEAD', transform: { position: { x: 20, y: 0, z: 0 }, rotationY: 0 } });
    state.entities.units.push(shooter, deadEnemy);

    const grid = buildSpatialGridForUnits(state.entities.units);
    combatSystem(state, 0.1, grid, createRng(1));
    expect(state.entities.projectiles).toHaveLength(0);

    // A living enemy is free to fire on its own — what this asserts is specifically that the
    // *possessed* shooter contributes no projectile of its own.
    const livingEnemy = makeUnit({ factionId: FACTION_B, transform: { position: { x: 20, y: 0, z: 0 }, rotationY: 0 } });
    state.entities.units.push(livingEnemy);
    state.possessedUnitIds = [shooter.id];
    const grid2 = buildSpatialGridForUnits(state.entities.units);
    combatSystem(state, 0.1, grid2, createRng(1));
    expect(state.entities.projectiles.some((p) => p.ownerId === shooter.id)).toBe(false);
  });

  it('cools heat down over time when not firing', () => {
    const state = makeMatch();
    const unit = makeUnit({ factionId: FACTION_A, heat: 1.0, transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } });
    state.entities.units.push(unit);

    const grid = buildSpatialGridForUnits(state.entities.units);
    combatSystem(state, 1, grid, createRng(1));

    expect(unit.heat).toBeLessThan(1.0);
  });

  it('AIR and ground units can target each other regardless of height (XZ-only range)', () => {
    const state = makeMatch();
    // AIR's 300 range reaches the ground enemy; the ground unit's own 160 INFANTRY range doesn't
    // reach back at this distance, isolating one-directional targeting despite the height gap.
    const airShooter = makeUnit({
      factionId: FACTION_A,
      unitClass: 'AIR',
      transform: { position: { x: 0, y: 30, z: 0 }, rotationY: 0 },
    });
    const groundEnemy = makeUnit({
      factionId: FACTION_B,
      transform: { position: { x: 220, y: 0, z: 0 }, rotationY: 0 },
    });
    state.entities.units.push(airShooter, groundEnemy);

    const grid = buildSpatialGridForUnits(state.entities.units);
    combatSystem(state, 0.1, grid, createRng(1));

    expect(state.entities.projectiles).toHaveLength(1);
  });
});
