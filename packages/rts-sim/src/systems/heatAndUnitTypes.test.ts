// §9 depth extension: expanded unit roster (RTS_UNIT_TYPE_STATS) + heat/munition wiring
// (docs/RTS-CONTRACTS.md §9). Covers the lookup table itself, per-unitType heat accumulation on
// fire (combatSystem), per-unitType cooling, and enqueueProduction/tryEnqueueProduction actually
// applying unitType-specific cost/stats on spawn.
import { describe, expect, it } from 'vitest';
import { PRODUCTION_DURATION_TICKS, RTS_UNIT_STATS, RTS_UNIT_TYPE_STATS } from '../constants';
import { createRng } from '../rng';
import { FACTION_A, FACTION_B, makeBuilding, makeMatch, makeUnit } from '../testFixtures';
import { combatSystem } from './combatSystem';
import { enqueueProduction, productionSystem, tryEnqueueProduction } from './productionSystem';
import { buildSpatialGridForUnits } from './spatialGrid';

describe('RTS_UNIT_TYPE_STATS', () => {
  it('has 6 infantry archetypes and 10 vehicle/ship/air archetypes, each mapped to a valid UnitClass', () => {
    const entries = Object.entries(RTS_UNIT_TYPE_STATS);
    const infantry = entries.filter(([, s]) => s.unitClass === 'INFANTRY');
    const nonInfantry = entries.filter(([, s]) => s.unitClass !== 'INFANTRY');

    expect(infantry).toHaveLength(6);
    expect(nonInfantry).toHaveLength(10);
    for (const [, stats] of entries) {
      expect(['INFANTRY', 'ARMORED', 'AIR']).toContain(stats.unitClass);
      expect(stats.cost).toBeGreaterThan(0);
      expect(stats.health).toBeGreaterThan(0);
      expect(['BALLISTIC', 'RAILGUN', 'PLASMA']).toContain(stats.munition);
    }
  });

  it('flags exactly the 4 naval archetypes as navalOnly', () => {
    const naval = Object.entries(RTS_UNIT_TYPE_STATS).filter(([, s]) => s.navalOnly);
    expect(naval.map(([name]) => name).sort()).toEqual(['DESTROYER', 'FRIGATE', 'RAILGUN_CRUISER', 'TRANSPORT_SHIP'].sort());
  });
});

describe('per-unitType heat wiring (combatSystem)', () => {
  it('accumulates heat per shot using the unitType entry instead of the plain unitClass default', () => {
    const state = makeMatch();
    // BOMBER_DRONE (PLASMA, heatPerShot 0.5) vs the plain AIR default (0.2) — a big enough gap
    // that using the wrong table would be obvious in the assertion below.
    const shooter = makeUnit({
      factionId: FACTION_A,
      unitClass: 'AIR',
      unitType: 'BOMBER_DRONE',
      transform: { position: { x: 0, y: 30, z: 0 }, rotationY: 0 },
    });
    const enemy = makeUnit({ factionId: FACTION_B, transform: { position: { x: 200, y: 0, z: 0 }, rotationY: 0 } });
    state.entities.units.push(shooter, enemy);

    const grid = buildSpatialGridForUnits(state.entities.units);
    combatSystem(state, 0.1, grid, createRng(1));

    expect(shooter.heat).toBeCloseTo(RTS_UNIT_TYPE_STATS.BOMBER_DRONE!.heatPerShot, 5);
    expect(shooter.heat).not.toBeCloseTo(RTS_UNIT_STATS.AIR.heatPerShot, 5);
  });

  it('falls back to the plain RTS_UNIT_STATS heatPerShot when no unitType is set (unchanged pre-§9 behavior)', () => {
    const state = makeMatch();
    const shooter = makeUnit({ factionId: FACTION_A, unitClass: 'AIR', transform: { position: { x: 0, y: 30, z: 0 }, rotationY: 0 } });
    const enemy = makeUnit({ factionId: FACTION_B, transform: { position: { x: 200, y: 0, z: 0 }, rotationY: 0 } });
    state.entities.units.push(shooter, enemy);

    const grid = buildSpatialGridForUnits(state.entities.units);
    combatSystem(state, 0.1, grid, createRng(1));

    expect(shooter.heat).toBeCloseTo(RTS_UNIT_STATS.AIR.heatPerShot, 5);
  });

  it('cools using the unitType-specific coolingRate instead of the global COOLING_RATE', () => {
    const state = makeMatch();
    // RECON_DRONE has a fast coolingRate (0.7) — well above the global COOLING_RATE (0.4).
    const unit = makeUnit({ factionId: FACTION_A, unitClass: 'AIR', unitType: 'RECON_DRONE', heat: 1.0, transform: { position: { x: 0, y: 30, z: 0 }, rotationY: 0 } });
    state.entities.units.push(unit);

    const grid = buildSpatialGridForUnits(state.entities.units);
    combatSystem(state, 1, grid, createRng(1));

    expect(unit.heat).toBeCloseTo(1.0 - RTS_UNIT_TYPE_STATS.RECON_DRONE!.coolingRate, 5);
  });
});

describe('unitType-aware production (§9 economy layering)', () => {
  it('deducts the unitType-specific cost, not the plain unitClass cost', () => {
    const state = makeMatch();
    const creditsBefore = state.economy[FACTION_A]!.credits;

    const ok = enqueueProduction(state, FACTION_A, 'INFANTRY', 0, undefined, 'SNIPER');

    expect(ok).toBe(true);
    expect(state.economy[FACTION_A]!.credits).toBe(creditsBefore - RTS_UNIT_TYPE_STATS.SNIPER!.cost);
  });

  it('spawns a unit with the requested unitType and its layered health/damage/speed', () => {
    const state = makeMatch();
    const barracks = makeBuilding({ factionId: FACTION_A, buildingClass: 'BARRACKS' });
    state.entities.buildings.push(barracks);
    enqueueProduction(state, FACTION_A, 'INFANTRY', 0, barracks.id, 'SNIPER');

    state.tick = PRODUCTION_DURATION_TICKS;
    productionSystem(state, createRng(1));

    expect(state.entities.units).toHaveLength(1);
    const sniper = state.entities.units[0]!;
    expect(sniper.unitType).toBe('SNIPER');
    expect(sniper.health).toBe(RTS_UNIT_TYPE_STATS.SNIPER!.health);
    expect(sniper.damage).toBe(RTS_UNIT_TYPE_STATS.SNIPER!.damage);
    // Range/detection stay driven by the plain unitClass table — the combat-resolution axis.
    expect(sniper.attackRange).toBe(RTS_UNIT_STATS.INFANTRY.attackRange);
  });

  it('rejects a naval unitType on a non-SEA map with NAVAL_REQUIRES_SEA_BIOME', () => {
    const state = makeMatch(); // default biome is URBAN
    const result = tryEnqueueProduction(state, FACTION_A, 'ARMORED', 0, undefined, 'DESTROYER');
    expect(result).toEqual({ ok: false, reason: 'NAVAL_REQUIRES_SEA_BIOME' });
    expect(state.productionQueue).toHaveLength(0);
  });

  it('allows a naval unitType on a SEA map', () => {
    const state = makeMatch({ biome: 'SEA' });
    const result = tryEnqueueProduction(state, FACTION_A, 'ARMORED', 0, undefined, 'DESTROYER');
    expect(result.ok).toBe(true);
  });
});
