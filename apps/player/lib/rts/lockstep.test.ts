import { describe, expect, it } from 'vitest';
import { createMatch, RTS_FACTIONS } from '@sonic-gameworld/rts-sim';
import { seedStartingScenario } from './scenario';
import {
  FIXED_DT_SECONDS,
  advanceFixedSteps,
  createCommandBuffer,
  scheduleCommand,
  takeCommandsForTick,
} from './lockstep';
import { buildMoveCommand } from './commands';

function freshMatch() {
  return seedStartingScenario(
    createMatch({
      seed: 7,
      mapWidthM: 2000,
      mapDepthM: 2000,
      cellSizeM: 40,
      factions: [
        { factionId: RTS_FACTIONS[0]!.id, isAIControlled: false },
        { factionId: RTS_FACTIONS[1]!.id, isAIControlled: true },
      ],
    }),
  );
}

describe('CommandBuffer', () => {
  it('schedules and drains commands for a given tick, coalescing multiple commands on the same tick', () => {
    const buffer = createCommandBuffer();
    const move = buildMoveCommand(['u1'], { x: 1, y: 0, z: 2 });
    const stop = buildMoveCommand(['u2'], { x: 3, y: 0, z: 4 });
    scheduleCommand(buffer, 10, move);
    scheduleCommand(buffer, 10, stop);

    expect(takeCommandsForTick(buffer, 10)).toEqual([move, stop]);
    expect(takeCommandsForTick(buffer, 10)).toEqual([]); // drained
  });

  it('reschedules a command already-past its target tick onto notBeforeTick instead of losing it', () => {
    const buffer = createCommandBuffer();
    const cmd = buildMoveCommand(['u1'], { x: 0, y: 0, z: 0 });
    scheduleCommand(buffer, 5, cmd, 20); // arrived late — tick 5 already passed, current tick is 20
    expect(takeCommandsForTick(buffer, 5)).toEqual([]);
    expect(takeCommandsForTick(buffer, 20)).toEqual([cmd]);
  });
});

describe('advanceFixedSteps', () => {
  it('advances by exactly one tick per FIXED_DT_SECONDS of accumulated time', () => {
    const buffer = createCommandBuffer();
    const state = freshMatch();
    const result = advanceFixedSteps(state, 0, FIXED_DT_SECONDS, buffer);
    expect(result.ticksAdvanced).toBe(1);
    expect(result.state.tick).toBe(state.tick + 1);
    expect(result.remainderSeconds).toBeCloseTo(0, 10);
  });

  it('carries a sub-tick remainder forward instead of ticking early', () => {
    const buffer = createCommandBuffer();
    const state = freshMatch();
    const partial = FIXED_DT_SECONDS * 0.4;
    const result = advanceFixedSteps(state, 0, partial, buffer);
    expect(result.ticksAdvanced).toBe(0);
    expect(result.state.tick).toBe(state.tick);
    expect(result.remainderSeconds).toBeCloseTo(partial, 10);
  });

  it('consumes exactly the commands scheduled for the tick(s) it advances through', () => {
    const buffer = createCommandBuffer();
    const state = freshMatch();
    const unit = state.entities.units[0]!;
    scheduleCommand(buffer, state.tick, buildMoveCommand([unit.id], { x: unit.transform.position.x + 500, y: 0, z: unit.transform.position.z }));

    const result = advanceFixedSteps(state, 0, FIXED_DT_SECONDS, buffer);
    const movedUnit = result.state.entities.units.find((u) => u.id === unit.id)!;
    // MOVE was applied this tick, so the unit should no longer be sitting exactly at its spawn point.
    expect(movedUnit.commands.length + movedUnit.path.length).toBeGreaterThan(0);
  });

  it('caps the number of ticks advanced per call (MAX_STEPS_PER_FRAME) rather than replaying an unbounded backlog', () => {
    const buffer = createCommandBuffer();
    const state = freshMatch();
    const hugeGap = FIXED_DT_SECONDS * 1000; // simulate a long-backgrounded tab
    const result = advanceFixedSteps(state, 0, hugeGap, buffer, 8);
    expect(result.ticksAdvanced).toBe(8);
    expect(result.remainderSeconds).toBe(0); // excess backlog is dropped, not carried forward
  });

  it('is deterministic given the same starting state + command buffer contents', () => {
    const bufferA = createCommandBuffer();
    const bufferB = createCommandBuffer();
    const stateA = freshMatch();
    const stateB = freshMatch();
    const unitA = stateA.entities.units[0]!;
    const unitB = stateB.entities.units[0]!;
    scheduleCommand(bufferA, stateA.tick, buildMoveCommand([unitA.id], { x: 999, y: 0, z: 999 }));
    scheduleCommand(bufferB, stateB.tick, buildMoveCommand([unitB.id], { x: 999, y: 0, z: 999 }));

    const resultA = advanceFixedSteps(stateA, 0, FIXED_DT_SECONDS * 5, bufferA);
    const resultB = advanceFixedSteps(stateB, 0, FIXED_DT_SECONDS * 5, bufferB);
    expect(JSON.stringify(resultA.state)).toBe(JSON.stringify(resultB.state));
  });
});
