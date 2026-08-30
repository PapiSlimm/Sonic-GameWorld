// §9 depth extension: difficulty presets applied to runCommanderAI (docs/RTS-CONTRACTS.md §9).
// Verifies presets measurably change AI behavior (production threshold, attack aggression) and
// that omitting a difficulty entirely reproduces the exact pre-§9 behavior.
import { describe, expect, it } from 'vitest';
import { AI_PRODUCTION_CREDIT_THRESHOLD, RTS_DIFFICULTY_PRESETS } from '../constants';
import { createRng } from '../rng';
import { FACTION_A, FACTION_B, makeBuilding, makeMatch, makeUnit, resetTestIds } from '../testFixtures';
import { runCommanderAI } from './commanderAI';

describe('difficulty presets (§9)', () => {
  it('omitting difficulty entirely reproduces the exact pre-§9 behavior (no options object)', () => {
    const state = makeMatch();
    const mine = makeUnit({ factionId: FACTION_A, unitClass: 'ARMORED', state: 'IDLE' });
    const enemy = makeUnit({ factionId: FACTION_B });
    state.entities.units.push(mine, enemy);

    const withoutOptions = runCommanderAI(state, FACTION_A, createRng(5));
    const withUndefinedDifficulty = runCommanderAI(state, FACTION_A, createRng(5), { difficulty: undefined });

    expect(withoutOptions).toEqual(withUndefinedDifficulty);
    // Original behavior: every idle unit with a live enemy always attacks (no gating).
    expect(withoutOptions.some((c) => c.type === 'MOVE' && c.unitIds.includes(mine.id))).toBe(true);
  });

  it('a PRO faction queues production at a credit level a BEGINNER faction would not (economyMultiplier)', () => {
    // Choose credits between the BEGINNER-effective and PRO-effective thresholds.
    const beginnerThreshold = AI_PRODUCTION_CREDIT_THRESHOLD / RTS_DIFFICULTY_PRESETS.BEGINNER.economyMultiplier;
    const proThreshold = AI_PRODUCTION_CREDIT_THRESHOLD / RTS_DIFFICULTY_PRESETS.PRO.economyMultiplier;
    expect(proThreshold).toBeLessThan(beginnerThreshold);
    const credits = (beginnerThreshold + proThreshold) / 2;

    const buildState = () => {
      const state = makeMatch();
      state.economy[FACTION_A]!.credits = credits;
      // All three producer types present, so a BUILD command fires regardless of which UnitClass
      // the AI's rng draw happens to pick.
      state.entities.buildings.push(
        makeBuilding({ factionId: FACTION_A, buildingClass: 'BARRACKS' }),
        makeBuilding({ factionId: FACTION_A, buildingClass: 'FACTORY' }),
        makeBuilding({ factionId: FACTION_A, buildingClass: 'AIRFIELD' }),
      );
      return state;
    };

    const proCommands = runCommanderAI(buildState(), FACTION_A, createRng(1), { difficulty: 'PRO' });
    const beginnerCommands = runCommanderAI(buildState(), FACTION_A, createRng(1), { difficulty: 'BEGINNER' });

    expect(proCommands.some((c) => c.type === 'BUILD')).toBe(true);
    expect(beginnerCommands.some((c) => c.type === 'BUILD')).toBe(false);
  });

  it('BEGINNER aggressionChance measurably holds some idle units back from attacking', () => {
    const state = makeMatch();
    for (let i = 0; i < 20; i++) {
      state.entities.units.push(makeUnit({ factionId: FACTION_A, unitClass: 'INFANTRY', state: 'IDLE' }));
    }
    state.entities.units.push(makeUnit({ factionId: FACTION_B }));

    const commands = runCommanderAI(state, FACTION_A, createRng(123), { difficulty: 'BEGINNER' });
    const attackers = commands.filter((c) => c.type === 'MOVE').length;

    // aggressionChance 0.5 over 20 idle units: astronomically unlikely all 20 committed.
    expect(attackers).toBeLessThan(20);
    expect(attackers).toBeGreaterThan(0);
  });

  it('PRO aggressionChance (1.0) commits every idle unit, same as the no-difficulty default', () => {
    const state = makeMatch();
    for (let i = 0; i < 10; i++) {
      state.entities.units.push(makeUnit({ factionId: FACTION_A, unitClass: 'INFANTRY', state: 'IDLE' }));
    }
    state.entities.units.push(makeUnit({ factionId: FACTION_B }));

    const commands = runCommanderAI(state, FACTION_A, createRng(9), { difficulty: 'PRO' });
    expect(commands.filter((c) => c.type === 'MOVE')).toHaveLength(10);
  });

  it('is deterministic: same seed + difficulty produces identical commands', () => {
    // resetTestIds() before each build so the two scenarios' hand-authored unit ids match — see
    // testFixtures.ts's doc: otherwise this test-only id bookkeeping, not the AI, would be the
    // source of any observed difference (same pattern determinism.test.ts uses).
    const build = () => {
      resetTestIds();
      const state = makeMatch();
      state.entities.units.push(
        makeUnit({ factionId: FACTION_A, unitClass: 'INFANTRY', state: 'IDLE' }),
        makeUnit({ factionId: FACTION_B }),
      );
      return state;
    };

    const a = runCommanderAI(build(), FACTION_A, createRng(555), { difficulty: 'INTERMEDIATE' });
    const b = runCommanderAI(build(), FACTION_A, createRng(555), { difficulty: 'INTERMEDIATE' });
    expect(a).toEqual(b);
  });
});

describe('United Dragon Nations guerrilla heat doctrine (§9)', () => {
  it('a thermally-exposed Dragon unit holds back from a fresh opportunistic attack', () => {
    const state = makeMatch();
    const hotUnit = makeUnit({ factionId: FACTION_B, unitClass: 'INFANTRY', state: 'IDLE', heat: 0.9 });
    const enemy = makeUnit({ factionId: FACTION_A });
    state.entities.units.push(hotUnit, enemy);

    const commands = runCommanderAI(state, FACTION_B, createRng(1));

    expect(commands.some((c) => c.unitIds.includes(hotUnit.id))).toBe(false);
  });

  it('a cool Dragon unit attacks normally (no regression vs. pre-§9 behavior)', () => {
    const state = makeMatch();
    const coolUnit = makeUnit({ factionId: FACTION_B, unitClass: 'INFANTRY', state: 'IDLE', heat: 0 });
    const enemy = makeUnit({ factionId: FACTION_A });
    state.entities.units.push(coolUnit, enemy);

    const commands = runCommanderAI(state, FACTION_B, createRng(1));

    expect(commands.some((c) => c.type === 'MOVE' && c.unitIds.includes(coolUnit.id))).toBe(true);
  });

  it('a thermally-exposed Raven unit still attacks (sustained-fire doctrine, not guerrilla)', () => {
    const state = makeMatch();
    const hotRaven = makeUnit({ factionId: FACTION_A, unitClass: 'INFANTRY', state: 'IDLE', heat: 0.9 });
    const enemy = makeUnit({ factionId: FACTION_B });
    state.entities.units.push(hotRaven, enemy);

    const commands = runCommanderAI(state, FACTION_A, createRng(1));

    expect(commands.some((c) => c.type === 'MOVE' && c.unitIds.includes(hotRaven.id))).toBe(true);
  });
});
