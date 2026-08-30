/**
 * Fixed-step lockstep driving logic for the RTS play mode (docs/RTS-CONTRACTS.md §5/§7) — kept
 * framework/network-free (no React, no `fetch`, no `WebSocket`) so it's trivially unit-testable in
 * isolation, matching this app's existing convention (`lib/engine/controller.ts` is the same
 * split: pure math here, `RtsViewport.tsx` wires it into a `requestAnimationFrame` loop + the
 * realtime relay from `lib/sdk.ts`).
 *
 * The model: nobody sends state, everyone sends commands (`RTSCommand`s), and a command targets a
 * specific future tick (`tick + INPUT_DELAY_TICKS`) rather than "now" — the standard lockstep
 * input-delay trick, giving every peer time to receive it before that tick arrives. `CommandBuffer`
 * is the per-tick mailbox both local and remote commands land in; `advanceFixedSteps` drains it as
 * the accumulator crosses each `FIXED_DT_SECONDS` boundary.
 *
 * Known simplification (documented per docs/RTS-CONTRACTS.md §5's honesty requirement): this does
 * NOT stall ticking to wait for a slow peer's command to arrive before its target tick. A command
 * that arrives late is scheduled onto the next tick that hasn't been consumed yet instead of the
 * tick it was actually addressed to (see `scheduleCommand`) — under normal network conditions the
 * `INPUT_DELAY_TICKS` buffer makes this rare, but on a bad connection it can apply a command a few
 * ticks later than a peer with a faster connection did, which is a real (if narrow) desync risk.
 * Correcting it would mean a hard barrier (freeze simulation until every peer's ack for that tick
 * arrives) — real added complexity this pass didn't take on; `stateHash()` desync detection (see
 * `apps/player/lib/rts/store.ts`) is what surfaces the symptom if it ever actually causes drift.
 */
import { TICKS_PER_SECOND, tickMatch, type RTSCommand, type RTSMatchState } from '@sonic-gameworld/rts-sim';

export const FIXED_DT_SECONDS = 1 / TICKS_PER_SECOND;

/** Ticks of artificial delay applied to every command's target tick — within docs/RTS-CONTRACTS.md
 * §5's suggested 3-6 tick (~300-600ms @ 10Hz) range. */
export const INPUT_DELAY_TICKS = 4;

/** Caps how many fixed steps one `advanceFixedSteps` call will run, so a backgrounded tab
 * returning after a long pause doesn't try to replay minutes of ticks in one frame (a classic
 * accumulator "spiral of death"). Excess accumulated time beyond this is simply dropped, matching
 * this being a best-effort real-time simulation, not a deterministic-replay-from-anywhere system. */
export const MAX_STEPS_PER_FRAME = 8;

export interface CommandBuffer {
  pendingByTick: Map<number, RTSCommand[]>;
}

export function createCommandBuffer(): CommandBuffer {
  return { pendingByTick: new Map() };
}

/** Schedules `command` onto `tick`, coalescing with anything else already scheduled there. If
 * `tick` has already been consumed (it's <= `notBeforeTick`, e.g. a late-arriving remote command),
 * it's rescheduled onto `notBeforeTick` instead — see this module's doc comment on why. */
export function scheduleCommand(buffer: CommandBuffer, tick: number, command: RTSCommand, notBeforeTick = 0): void {
  const effectiveTick = Math.max(tick, notBeforeTick);
  const bucket = buffer.pendingByTick.get(effectiveTick);
  if (bucket) bucket.push(command);
  else buffer.pendingByTick.set(effectiveTick, [command]);
}

/** Removes and returns whatever commands were scheduled for `tick` (empty array if none). */
export function takeCommandsForTick(buffer: CommandBuffer, tick: number): RTSCommand[] {
  const bucket = buffer.pendingByTick.get(tick);
  if (!bucket) return [];
  buffer.pendingByTick.delete(tick);
  return bucket;
}

export interface AdvanceResult {
  state: RTSMatchState;
  /** Remaining sub-tick accumulator, to carry into the next frame's call. */
  remainderSeconds: number;
  ticksAdvanced: number;
}

/**
 * Advances `state` by zero or more fixed `FIXED_DT_SECONDS` steps to consume
 * `accumulatorSeconds + frameDtSeconds` of wall-clock time, draining `buffer` for each tick
 * consumed. This is the accumulator loop `RtsViewport.tsx`'s `requestAnimationFrame` callback
 * calls every frame — see `packages/rts-sim`'s README ("drives tickMatch on a
 * requestAnimationFrame-driven fixed-step accumulator, 10Hz").
 */
export function advanceFixedSteps(
  state: RTSMatchState,
  accumulatorSeconds: number,
  frameDtSeconds: number,
  buffer: CommandBuffer,
  maxStepsPerFrame = MAX_STEPS_PER_FRAME,
): AdvanceResult {
  let acc = accumulatorSeconds + Math.max(frameDtSeconds, 0);
  let current = state;
  let steps = 0;

  while (acc >= FIXED_DT_SECONDS && steps < maxStepsPerFrame) {
    const commands = takeCommandsForTick(buffer, current.tick);
    current = tickMatch(current, FIXED_DT_SECONDS, commands);
    acc -= FIXED_DT_SECONDS;
    steps += 1;
  }

  // A capped frame (maxStepsPerFrame hit) drops the remaining backlog rather than carrying an
  // ever-growing accumulator forward — see MAX_STEPS_PER_FRAME's doc comment.
  if (steps >= maxStepsPerFrame) acc = 0;

  return { state: current, remainderSeconds: acc, ticksAdvanced: steps };
}
