import { describe, expect, it } from 'vitest';
import { PRODUCTION_DURATION_TICKS, RTS_UNIT_STATS } from '../constants';
import { createRng } from '../rng';
import { FACTION_A, makeBuilding, makeMatch } from '../testFixtures';
import { enqueueProduction, productionSystem } from './productionSystem';

describe('enqueueProduction', () => {
  it('deducts credits immediately and queues the order', () => {
    const state = makeMatch();
    const creditsBefore = state.economy[FACTION_A]!.credits;

    const ok = enqueueProduction(state, FACTION_A, 'INFANTRY', 0);

    expect(ok).toBe(true);
    expect(state.economy[FACTION_A]!.credits).toBe(creditsBefore - RTS_UNIT_STATS.INFANTRY.cost);
    expect(state.productionQueue).toHaveLength(1);
    expect(state.productionQueue[0]!.durationTicks).toBe(PRODUCTION_DURATION_TICKS);
  });

  it('refuses when the faction cannot afford it', () => {
    const state = makeMatch();
    state.economy[FACTION_A]!.credits = 0;

    const ok = enqueueProduction(state, FACTION_A, 'ARMORED', 0);

    expect(ok).toBe(false);
    expect(state.productionQueue).toHaveLength(0);
  });
});

describe('productionSystem', () => {
  it('spawns a unit at the producing building once duration elapses', () => {
    const state = makeMatch();
    const barracks = makeBuilding({ factionId: FACTION_A, buildingClass: 'BARRACKS', cellX: 2, cellZ: 2 });
    state.entities.buildings.push(barracks);
    enqueueProduction(state, FACTION_A, 'INFANTRY', 0, barracks.id);

    state.tick = PRODUCTION_DURATION_TICKS; // exactly due

    productionSystem(state, createRng(1));

    expect(state.productionQueue).toHaveLength(0);
    expect(state.entities.units).toHaveLength(1);
    expect(state.entities.units[0]!.factionId).toBe(FACTION_A);
    expect(state.entities.units[0]!.unitClass).toBe('INFANTRY');
  });

  it('leaves orders that are not yet due in the queue', () => {
    const state = makeMatch();
    const barracks = makeBuilding({ factionId: FACTION_A, buildingClass: 'BARRACKS' });
    state.entities.buildings.push(barracks);
    enqueueProduction(state, FACTION_A, 'INFANTRY', 0, barracks.id);

    state.tick = PRODUCTION_DURATION_TICKS - 1;
    productionSystem(state, createRng(1));

    expect(state.productionQueue).toHaveLength(1);
    expect(state.entities.units).toHaveLength(0);
  });

  it('falls back to any surviving faction building if the original producer was destroyed', () => {
    const state = makeMatch();
    const barracks = makeBuilding({ factionId: FACTION_A, buildingClass: 'BARRACKS' });
    const factory = makeBuilding({ factionId: FACTION_A, buildingClass: 'FACTORY' });
    state.entities.buildings.push(barracks, factory);
    enqueueProduction(state, FACTION_A, 'INFANTRY', 0, barracks.id);

    // Original producer destroyed mid-build.
    barracks.health = 0;
    state.tick = PRODUCTION_DURATION_TICKS;
    productionSystem(state, createRng(1));

    expect(state.entities.units).toHaveLength(1);
  });

  it('refunds credits when no building survives to spawn from (deviation from the reference)', () => {
    const state = makeMatch();
    const barracks = makeBuilding({ factionId: FACTION_A, buildingClass: 'BARRACKS' });
    state.entities.buildings.push(barracks);
    enqueueProduction(state, FACTION_A, 'INFANTRY', 0, barracks.id);
    const creditsAfterEnqueue = state.economy[FACTION_A]!.credits;

    state.entities.buildings = []; // every building for this faction is gone
    state.tick = PRODUCTION_DURATION_TICKS;
    productionSystem(state, createRng(1));

    expect(state.entities.units).toHaveLength(0);
    expect(state.economy[FACTION_A]!.credits).toBe(creditsAfterEnqueue + RTS_UNIT_STATS.INFANTRY.cost);
  });

  it('generates deterministic unit ids from the shared rng', () => {
    const state1 = makeMatch();
    const b1 = makeBuilding({ factionId: FACTION_A, buildingClass: 'BARRACKS' });
    state1.entities.buildings.push(b1);
    enqueueProduction(state1, FACTION_A, 'INFANTRY', 0, b1.id);
    state1.tick = PRODUCTION_DURATION_TICKS;
    productionSystem(state1, createRng(42));

    const state2 = makeMatch();
    const b2 = makeBuilding({ factionId: FACTION_A, buildingClass: 'BARRACKS' });
    state2.entities.buildings.push(b2);
    enqueueProduction(state2, FACTION_A, 'INFANTRY', 0, b2.id);
    state2.tick = PRODUCTION_DURATION_TICKS;
    productionSystem(state2, createRng(42));

    expect(state1.entities.units[0]!.id).toBe(state2.entities.units[0]!.id);
  });
});
