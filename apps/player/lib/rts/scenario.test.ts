import { describe, expect, it } from 'vitest';
import { createMatch, RTS_FACTIONS, serializeMatch, stateHash } from '@sonic-gameworld/rts-sim';
import { seedStartingScenario } from './scenario';

function freshMatch(seed = 12345) {
  return createMatch({
    seed,
    mapWidthM: 2000,
    mapDepthM: 2000,
    cellSizeM: 40,
    factions: [
      { factionId: RTS_FACTIONS[0]!.id, isAIControlled: false },
      { factionId: RTS_FACTIONS[1]!.id, isAIControlled: true },
    ],
  });
}

describe('seedStartingScenario', () => {
  it('gives every faction a base (Refinery/Barracks/Factory) and a starting force', () => {
    const state = seedStartingScenario(freshMatch());
    for (const faction of state.factions) {
      const buildings = state.entities.buildings.filter((b) => b.factionId === faction.factionId);
      expect(buildings.map((b) => b.buildingClass).sort()).toEqual(['BARRACKS', 'FACTORY', 'REFINERY']);
      const units = state.entities.units.filter((u) => u.factionId === faction.factionId);
      expect(units.length).toBeGreaterThan(0);
    }
    expect(state.entities.resources.length).toBeGreaterThan(state.factions.length); // per-faction + neutral nodes
  });

  it('places factions at distinct locations, and marks building footprints occupied on the pathfinding grid', () => {
    const state = seedStartingScenario(freshMatch());
    const [factionA, factionB] = state.factions;
    const buildingA = state.entities.buildings.find((b) => b.factionId === factionA!.factionId)!;
    const buildingB = state.entities.buildings.find((b) => b.factionId === factionB!.factionId)!;
    expect(buildingA.cellX).not.toBe(buildingB.cellX);

    let anyOccupied = false;
    for (const value of state.map.occupancy) {
      if (value === 1) {
        anyOccupied = true;
        break;
      }
    }
    expect(anyOccupied).toBe(true);
  });

  it('is deterministic: the same seed + factions produce byte-identical scenarios on repeat runs', () => {
    const a = seedStartingScenario(freshMatch(999));
    const b = seedStartingScenario(freshMatch(999));
    expect(serializeMatch(a)).toBe(serializeMatch(b));
    expect(stateHash(a)).toBe(stateHash(b));
  });

  it('produces a different scenario for a different seed', () => {
    const a = seedStartingScenario(freshMatch(1));
    const b = seedStartingScenario(freshMatch(2));
    expect(stateHash(a)).not.toBe(stateHash(b));
  });

  it('advances rngState so the seeded rng stream continues correctly into tickMatch afterward', () => {
    const state = seedStartingScenario(freshMatch(42));
    expect(state.rngState).not.toBe(42 >>> 0);
  });
});
