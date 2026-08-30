// §9 depth extension: hard per-faction production caps (docs/RTS-CONTRACTS.md §9, "Economy +
// roster caps") — 250 combined INFANTRY+ARMORED, 50 AIR — enforced in tryEnqueueProduction with a
// typed rejection rather than a silent no-op.
import { describe, expect, it } from 'vitest';
import { RTS_UNIT_CAP_AIR, RTS_UNIT_CAP_GROUND } from '../constants';
import { FACTION_A, makeMatch, makeUnit } from '../testFixtures';
import { enqueueProduction, tryEnqueueProduction } from './productionSystem';

describe('production caps (§9)', () => {
  it('rejects a ground (INFANTRY/ARMORED) build once the combined cap is reached, with a clear reason', () => {
    const state = makeMatch();
    state.economy[FACTION_A]!.credits = 10_000_000; // affordability is not what's being tested
    for (let i = 0; i < RTS_UNIT_CAP_GROUND; i++) {
      state.entities.units.push(makeUnit({ factionId: FACTION_A, unitClass: i % 2 === 0 ? 'INFANTRY' : 'ARMORED' }));
    }

    const result = tryEnqueueProduction(state, FACTION_A, 'INFANTRY', 0);

    expect(result).toEqual({ ok: false, reason: 'UNIT_CAP_REACHED' });
    expect(state.productionQueue).toHaveLength(0);
    // enqueueProduction's original boolean API also reflects the rejection (no silent success).
    expect(enqueueProduction(state, FACTION_A, 'ARMORED', 0)).toBe(false);
  });

  it('allows the ground build exactly one under the cap', () => {
    const state = makeMatch();
    state.economy[FACTION_A]!.credits = 10_000_000;
    for (let i = 0; i < RTS_UNIT_CAP_GROUND - 1; i++) {
      state.entities.units.push(makeUnit({ factionId: FACTION_A, unitClass: 'INFANTRY' }));
    }

    expect(tryEnqueueProduction(state, FACTION_A, 'ARMORED', 0).ok).toBe(true);
  });

  it('counts already-queued orders toward the cap, not just spawned units', () => {
    const state = makeMatch();
    state.economy[FACTION_A]!.credits = 10_000_000;
    for (let i = 0; i < RTS_UNIT_CAP_GROUND; i++) {
      const ok = tryEnqueueProduction(state, FACTION_A, 'INFANTRY', 0);
      expect(ok.ok).toBe(true);
    }

    const result = tryEnqueueProduction(state, FACTION_A, 'INFANTRY', 0);
    expect(result).toEqual({ ok: false, reason: 'UNIT_CAP_REACHED' });
  });

  it('tracks the AIR cap independently from the ground cap', () => {
    const state = makeMatch();
    state.economy[FACTION_A]!.credits = 10_000_000;
    for (let i = 0; i < RTS_UNIT_CAP_GROUND; i++) {
      state.entities.units.push(makeUnit({ factionId: FACTION_A, unitClass: 'INFANTRY' }));
    }

    // Ground is capped, but AIR is untouched and should still succeed.
    expect(tryEnqueueProduction(state, FACTION_A, 'AIR', 0).ok).toBe(true);

    for (let i = 0; i < RTS_UNIT_CAP_AIR - 1; i++) {
      state.entities.units.push(makeUnit({ factionId: FACTION_A, unitClass: 'AIR' }));
    }
    const result = tryEnqueueProduction(state, FACTION_A, 'AIR', 0);
    expect(result).toEqual({ ok: false, reason: 'UNIT_CAP_REACHED' });
  });

  it('does not deduct credits when a request is rejected for being over cap', () => {
    const state = makeMatch();
    state.economy[FACTION_A]!.credits = 10_000_000;
    for (let i = 0; i < RTS_UNIT_CAP_GROUND; i++) {
      state.entities.units.push(makeUnit({ factionId: FACTION_A, unitClass: 'INFANTRY' }));
    }
    const creditsBefore = state.economy[FACTION_A]!.credits;

    tryEnqueueProduction(state, FACTION_A, 'INFANTRY', 0);

    expect(state.economy[FACTION_A]!.credits).toBe(creditsBefore);
  });
});
