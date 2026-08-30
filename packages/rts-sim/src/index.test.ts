import { describe, expect, it } from 'vitest';
import {
  createMatch,
  deserializeMatch,
  enqueueProduction,
  RTS_BUILDING_STATS,
  RTS_FACTIONS,
  RTS_UNIT_STATS,
  runCommanderAI,
  serializeMatch,
  stateHash,
  tickMatch,
} from './index';

describe('public API smoke test', () => {
  it('createMatch builds a valid empty match from the pinned options shape', () => {
    const state = createMatch({
      seed: 1,
      mapWidthM: 200,
      mapDepthM: 200,
      cellSizeM: 10,
      factions: [
        { factionId: RTS_FACTIONS[0]!.id, isAIControlled: false },
        { factionId: RTS_FACTIONS[1]!.id, isAIControlled: true },
      ],
    });

    expect(state.status).toBe('PLAYING');
    expect(state.tick).toBe(0);
    expect(state.map.gridWidth).toBe(20);
    expect(state.map.gridDepth).toBe(20);
    expect(state.map.occupancy).toBeInstanceOf(Uint8Array);
    expect(state.economy[RTS_FACTIONS[0]!.id]!.credits).toBeGreaterThan(0);
    expect(state.entities.units).toEqual([]);
  });

  it('tickMatch advances tick/sessionTime and is exposed with the exact pinned signature', () => {
    const state = createMatch({
      seed: 1,
      mapWidthM: 100,
      mapDepthM: 100,
      cellSizeM: 10,
      factions: [{ factionId: RTS_FACTIONS[0]!.id, isAIControlled: false }],
    });

    const next = tickMatch(state, 0.1, []);
    expect(next.tick).toBe(1);
    expect(next.sessionTime).toBeCloseTo(0.1);
    expect(state.tick).toBe(0); // original untouched
  });

  it('serializeMatch/deserializeMatch round-trips a match including its Uint8Array occupancy grid', () => {
    const state = createMatch({
      seed: 5,
      mapWidthM: 100,
      mapDepthM: 100,
      cellSizeM: 10,
      factions: [{ factionId: RTS_FACTIONS[0]!.id, isAIControlled: false }],
    });
    state.map.occupancy[3] = 1;

    const json = serializeMatch(state);
    expect(typeof json).toBe('string');
    const restored = deserializeMatch(json);

    expect(restored.map.occupancy).toBeInstanceOf(Uint8Array);
    expect(restored.map.occupancy[3]).toBe(1);
    expect(restored).toEqual(state);
  });

  it('stateHash is stable for equal states and returns a hex string', () => {
    const state = createMatch({
      seed: 9,
      mapWidthM: 100,
      mapDepthM: 100,
      cellSizeM: 10,
      factions: [{ factionId: RTS_FACTIONS[0]!.id, isAIControlled: false }],
    });
    const hash1 = stateHash(state);
    const hash2 = stateHash(deserializeMatch(serializeMatch(state)));
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{8}$/);
  });

  it('exports RTS_UNIT_STATS for all three unit classes and RTS_FACTIONS with the expected lore names', () => {
    expect(Object.keys(RTS_UNIT_STATS).sort()).toEqual(['AIR', 'ARMORED', 'INFANTRY']);
    const names = RTS_FACTIONS.map((f) => f.name);
    expect(names).toContain('Raven Alliance');
    expect(names).toContain('United Dragon Nations');
  });

  it('exports RTS_BUILDING_STATS for all five building classes', () => {
    expect(Object.keys(RTS_BUILDING_STATS).sort()).toEqual(['AIRFIELD', 'BARRACKS', 'FACTORY', 'RADAR', 'REFINERY']);
  });

  it('exports enqueueProduction and runCommanderAI as documented command-adjacent APIs', () => {
    expect(typeof enqueueProduction).toBe('function');
    expect(typeof runCommanderAI).toBe('function');
  });
});
