import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { FACTION_A, FACTION_B, makeBuilding, makeMatch, makeResourceNode, makeUnit, resetTestIds } from '../testFixtures';
import { runCommanderAI } from './commanderAI';

describe('runCommanderAI', () => {
  it('is pure: it never mutates the state it is given', () => {
    const state = makeMatch();
    state.entities.units.push(makeUnit({ factionId: FACTION_A, state: 'IDLE' }));
    state.entities.units.push(makeUnit({ factionId: FACTION_B }));
    const before = JSON.parse(JSON.stringify(state));

    runCommanderAI(state, FACTION_A, createRng(1));

    expect(JSON.parse(JSON.stringify(state))).toEqual(before);
  });

  it('queues a BUILD command at a compatible building once credits exceed the threshold', () => {
    const state = makeMatch();
    state.economy[FACTION_A]!.credits = 5000;
    const barracks = makeBuilding({ factionId: FACTION_A, buildingClass: 'BARRACKS' });
    const factory = makeBuilding({ factionId: FACTION_A, buildingClass: 'FACTORY' });
    state.entities.buildings.push(barracks, factory);

    const commands = runCommanderAI(state, FACTION_A, createRng(1));

    const buildCommands = commands.filter((c) => c.type === 'BUILD');
    expect(buildCommands.length).toBeGreaterThanOrEqual(1);
    expect(['INFANTRY', 'ARMORED', 'AIR']).toContain(buildCommands[0]!.buildType);
  });

  it('does not queue production below the credit threshold', () => {
    const state = makeMatch();
    state.economy[FACTION_A]!.credits = 100;
    state.entities.buildings.push(makeBuilding({ factionId: FACTION_A, buildingClass: 'BARRACKS' }));

    const commands = runCommanderAI(state, FACTION_A, createRng(1));
    expect(commands.some((c) => c.type === 'BUILD')).toBe(false);
  });

  it('sends idle units to attack a random live enemy', () => {
    const state = makeMatch();
    const mine = makeUnit({ factionId: FACTION_A, unitClass: 'ARMORED', state: 'IDLE' });
    const enemy = makeUnit({ factionId: FACTION_B, transform: { position: { x: 42, y: 0, z: 42 }, rotationY: 0 } });
    state.entities.units.push(mine, enemy);

    const commands = runCommanderAI(state, FACTION_A, createRng(1));
    const moveCommands = commands.filter((c) => c.type === 'MOVE' && c.unitIds.includes(mine.id));
    expect(moveCommands).toHaveLength(1);
    expect(moveCommands[0]!.targetPos).toEqual({ x: 42, y: 0, z: 42 });
  });

  it('does not command units that already have orders or are not idle', () => {
    const state = makeMatch();
    const busy = makeUnit({ factionId: FACTION_A, state: 'MOVING', commands: [{ type: 'MOVE', targetPos: { x: 1, y: 0, z: 1 } }] });
    const enemy = makeUnit({ factionId: FACTION_B });
    state.entities.units.push(busy, enemy);

    const commands = runCommanderAI(state, FACTION_A, createRng(1));
    expect(commands.some((c) => c.unitIds.includes(busy.id))).toBe(false);
  });

  it('sends idle infantry to harvest, overriding any attack-move for the same unit (matches reference call order)', () => {
    const state = makeMatch();
    const infantry = makeUnit({ factionId: FACTION_A, unitClass: 'INFANTRY', state: 'IDLE' });
    const enemy = makeUnit({ factionId: FACTION_B });
    const node = makeResourceNode({ amount: 500 });
    state.entities.units.push(infantry, enemy);
    state.entities.resources.push(node);

    const commands = runCommanderAI(state, FACTION_A, createRng(1));
    const commandsForInfantry = commands.filter((c) => c.unitIds.includes(infantry.id));

    // Both a MOVE and a HARVEST were proposed for this unit; the HARVEST (pushed last) is what a
    // caller applying commands in order would end up acting on.
    expect(commandsForInfantry.some((c) => c.type === 'HARVEST')).toBe(true);
    expect(commandsForInfantry[commandsForInfantry.length - 1]!.type).toBe('HARVEST');
  });

  it('never touches Math.random and is fully deterministic given the same rng seed', () => {
    const build = () => {
      resetTestIds();
      const state = makeMatch();
      state.economy[FACTION_A]!.credits = 5000;
      state.entities.buildings.push(
        makeBuilding({ factionId: FACTION_A, buildingClass: 'BARRACKS' }),
        makeBuilding({ factionId: FACTION_A, buildingClass: 'FACTORY' }),
      );
      state.entities.units.push(
        makeUnit({ factionId: FACTION_A, unitClass: 'INFANTRY', state: 'IDLE' }),
        makeUnit({ factionId: FACTION_B }),
      );
      state.entities.resources.push(makeResourceNode());
      return state;
    };

    const a = runCommanderAI(build(), FACTION_A, createRng(777));
    const b = runCommanderAI(build(), FACTION_A, createRng(777));
    expect(a).toEqual(b);
  });
});
