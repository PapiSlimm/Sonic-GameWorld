import { describe, expect, it } from 'vitest';
import { FACTION_A, FACTION_B, makeBuilding, makeMatch } from '../testFixtures';
import { victorySystem } from './victorySystem';

describe('victorySystem', () => {
  it('declares the last faction with a surviving building the winner, after the grace period', () => {
    const state = makeMatch();
    state.sessionTime = 20;
    state.entities.buildings.push(
      makeBuilding({ factionId: FACTION_A, health: 100 }),
      makeBuilding({ factionId: FACTION_B, health: 0 }),
    );

    victorySystem(state);

    expect(state.winnerFactionId).toBe(FACTION_A);
    expect(state.status).toBe('GAME_OVER');
  });

  it('does not declare a winner before the grace period elapses', () => {
    const state = makeMatch();
    state.sessionTime = 1;
    state.entities.buildings.push(
      makeBuilding({ factionId: FACTION_A, health: 100 }),
      makeBuilding({ factionId: FACTION_B, health: 0 }),
    );

    victorySystem(state);
    expect(state.winnerFactionId).toBeNull();
  });

  it('does not declare a winner while more than one faction has a surviving building', () => {
    const state = makeMatch();
    state.sessionTime = 100;
    state.entities.buildings.push(makeBuilding({ factionId: FACTION_A, health: 100 }), makeBuilding({ factionId: FACTION_B, health: 100 }));

    victorySystem(state);
    expect(state.winnerFactionId).toBeNull();
  });

  it('is idempotent once a winner is set', () => {
    const state = makeMatch();
    state.sessionTime = 100;
    state.winnerFactionId = FACTION_A;
    state.status = 'GAME_OVER';
    state.entities.buildings.push(makeBuilding({ factionId: FACTION_B, health: 100 }));

    victorySystem(state);
    expect(state.winnerFactionId).toBe(FACTION_A);
  });

  it('never declares a winner with fewer than two configured factions', () => {
    const state = makeMatch({ factions: [{ factionId: FACTION_A, isAIControlled: false }] });
    state.sessionTime = 100;
    state.entities.buildings.push(makeBuilding({ factionId: FACTION_A, health: 100 }));

    victorySystem(state);
    expect(state.winnerFactionId).toBeNull();
  });

  it('generalizes to more than two factions', () => {
    const state = makeMatch({
      factions: [
        { factionId: 'a', isAIControlled: false },
        { factionId: 'b', isAIControlled: false },
        { factionId: 'c', isAIControlled: false },
      ],
    });
    state.sessionTime = 100;
    state.entities.buildings.push(
      makeBuilding({ factionId: 'a', health: 0 }),
      makeBuilding({ factionId: 'b', health: 0 }),
      makeBuilding({ factionId: 'c', health: 100 }),
    );

    victorySystem(state);
    expect(state.winnerFactionId).toBe('c');
  });
});
