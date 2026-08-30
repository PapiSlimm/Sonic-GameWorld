'use client';

/**
 * RTS play-mode state (docs/RTS-CONTRACTS.md §7), following this app's existing Zustand
 * convention (`lib/store/playerStore.ts`). Unlike that store this one is NOT persisted — a match
 * is a live, in-memory session, not durable player progress.
 *
 * Network I/O intentionally stays OUT of this store (same split `lib/store/playerStore.ts` +
 * `PlayClient.tsx` already use: the store holds/derives state, the component does the actual
 * fetch/websocket calls) — this store only ever *decides* what needs to go out over the wire, via
 * `outbox`, which the component (`RtsPlayClient.tsx`) drains every frame and hands to the realtime
 * connection's `publish()`. That keeps every state transition here synchronous and unit-testable
 * without mocking `WebSocket`.
 */
import { create } from 'zustand';
import {
  createMatch,
  deserializeMatch,
  serializeMatch,
  stateHash,
  RTS_FACTIONS,
  type FactionSetup,
  type RTSCommand,
  type RTSMatchState,
} from '@sonic-gameworld/rts-sim';
import type { GameSession, RtsMatchStartPayload, RtsSessionInfo } from '@sonic-gameworld/gameworld-sdk';
import { seedStartingScenario } from './scenario';
import { advanceFixedSteps, createCommandBuffer, scheduleCommand, type CommandBuffer } from './lockstep';

/** How often (in ticks) every peer publishes `stateHash()` for desync *detection* — not
 * correction (docs/RTS-CONTRACTS.md §5, a documented known limitation). 25 ticks @ 10Hz ≈ 2.5s. */
export const STATE_HASH_INTERVAL_TICKS = 25;
/** How often (in ticks) the host publishes a full `serializeMatch()` snapshot for reconnect/
 * late-join (§5 picks this over full command replay from tick 0 — see this file's doc comment on
 * `applySnapshot`). 30 ticks @ 10Hz ≈ 3s, matching the contract's suggested cadence. */
export const SNAPSHOT_INTERVAL_TICKS = 30;
/** How many ticks of local hash history to keep for matching against a same-tick remote hash that
 * arrives after we've already moved past that tick — bounded so this never grows unbounded over a
 * long match. */
const HASH_HISTORY_LIMIT = 40;

export type RtsOutboxMessage =
  | { type: 'RTS_COMMAND'; payload: { tick: number; command: RTSCommand } }
  | { type: 'RTS_STATE_HASH'; payload: { tick: number; hash: string } }
  | { type: 'RTS_SNAPSHOT'; payload: { tick: number; state: string } };

export type RtsPhase = 'LOBBY' | 'WAITING_FOR_SYNC' | 'PLAYING' | 'GAME_OVER';

interface RtsState {
  phase: RtsPhase;
  gameId?: string;
  session?: GameSession;
  lobby?: RtsSessionInfo;
  localUserId?: string;
  localFactionId?: string;
  isHost: boolean;

  match?: RTSMatchState;
  buffer: CommandBuffer;
  accumulatorSeconds: number;

  selectedUnitIds: string[];
  possessedUnitId: string | null;

  desynced: boolean;
  localHashHistory: Map<number, string>;
  pendingRemoteHashes: Map<number, string>;

  outbox: RtsOutboxMessage[];

  // ---- lobby ----
  enterLobby(gameId: string, session: GameSession, lobby: RtsSessionInfo, localUserId: string): void;
  updateLobby(session: GameSession, lobby: RtsSessionInfo): void;

  // ---- match lifecycle ----
  /** Every peer calls this identically on `RTS_MATCH_START` — createMatch() + the same starting
   * scenario, from the same seed, so every client's local `rts-sim` instance begins identical. */
  startMatch(payload: RtsMatchStartPayload, localUserId: string): void;
  /** Reconnect/late-join path (§5): hydrate straight from a host-published snapshot instead of
   * waiting through a full command replay from tick 0. */
  applySnapshot(json: string): void;

  // ---- simulation ----
  advance(frameDtSeconds: number): void;

  // ---- commands ----
  /** Schedules a LOCAL player's command onto the shared timeline (current tick + input delay) and
   * queues it for outbound publish — call this from input handling, never `receiveRemoteCommand`. */
  issueCommand(command: RTSCommand): void;
  /** A command published by another peer, arriving over the realtime relay. */
  receiveRemoteCommand(tick: number, command: RTSCommand): void;

  // ---- selection / possession ----
  selectUnits(ids: string[]): void;
  possess(unitId: string | null): void;

  // ---- outbox ----
  drainOutbox(): RtsOutboxMessage[];

  reset(): void;
}

function factionAssignmentsToSetups(factionAssignments: Record<string, string | null>): FactionSetup[] {
  return RTS_FACTIONS.map((faction) => ({ factionId: faction.id, isAIControlled: factionAssignments[faction.id] == null }));
}

export const useRtsStore = create<RtsState>()((set, get) => ({
  phase: 'LOBBY',
  isHost: false,
  buffer: createCommandBuffer(),
  accumulatorSeconds: 0,
  selectedUnitIds: [],
  possessedUnitId: null,
  desynced: false,
  localHashHistory: new Map(),
  pendingRemoteHashes: new Map(),
  outbox: [],

  enterLobby(gameId, session, lobby, localUserId) {
    set({
      phase: 'LOBBY',
      gameId,
      session,
      lobby,
      localUserId,
      isHost: session.hostId === localUserId,
      localFactionId: Object.entries(lobby.factionAssignments).find(([, uid]) => uid === localUserId)?.[0],
    });
  },

  updateLobby(session, lobby) {
    const localUserId = get().localUserId;
    set({
      session,
      lobby,
      localFactionId: localUserId ? Object.entries(lobby.factionAssignments).find(([, uid]) => uid === localUserId)?.[0] : undefined,
    });
  },

  startMatch(payload, localUserId) {
    const factions = factionAssignmentsToSetups(payload.factionAssignments);
    const fresh = seedStartingScenario(
      createMatch({ seed: payload.seed, mapWidthM: payload.mapWidthM, mapDepthM: payload.mapDepthM, cellSizeM: payload.cellSizeM, factions }),
    );
    set({
      phase: 'PLAYING',
      match: fresh,
      buffer: createCommandBuffer(),
      accumulatorSeconds: 0,
      selectedUnitIds: [],
      possessedUnitId: null,
      desynced: false,
      localHashHistory: new Map(),
      pendingRemoteHashes: new Map(),
      outbox: [],
      localFactionId: Object.entries(payload.factionAssignments).find(([, uid]) => uid === localUserId)?.[0],
    });
  },

  applySnapshot(json) {
    const state = deserializeMatch(json);
    const currentBuffer = get().buffer;
    // Anything scheduled at-or-before the snapshot's tick is moot (already resolved on whichever
    // peer authored the snapshot); anything scheduled for a later tick is still meaningful.
    const prunedBuffer = createCommandBuffer();
    for (const [tick, commands] of currentBuffer.pendingByTick) {
      if (tick > state.tick) prunedBuffer.pendingByTick.set(tick, commands);
    }
    set({ phase: 'PLAYING', match: state, buffer: prunedBuffer, accumulatorSeconds: 0, desynced: false });
  },

  advance(frameDtSeconds) {
    const { match, buffer, accumulatorSeconds, isHost, localHashHistory, pendingRemoteHashes, outbox } = get();
    if (!match) return;

    const result = advanceFixedSteps(match, accumulatorSeconds, frameDtSeconds, buffer);
    if (result.ticksAdvanced === 0) {
      set({ match: result.state, accumulatorSeconds: result.remainderSeconds });
      return;
    }

    const nextOutbox = outbox.slice();
    const nextHashHistory = new Map(localHashHistory);
    const nextPendingRemote = new Map(pendingRemoteHashes);
    let desynced = get().desynced;

    if (result.state.tick > 0 && result.state.tick % STATE_HASH_INTERVAL_TICKS === 0) {
      const hash = stateHash(result.state);
      nextHashHistory.set(result.state.tick, hash);
      if (nextHashHistory.size > HASH_HISTORY_LIMIT) {
        const oldest = Math.min(...nextHashHistory.keys());
        nextHashHistory.delete(oldest);
      }
      nextOutbox.push({ type: 'RTS_STATE_HASH', payload: { tick: result.state.tick, hash } });

      const pendingForThisTick = nextPendingRemote.get(result.state.tick);
      if (pendingForThisTick !== undefined) {
        if (pendingForThisTick !== hash) desynced = true;
        nextPendingRemote.delete(result.state.tick);
      }
    }

    if (isHost && result.state.tick > 0 && result.state.tick % SNAPSHOT_INTERVAL_TICKS === 0) {
      nextOutbox.push({ type: 'RTS_SNAPSHOT', payload: { tick: result.state.tick, state: serializeMatch(result.state) } });
    }

    const gameOver = result.state.status === 'GAME_OVER';
    set({
      match: result.state,
      accumulatorSeconds: result.remainderSeconds,
      outbox: nextOutbox,
      localHashHistory: nextHashHistory,
      pendingRemoteHashes: nextPendingRemote,
      desynced,
      phase: gameOver ? 'GAME_OVER' : get().phase,
    });
  },

  issueCommand(command) {
    const { match, buffer, outbox } = get();
    if (!match) return;
    const targetTick = match.tick + 4; // INPUT_DELAY_TICKS, see lib/rts/lockstep.ts
    scheduleCommand(buffer, targetTick, command, match.tick);
    set({ buffer, outbox: [...outbox, { type: 'RTS_COMMAND', payload: { tick: targetTick, command } }] });
  },

  receiveRemoteCommand(tick, command) {
    const { match, buffer } = get();
    if (!match) return;
    scheduleCommand(buffer, tick, command, match.tick);
    set({ buffer });
  },

  selectUnits(ids) {
    set({ selectedUnitIds: ids });
  },

  possess(unitId) {
    set({ possessedUnitId: unitId });
  },

  drainOutbox() {
    const outbox = get().outbox;
    if (outbox.length > 0) set({ outbox: [] });
    return outbox;
  },

  reset() {
    set({
      phase: 'LOBBY',
      gameId: undefined,
      session: undefined,
      lobby: undefined,
      localUserId: undefined,
      localFactionId: undefined,
      isHost: false,
      match: undefined,
      buffer: createCommandBuffer(),
      accumulatorSeconds: 0,
      selectedUnitIds: [],
      possessedUnitId: null,
      desynced: false,
      localHashHistory: new Map(),
      pendingRemoteHashes: new Map(),
      outbox: [],
    });
  },
}));

/** Records a remote peer's periodic `stateHash()` for the desync check `advance()` performs —
 * exported standalone (rather than a store method) because it needs to reach *past* commands too
 * (a hash for a tick we've already advanced past should compare immediately). */
export function receiveRemoteStateHash(tick: number, hash: string): void {
  const store = useRtsStore.getState();
  const localHash = store.localHashHistory.get(tick);
  if (localHash !== undefined) {
    if (localHash !== hash) useRtsStore.setState({ desynced: true });
    return;
  }
  if (store.match && tick <= store.match.tick) return; // already past and we never recorded one — nothing to compare
  const pending = new Map(store.pendingRemoteHashes);
  pending.set(tick, hash);
  useRtsStore.setState({ pendingRemoteHashes: pending });
}
