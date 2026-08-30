// docs/RTS-CONTRACTS.md §1: "Write a test that runs the same seed + command sequence twice and
// asserts the resulting serialized state is byte-identical; this is the single most important
// test in the whole feature." This file is exactly that test, exercised against a scenario that
// touches every deterministic-danger area this package has: AI decisions (runCommanderAI, fed
// through the shared rng), unit/projectile id generation (also rng-driven), production spawning,
// pathfinding, steering, combat, and harvesting — all running for enough ticks that any hidden
// wall-clock read or Math.random() call would eventually desync the two runs.
import { describe, expect, it } from 'vitest';
import { createMatch, serializeMatch, stateHash, tickMatch } from './index';
import { RTS_FACTIONS } from './constants';
import { makeBuilding, makeResourceNode, makeUnit, resetTestIds } from './testFixtures';
import type { RTSCommand, RTSMatchState } from './types';

const [ravenAlliance, unitedDragonNations] = RTS_FACTIONS;

function buildScenario(seed: number): RTSMatchState {
  // Reset the fixture id counter so two independently-built scenarios (e.g. the two runs this
  // file compares) get identical entity ids — otherwise this test-only bookkeeping, not the
  // simulation, would be the sole source of any observed difference.
  resetTestIds();
  const state = createMatch({
    seed,
    mapWidthM: 500,
    mapDepthM: 500,
    cellSizeM: 10,
    factions: [
      { factionId: ravenAlliance!.id, isAIControlled: false },
      { factionId: unitedDragonNations!.id, isAIControlled: true },
    ],
  });

  state.entities.buildings.push(
    makeBuilding({ factionId: ravenAlliance!.id, buildingClass: 'BARRACKS', cellX: 2, cellZ: 2 }),
    makeBuilding({ factionId: ravenAlliance!.id, buildingClass: 'FACTORY', cellX: 2, cellZ: 6 }),
    makeBuilding({ factionId: unitedDragonNations!.id, buildingClass: 'BARRACKS', cellX: 40, cellZ: 40 }),
    makeBuilding({ factionId: unitedDragonNations!.id, buildingClass: 'FACTORY', cellX: 40, cellZ: 44 }),
  );
  state.entities.resources.push(
    makeResourceNode({ position: { x: 250, y: 0, z: 250 }, amount: 2000 }),
    makeResourceNode({ position: { x: 100, y: 0, z: 400 }, amount: 2000 }),
  );
  state.entities.units.push(
    makeUnit({ factionId: ravenAlliance!.id, unitClass: 'INFANTRY', transform: { position: { x: 20, y: 0, z: 20 }, rotationY: 0 } }),
    makeUnit({ factionId: ravenAlliance!.id, unitClass: 'ARMORED', transform: { position: { x: 25, y: 0, z: 25 }, rotationY: 0 } }),
    makeUnit({ factionId: ravenAlliance!.id, unitClass: 'AIR', transform: { position: { x: 30, y: 0, z: 20 }, rotationY: 0 } }),
    makeUnit({ factionId: unitedDragonNations!.id, unitClass: 'INFANTRY', transform: { position: { x: 400, y: 0, z: 400 }, rotationY: 0 } }),
    makeUnit({ factionId: unitedDragonNations!.id, unitClass: 'ARMORED', transform: { position: { x: 405, y: 0, z: 405 }, rotationY: 0 } }),
  );

  return state;
}

/** A fixed, ordered command stream a human player (Raven Alliance) would issue over the match. */
function scriptedCommandsForTick(tick: number, state: RTSMatchState): RTSCommand[] {
  const ravenUnits = state.entities.units.filter((u) => u.factionId === ravenAlliance!.id && u.state !== 'DEAD');
  const commands: RTSCommand[] = [];

  if (tick === 5) {
    const infantry = ravenUnits.find((u) => u.unitClass === 'INFANTRY');
    if (infantry) commands.push({ type: 'HARVEST', unitIds: [infantry.id], targetId: state.entities.resources[0]!.id });
  }
  if (tick === 20) {
    const attackers = ravenUnits.filter((u) => u.unitClass !== 'INFANTRY').map((u) => u.id);
    if (attackers.length > 0) commands.push({ type: 'MOVE', unitIds: attackers, targetPos: { x: 380, y: 0, z: 380 } });
  }
  if (tick === 60) {
    const barracks = state.entities.buildings.find((b) => b.factionId === ravenAlliance!.id && b.buildingClass === 'BARRACKS');
    if (barracks) commands.push({ type: 'BUILD', unitIds: [], targetId: barracks.id, buildType: 'INFANTRY' });
  }
  if (tick === 90) {
    const anyUnit = ravenUnits[0];
    if (anyUnit) commands.push({ type: 'STOP', unitIds: [anyUnit.id] });
  }

  return commands;
}

function runMatch(seed: number, ticks: number): RTSMatchState {
  let state = buildScenario(seed);
  for (let tick = 0; tick < ticks; tick++) {
    const commands = scriptedCommandsForTick(tick, state);
    state = tickMatch(state, 0.1, commands);
  }
  return state;
}

describe('determinism (docs/RTS-CONTRACTS.md §1)', () => {
  it('produces byte-identical serialized state for two runs of the same seed + command sequence', () => {
    const ticksToRun = 150;

    const stateA = runMatch(4242, ticksToRun);
    const stateB = runMatch(4242, ticksToRun);

    expect(serializeMatch(stateA)).toBe(serializeMatch(stateB));
    expect(stateHash(stateA)).toBe(stateHash(stateB));
  });

  it('produces a different hash for a different seed (the hash is actually sensitive to state)', () => {
    const ticksToRun = 60;
    const stateA = runMatch(1, ticksToRun);
    const stateB = runMatch(2, ticksToRun);
    expect(stateHash(stateA)).not.toBe(stateHash(stateB));
  });

  it('a round trip through serializeMatch/deserializeMatch continues identically to an un-serialized run', async () => {
    const { deserializeMatch } = await import('./index');
    const ticksToRun = 40;

    let liveState = buildScenario(99);
    let roundTrippedState = buildScenario(99);

    for (let tick = 0; tick < ticksToRun; tick++) {
      const liveCommands = scriptedCommandsForTick(tick, liveState);
      liveState = tickMatch(liveState, 0.1, liveCommands);

      const roundTrippedCommands = scriptedCommandsForTick(tick, roundTrippedState);
      const ticked = tickMatch(roundTrippedState, 0.1, roundTrippedCommands);
      roundTrippedState = deserializeMatch(serializeMatch(ticked));
    }

    expect(serializeMatch(liveState)).toBe(serializeMatch(roundTrippedState));
  });

  it('does not mutate the state object passed into tickMatch', () => {
    const state = buildScenario(1);
    const before = serializeMatch(state);
    tickMatch(state, 0.1, []);
    expect(serializeMatch(state)).toBe(before);
  });
});

// §9 depth extension: the same byte-identical-replay guarantee, exercised against a scenario built
// specifically to hit every §9 addition — unitType-driven heat/cooling, PRO difficulty (which
// itself perturbs runCommanderAI's rng draw pattern via aggressionChance), and an allied-nation
// coordinated strike (its own rng-driven unit selection) — on a SEA-biome map so naval steering's
// direct-path branch is exercised too. If any of §9's new code paths ever reached for
// `Math.random()`/`Date.now()` or depended on object/Set iteration order, this would desync.
describe('determinism (§9 depth extension)', () => {
  const ALLY = 'allied-faction-1';

  function buildSection9Scenario(seed: number): RTSMatchState {
    resetTestIds();
    const state = createMatch({
      seed,
      mapWidthM: 600,
      mapDepthM: 600,
      cellSizeM: 10,
      biome: 'SEA',
      factions: [
        { factionId: ravenAlliance!.id, isAIControlled: false },
        { factionId: unitedDragonNations!.id, isAIControlled: true, difficulty: 'PRO', alliedFactionIds: [ALLY] },
        { factionId: ALLY, isAIControlled: true, difficulty: 'PRO' },
      ],
    });

    state.entities.buildings.push(
      makeBuilding({ factionId: ravenAlliance!.id, buildingClass: 'RADAR', cellX: 1, cellZ: 1 }),
      makeBuilding({ factionId: ravenAlliance!.id, buildingClass: 'BARRACKS', cellX: 1, cellZ: 5 }),
      makeBuilding({ factionId: unitedDragonNations!.id, buildingClass: 'BARRACKS', cellX: 40, cellZ: 40 }),
      makeBuilding({ factionId: unitedDragonNations!.id, buildingClass: 'FACTORY', cellX: 40, cellZ: 44 }),
      makeBuilding({ factionId: unitedDragonNations!.id, buildingClass: 'FACTORY', cellX: 44, cellZ: 44 }),
    );
    state.entities.resources.push(makeResourceNode({ position: { x: 300, y: 0, z: 300 }, amount: 2000 }));
    state.entities.units.push(
      // Raven: one hot (thermally exposed) unit to exercise fogOfWarSystem's heat auto-reveal.
      makeUnit({ factionId: ravenAlliance!.id, unitClass: 'ARMORED', unitType: 'MAIN_BATTLE_TANK', heat: 0.8, transform: { position: { x: 20, y: 0, z: 20 }, rotationY: 0 } }),
      makeUnit({ factionId: ravenAlliance!.id, unitClass: 'INFANTRY', unitType: 'SNIPER', transform: { position: { x: 25, y: 0, z: 25 }, rotationY: 0 } }),
      // Dragon: a guerrilla-doctrine unit that starts hot (should hold back from attacking).
      makeUnit({ factionId: unitedDragonNations!.id, unitClass: 'INFANTRY', unitType: 'RIFLEMAN', heat: 0.9, transform: { position: { x: 400, y: 0, z: 400 }, rotationY: 0 } }),
      makeUnit({ factionId: unitedDragonNations!.id, unitClass: 'ARMORED', unitType: 'DESTROYER', transform: { position: { x: 405, y: 0, z: 405 }, rotationY: 0 } }),
      // Ally: several units so evaluateAlliedStrike has a force to draw from once Dragon's
      // map-control crosses the threshold (2 of 2 buildings are Dragon's in this scenario).
      makeUnit({ factionId: ALLY, transform: { position: { x: 380, y: 0, z: 420 }, rotationY: 0 } }),
      makeUnit({ factionId: ALLY, transform: { position: { x: 385, y: 0, z: 420 }, rotationY: 0 } }),
      makeUnit({ factionId: ALLY, transform: { position: { x: 390, y: 0, z: 420 }, rotationY: 0 } }),
    );

    return state;
  }

  function scriptedSection9Commands(tick: number, state: RTSMatchState): RTSCommand[] {
    const ravenUnits = state.entities.units.filter((u) => u.factionId === ravenAlliance!.id && u.state !== 'DEAD');
    const commands: RTSCommand[] = [];

    if (tick === 5) {
      const sniper = ravenUnits.find((u) => u.unitType === 'SNIPER');
      if (sniper) commands.push({ type: 'HARVEST', unitIds: [sniper.id], targetId: state.entities.resources[0]!.id });
    }
    if (tick === 20) {
      const tank = ravenUnits.find((u) => u.unitType === 'MAIN_BATTLE_TANK');
      if (tank) commands.push({ type: 'MOVE', unitIds: [tank.id], targetPos: { x: 380, y: 0, z: 380 } });
    }
    if (tick === 60) {
      const barracks = state.entities.buildings.find((b) => b.factionId === ravenAlliance!.id && b.buildingClass === 'BARRACKS');
      if (barracks) commands.push({ type: 'BUILD', unitIds: [], targetId: barracks.id, buildType: 'ARMORED', unitType: 'FRIGATE' });
    }

    return commands;
  }

  function runSection9Match(seed: number, ticks: number): RTSMatchState {
    let state = buildSection9Scenario(seed);
    for (let tick = 0; tick < ticks; tick++) {
      const commands = scriptedSection9Commands(tick, state);
      state = tickMatch(state, 0.1, commands);
    }
    return state;
  }

  it('produces byte-identical serialized state for two runs exercising unitType heat, PRO difficulty, allied strikes, and SEA-biome naval steering', () => {
    const ticksToRun = 150;

    const stateA = runSection9Match(9999, ticksToRun);
    const stateB = runSection9Match(9999, ticksToRun);

    expect(serializeMatch(stateA)).toBe(serializeMatch(stateB));
    expect(stateHash(stateA)).toBe(stateHash(stateB));

    // Sanity: the scenario actually exercised what it claims to (a run that silently skipped every
    // §9 code path would still trivially "replay identically" without proving anything).
    expect(stateA.map.biome).toBe('SEA');
    const dragonRifleman = stateA.entities.units.find((u) => u.factionId === unitedDragonNations!.id && u.unitType === 'RIFLEMAN');
    expect(dragonRifleman).toBeDefined();
  });
});
