// Full-match integration test per docs/RTS-CONTRACTS.md §4: create a match, feed it a scripted
// command sequence for several hundred ticks, and assert a faction eventually wins.
//
// The scenario is engineered so the outcome is a mathematical certainty rather than a hope that
// AI behavior happens to converge in time (flaky-test risk in a package with zero runtime
// dependents to catch a regression otherwise): two Raven Alliance ARMORED units sit stationary at
// a distance that is inside their own 240-unit attack range but *outside* United Dragon Nations
// INFANTRY's 160-unit attack range, so combat is entirely one-sided — no movement, no AI, no
// pathfinding involved, just `combatSystem`/`projectileSystem` running every tick. A single
// defending infantry unit (given a large health pool purely so it survives long enough to keep
// serving as a target) sits inside the Dragon barracks' own footprint, so every successful hit
// splashes the barracks for 40 damage too — see the comment block below for the full arithmetic.
import { describe, expect, it } from 'vitest';
import { RTS_FACTIONS } from './constants';
import { createMatch, tickMatch } from './index';
import { makeBuilding, makeUnit } from './testFixtures';

const [ravenAlliance, unitedDragonNations] = RTS_FACTIONS;

describe('full match integration', () => {
  it('runs a one-sided siege to a deterministic victory within a bounded number of ticks', () => {
    let state = createMatch({
      seed: 2026,
      mapWidthM: 400,
      mapDepthM: 400,
      cellSizeM: 10,
      factions: [
        { factionId: ravenAlliance!.id, isAIControlled: false },
        { factionId: unitedDragonNations!.id, isAIControlled: false },
      ],
    });

    // Raven's own base, safely out of the fight (Dragon's infantry can never reach it — see below).
    state.entities.buildings.push(makeBuilding({ factionId: ravenAlliance!.id, buildingClass: 'BARRACKS', cellX: 1, cellZ: 1 }));

    // Dragon's sole base. Footprint: cellX*10..+20, cellZ*10..+20 → world [140,160] x [140,160].
    const dragonBarracks = makeBuilding({ factionId: unitedDragonNations!.id, buildingClass: 'BARRACKS', cellX: 14, cellZ: 14 });
    state.entities.buildings.push(dragonBarracks);

    // Arithmetic:
    //  - Raven ARMORED: attackRange 240, damage 40, fires once every 10 ticks (1s @ 10Hz).
    //  - Dragon INFANTRY: attackRange 160.
    //  - Both Raven units sit ~212 and ~175 world units from the Dragon defender: inside 240
    //    (Raven can hit) and outside 160 (Dragon cannot hit back) — zero return fire, ever.
    //  - Barracks HP 1000 / 40 dmg per hit = 25 hits needed to destroy it. The defender sits
    //    inside the barracks' own footprint box, so *every* successful hit splashes the barracks
    //    for 40 in addition to whatever it does to the defender.
    //  - The defender's health is set far above what 25 hits (1000 dmg) could ever remove, purely
    //    so there is always a living target for combatSystem to keep locking onto — this is a
    //    test-only knob (RTSUnit.health isn't otherwise validated against RTS_UNIT_STATS), not a
    //    claim about real unit balance.
    //  - 2 attackers each fire once per 10-tick cooldown (both start synchronized, so 2 hits land
    //    roughly every 10 ticks, plus a few ticks of projectile flight time at 750 units/sec over
    //    ~200 units of distance) — 25 hits complete in well under 200 ticks, comfortably inside
    //    this test's 400-tick budget.
    state.entities.units.push(
      makeUnit({ factionId: ravenAlliance!.id, unitClass: 'ARMORED', transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } }),
      makeUnit({ factionId: ravenAlliance!.id, unitClass: 'ARMORED', transform: { position: { x: 60, y: 0, z: 0 }, rotationY: 0 } }),
      makeUnit({
        factionId: unitedDragonNations!.id,
        unitClass: 'INFANTRY',
        health: 5000,
        maxHealth: 5000,
        transform: { position: { x: 150, y: 0, z: 150 }, rotationY: 0 },
      }),
    );

    const maxTicks = 400;
    let ticksRun = 0;
    for (; ticksRun < maxTicks; ticksRun++) {
      state = tickMatch(state, 0.1, []);
      if (state.status === 'GAME_OVER') break;
    }

    expect(state.status).toBe('GAME_OVER');
    expect(state.winnerFactionId).toBe(ravenAlliance!.id);
    expect(ticksRun).toBeLessThan(maxTicks);

    // tickMatch clones state every call, so the original dragonBarracks/scout object references
    // from before the loop are stale — always look entities up fresh from the final `state`.
    const finalDragonBarracks = state.entities.buildings.find((b) => b.id === dragonBarracks.id)!;
    expect(finalDragonBarracks.health).toBe(0);
    const ravenBarracksHealth = state.entities.buildings.find((b) => b.factionId === ravenAlliance!.id)!.health;
    expect(ravenBarracksHealth).toBeGreaterThan(0);

    // The one-sided combat arithmetic should also hold: Raven's attackers took no damage at all.
    const ravenUnits = state.entities.units.filter((u) => u.factionId === ravenAlliance!.id);
    for (const u of ravenUnits) expect(u.health).toBe(u.maxHealth);
  });

  it('accepts a human-issued command stream alongside the simulation and honors it', () => {
    let state = createMatch({
      seed: 7,
      mapWidthM: 300,
      mapDepthM: 300,
      cellSizeM: 10,
      factions: [
        { factionId: ravenAlliance!.id, isAIControlled: false },
        { factionId: unitedDragonNations!.id, isAIControlled: false },
      ],
    });

    state.entities.buildings.push(
      makeBuilding({ factionId: ravenAlliance!.id, buildingClass: 'BARRACKS', cellX: 2, cellZ: 2 }),
      makeBuilding({ factionId: unitedDragonNations!.id, buildingClass: 'BARRACKS', cellX: 25, cellZ: 25 }),
    );
    const scout = makeUnit({ factionId: ravenAlliance!.id, unitClass: 'INFANTRY', transform: { position: { x: 30, y: 0, z: 30 }, rotationY: 0 } });
    state.entities.units.push(scout);

    state = tickMatch(state, 0.1, [{ type: 'MOVE', unitIds: [scout.id], targetPos: { x: 250, y: 0, z: 250 } }]);
    const scoutAfterFirstTick = state.entities.units.find((u) => u.id === scout.id)!;
    expect(scoutAfterFirstTick.state).toBe('MOVING');
    expect(scoutAfterFirstTick.path.length).toBeGreaterThan(0);

    for (let i = 0; i < 50; i++) {
      state = tickMatch(state, 0.1, []);
    }

    const scoutLater = state.entities.units.find((u) => u.id === scout.id)!;
    expect(scoutLater.transform.position.x).toBeGreaterThan(30);

    // A STOP command halts the unit's advance immediately.
    state = tickMatch(state, 0.1, [{ type: 'STOP', unitIds: [scout.id] }]);
    const scoutStopped = state.entities.units.find((u) => u.id === scout.id)!;
    expect(scoutStopped.commands).toEqual([]);
    expect(scoutStopped.path).toEqual([]);
    expect(scoutStopped.state).toBe('IDLE');
  });
});
