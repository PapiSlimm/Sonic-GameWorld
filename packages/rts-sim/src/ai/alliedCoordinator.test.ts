// §9 depth extension: allied-nation coordinated strikes, PRO difficulty only
// (docs/RTS-CONTRACTS.md §9). Covers map-control scoring, the strike-trigger threshold, command
// shape/determinism, and tickMatch's automatic wiring for a PRO faction with alliedFactionIds.
import { describe, expect, it } from 'vitest';
import { ALLIED_STRIKE_FORCE_SIZE, ALLIED_STRIKE_MAP_CONTROL_THRESHOLD, RTS_FACTIONS } from '../constants';
import { createMatch, tickMatch } from '../index';
import { createRng } from '../rng';
import { FACTION_A, FACTION_B, makeBuilding, makeMatch, makeUnit } from '../testFixtures';
import { computeMapControlScore, evaluateAlliedStrike } from './alliedCoordinator';

const ALLY = 'allied-faction-1';

describe('computeMapControlScore', () => {
  it('is 0 with no buildings on the map', () => {
    const state = makeMatch();
    expect(computeMapControlScore(state, FACTION_A)).toBe(0);
  });

  it('is the primary faction\'s share of all living buildings', () => {
    const state = makeMatch();
    state.entities.buildings.push(
      makeBuilding({ factionId: FACTION_A }),
      makeBuilding({ factionId: FACTION_A }),
      makeBuilding({ factionId: FACTION_A }),
      makeBuilding({ factionId: FACTION_B }),
    );
    expect(computeMapControlScore(state, FACTION_A)).toBeCloseTo(0.75, 5);
  });

  it('ignores destroyed buildings on both sides', () => {
    const state = makeMatch();
    state.entities.buildings.push(
      makeBuilding({ factionId: FACTION_A }),
      makeBuilding({ factionId: FACTION_B, health: 0 }),
    );
    expect(computeMapControlScore(state, FACTION_A)).toBe(1);
  });
});

describe('evaluateAlliedStrike', () => {
  function scenario(mapControlFraction: number) {
    const state = makeMatch();
    // 10 buildings total; mapControlFraction of them belong to the primary faction.
    const primaryCount = Math.round(mapControlFraction * 10);
    for (let i = 0; i < primaryCount; i++) state.entities.buildings.push(makeBuilding({ factionId: FACTION_A, cellX: i * 5, cellZ: 0 }));
    for (let i = primaryCount; i < 10; i++) state.entities.buildings.push(makeBuilding({ factionId: FACTION_B, cellX: i * 5, cellZ: 0, health: 500 }));
    return state;
  }

  it('returns no commands below the map-control threshold', () => {
    const state = scenario(ALLIED_STRIKE_MAP_CONTROL_THRESHOLD - 0.1);
    state.entities.units.push(makeUnit({ factionId: ALLY }));
    const commands = evaluateAlliedStrike(state, FACTION_A, [ALLY], createRng(1));
    expect(commands).toEqual([]);
  });

  it('returns an ATTACK batch once the threshold is crossed, one command per ally with living units', () => {
    const state = scenario(ALLIED_STRIKE_MAP_CONTROL_THRESHOLD + 0.1);
    for (let i = 0; i < ALLIED_STRIKE_FORCE_SIZE + 2; i++) state.entities.units.push(makeUnit({ factionId: ALLY }));

    const commands = evaluateAlliedStrike(state, FACTION_A, [ALLY], createRng(1));

    expect(commands).toHaveLength(1);
    expect(commands[0]!.type).toBe('ATTACK');
    expect(commands[0]!.unitIds.length).toBe(ALLIED_STRIKE_FORCE_SIZE);
    expect(commands[0]!.targetPos).toBeDefined();
  });

  it('skips an ally with no living units, rather than pushing an empty command', () => {
    const state = scenario(ALLIED_STRIKE_MAP_CONTROL_THRESHOLD + 0.1);
    // ALLY has no units at all.
    const commands = evaluateAlliedStrike(state, FACTION_A, [ALLY], createRng(1));
    expect(commands).toEqual([]);
  });

  it('caps contribution to ALLIED_STRIKE_FORCE_SIZE units even with a much larger army', () => {
    const state = scenario(ALLIED_STRIKE_MAP_CONTROL_THRESHOLD + 0.1);
    for (let i = 0; i < ALLIED_STRIKE_FORCE_SIZE * 4; i++) state.entities.units.push(makeUnit({ factionId: ALLY }));

    const commands = evaluateAlliedStrike(state, FACTION_A, [ALLY], createRng(1));
    expect(commands[0]!.unitIds.length).toBe(ALLIED_STRIKE_FORCE_SIZE);
  });

  it('targets the primary faction\'s weakest surviving building', () => {
    const state = makeMatch();
    const strong = makeBuilding({ factionId: FACTION_A, cellX: 0, cellZ: 0, health: 1000 });
    const weak = makeBuilding({ factionId: FACTION_A, cellX: 20, cellZ: 20, health: 10 });
    state.entities.buildings.push(strong, weak, makeBuilding({ factionId: FACTION_B, health: 0 }));
    state.entities.units.push(makeUnit({ factionId: ALLY }));

    const commands = evaluateAlliedStrike(state, FACTION_A, [ALLY], createRng(1));

    const expectedPos = {
      x: (weak.cellX + weak.sizeCells.w / 2) * state.map.cellSizeM,
      y: 0,
      z: (weak.cellZ + weak.sizeCells.d / 2) * state.map.cellSizeM,
    };
    expect(commands[0]!.targetPos).toEqual(expectedPos);
  });

  it('is deterministic given the same rng seed', () => {
    const state = scenario(ALLIED_STRIKE_MAP_CONTROL_THRESHOLD + 0.1);
    for (let i = 0; i < 8; i++) state.entities.units.push(makeUnit({ factionId: ALLY }));

    const a = evaluateAlliedStrike(state, FACTION_A, [ALLY], createRng(42));
    const b = evaluateAlliedStrike(state, FACTION_A, [ALLY], createRng(42));
    expect(a).toEqual(b);
  });

  it('caps at up to 3 allies even if more are given', () => {
    const state = scenario(ALLIED_STRIKE_MAP_CONTROL_THRESHOLD + 0.1);
    const allies = ['ally-1', 'ally-2', 'ally-3', 'ally-4'];
    for (const allyId of allies) state.entities.units.push(makeUnit({ factionId: allyId }));

    const commands = evaluateAlliedStrike(state, FACTION_A, allies, createRng(1));
    expect(commands).toHaveLength(3);
  });
});

describe('tickMatch wiring (Pro-only, docs/RTS-CONTRACTS.md §9)', () => {
  it('applies an allied strike automatically for a PRO faction with alliedFactionIds, through the normal command path', () => {
    const [ravenAlliance, unitedDragonNations] = RTS_FACTIONS;
    let state = createMatch({
      seed: 1,
      mapWidthM: 2000,
      mapDepthM: 2000,
      cellSizeM: 10,
      factions: [
        { factionId: ravenAlliance!.id, isAIControlled: false },
        { factionId: unitedDragonNations!.id, isAIControlled: true, difficulty: 'PRO', alliedFactionIds: [ALLY] },
      ],
    });

    // Dragon controls 2/3 of the map's buildings (above ALLIED_STRIKE_MAP_CONTROL_THRESHOLD);
    // Raven keeps just one, far away, so victorySystem doesn't fire early.
    state.entities.buildings.push(
      makeBuilding({ factionId: unitedDragonNations!.id, cellX: 5, cellZ: 5 }),
      makeBuilding({ factionId: unitedDragonNations!.id, cellX: 10, cellZ: 5 }),
      makeBuilding({ factionId: ravenAlliance!.id, cellX: 150, cellZ: 150 }),
    );
    state.entities.units.push(makeUnit({ factionId: ALLY, transform: { position: { x: 100, y: 0, z: 100 }, rotationY: 0 } }));

    // Advance to the first AI-think tick.
    for (let i = 0; i < 35; i++) state = tickMatch(state, 0.1, []);

    const allyUnit = state.entities.units.find((u) => u.factionId === ALLY)!;
    expect(allyUnit.commands.length).toBeGreaterThan(0);
    expect(allyUnit.commands[0]!.type).toBe('ATTACK');
  });

  it('does not run allied strikes for a faction without difficulty set (pre-§9 default, no behavior change)', () => {
    const [ravenAlliance, unitedDragonNations] = RTS_FACTIONS;
    let state = createMatch({
      seed: 1,
      mapWidthM: 2000,
      mapDepthM: 2000,
      cellSizeM: 10,
      factions: [
        { factionId: ravenAlliance!.id, isAIControlled: false },
        { factionId: unitedDragonNations!.id, isAIControlled: true, alliedFactionIds: [ALLY] }, // no difficulty
      ],
    });
    state.entities.buildings.push(makeBuilding({ factionId: unitedDragonNations!.id, cellX: 5, cellZ: 5 }));
    state.entities.units.push(makeUnit({ factionId: ALLY, transform: { position: { x: 100, y: 0, z: 100 }, rotationY: 0 } }));

    for (let i = 0; i < 35; i++) state = tickMatch(state, 0.1, []);

    const allyUnit = state.entities.units.find((u) => u.factionId === ALLY)!;
    expect(allyUnit.commands).toEqual([]);
  });
});
