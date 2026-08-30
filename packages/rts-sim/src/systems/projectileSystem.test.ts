import { describe, expect, it } from 'vitest';
import { FACTION_A, FACTION_B, makeBuilding, makeMatch, makeUnit } from '../testFixtures';
import { projectileSystem } from './projectileSystem';

describe('projectileSystem', () => {
  it('advances a projectile toward its target', () => {
    const state = makeMatch();
    state.entities.projectiles.push({
      id: 'p1',
      position: { x: 0, y: 0, z: 0 },
      targetPosition: { x: 1000, y: 0, z: 0 },
      speed: 750,
      damage: 10,
      ownerId: 'owner',
      factionId: FACTION_A,
    });

    projectileSystem(state, 0.1);

    expect(state.entities.projectiles).toHaveLength(1);
    expect(state.entities.projectiles[0]!.position.x).toBeCloseTo(75, 0);
  });

  it('damages an enemy unit on impact and removes the projectile', () => {
    const state = makeMatch();
    const enemy = makeUnit({ factionId: FACTION_B, transform: { position: { x: 100, y: 0, z: 100 }, rotationY: 0 } });
    state.entities.units.push(enemy);
    const healthBefore = enemy.health;

    state.entities.projectiles.push({
      id: 'p1',
      position: { x: 100, y: 0, z: 100 },
      targetPosition: { x: 100, y: 0, z: 100 },
      speed: 750,
      damage: 25,
      ownerId: 'owner',
      factionId: FACTION_A,
    });

    projectileSystem(state, 0.1);

    expect(enemy.health).toBe(healthBefore - 25);
    expect(state.entities.projectiles).toHaveLength(0);
  });

  it('does not damage units of the same faction as the projectile', () => {
    const state = makeMatch();
    const friendly = makeUnit({ factionId: FACTION_A, transform: { position: { x: 100, y: 0, z: 100 }, rotationY: 0 } });
    state.entities.units.push(friendly);
    const healthBefore = friendly.health;

    state.entities.projectiles.push({
      id: 'p1',
      position: { x: 100, y: 0, z: 100 },
      targetPosition: { x: 100, y: 0, z: 100 },
      speed: 750,
      damage: 25,
      ownerId: 'owner',
      factionId: FACTION_A,
    });

    projectileSystem(state, 0.1);
    expect(friendly.health).toBe(healthBefore);
  });

  it('damages an enemy building whose footprint the impact lands in', () => {
    const state = makeMatch({ cellSizeM: 10 });
    const building = makeBuilding({ factionId: FACTION_B, buildingClass: 'BARRACKS', cellX: 5, cellZ: 5 });
    state.entities.buildings.push(building);
    const healthBefore = building.health;

    // Building footprint: cellX*10=50 .. +2*10=70, same for z.
    state.entities.projectiles.push({
      id: 'p1',
      position: { x: 60, y: 0, z: 60 },
      targetPosition: { x: 60, y: 0, z: 60 },
      speed: 750,
      damage: 40,
      ownerId: 'owner',
      factionId: FACTION_A,
    });

    projectileSystem(state, 0.1);
    expect(building.health).toBe(healthBefore - 40);
  });

  it('never reduces health below zero', () => {
    const state = makeMatch();
    const enemy = makeUnit({ factionId: FACTION_B, health: 5, transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } });
    state.entities.units.push(enemy);
    state.entities.projectiles.push({
      id: 'p1',
      position: { x: 0, y: 0, z: 0 },
      targetPosition: { x: 0, y: 0, z: 0 },
      speed: 750,
      damage: 999,
      ownerId: 'owner',
      factionId: FACTION_A,
    });

    projectileSystem(state, 0.1);
    expect(enemy.health).toBe(0);
  });
});
