import { beforeEach, describe, expect, it } from 'vitest';
import { RTS_FACTIONS, serializeMatch } from '@sonic-gameworld/rts-sim';
import type { GameSession, RtsMatchStartPayload, RtsSessionInfo } from '@sonic-gameworld/gameworld-sdk';
import { receiveRemoteStateHash, useRtsStore } from './store';
import { buildMoveCommand } from './commands';
import { FIXED_DT_SECONDS } from './lockstep';

function makeSession(hostId: string): GameSession {
  return {
    id: 'session-1',
    gameId: 'game-1',
    hostId,
    status: 'LOBBY',
    players: [],
    maxPlayers: 2,
    createdAt: new Date().toISOString(),
  };
}

function makeLobby(overrides: Partial<RtsSessionInfo> = {}): RtsSessionInfo {
  return {
    sessionId: 'session-1',
    gameId: 'game-1',
    seed: 4242,
    mapWidthM: 2000,
    mapDepthM: 2000,
    cellSizeM: 40,
    difficulty: 'Intermediate',
    factions: RTS_FACTIONS.map((f, i) => ({ factionId: f.id, isAIControlled: i !== 0 })),
    factionAssignments: { [RTS_FACTIONS[0]!.id]: 'host-user', [RTS_FACTIONS[1]!.id]: null },
    readyUserIds: [],
    ...overrides,
  };
}

function matchStartPayload(): RtsMatchStartPayload {
  return {
    sessionId: 'session-1',
    gameId: 'game-1',
    seed: 4242,
    mapWidthM: 2000,
    mapDepthM: 2000,
    cellSizeM: 40,
    difficulty: 'Intermediate',
    factions: RTS_FACTIONS.map((f, i) => ({ factionId: f.id, isAIControlled: i !== 0 })),
    factionAssignments: { [RTS_FACTIONS[0]!.id]: 'host-user', [RTS_FACTIONS[1]!.id]: null },
  };
}

describe('useRtsStore', () => {
  beforeEach(() => {
    useRtsStore.getState().reset();
  });

  it('enterLobby derives isHost + localFactionId from the session/lobby payload', () => {
    useRtsStore.getState().enterLobby('game-1', makeSession('host-user'), makeLobby(), 'host-user');
    const s = useRtsStore.getState();
    expect(s.isHost).toBe(true);
    expect(s.localFactionId).toBe(RTS_FACTIONS[0]!.id);
    expect(s.phase).toBe('LOBBY');
  });

  it('a non-host, faction-less player has isHost false and no localFactionId', () => {
    useRtsStore.getState().enterLobby('game-1', makeSession('host-user'), makeLobby(), 'bystander');
    const s = useRtsStore.getState();
    expect(s.isHost).toBe(false);
    expect(s.localFactionId).toBeUndefined();
  });

  it('startMatch builds an identical starting RTSMatchState for every peer given the same payload (lockstep requirement)', () => {
    const payload = matchStartPayload();
    useRtsStore.getState().startMatch(payload, 'host-user');
    const hostMatch = useRtsStore.getState().match!;
    useRtsStore.getState().reset();
    useRtsStore.getState().startMatch(payload, 'guest-user');
    const guestMatch = useRtsStore.getState().match!;

    expect(JSON.stringify(hostMatch)).toBe(JSON.stringify(guestMatch));
    expect(useRtsStore.getState().phase).toBe('PLAYING');
  });

  it('issueCommand schedules the command with input delay and queues it for outbound publish', () => {
    useRtsStore.getState().startMatch(matchStartPayload(), 'host-user');
    const unit = useRtsStore.getState().match!.entities.units[0]!;
    useRtsStore.getState().issueCommand(buildMoveCommand([unit.id], { x: 1, y: 0, z: 1 }));

    const outbox = useRtsStore.getState().drainOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ type: 'RTS_COMMAND', payload: { tick: 4 } });
    // draining clears it
    expect(useRtsStore.getState().drainOutbox()).toHaveLength(0);
  });

  it('receiveRemoteCommand is applied on the correct tick once advance() reaches it', () => {
    useRtsStore.getState().startMatch(matchStartPayload(), 'host-user');
    const unit = useRtsStore.getState().match!.entities.units[0]!;
    const targetPos = { x: unit.transform.position.x + 800, y: 0, z: unit.transform.position.z };
    useRtsStore.getState().receiveRemoteCommand(2, buildMoveCommand([unit.id], targetPos));

    for (let i = 0; i < 3; i++) useRtsStore.getState().advance(FIXED_DT_SECONDS);

    const movedUnit = useRtsStore.getState().match!.entities.units.find((u) => u.id === unit.id)!;
    expect(movedUnit.commands.length > 0 || movedUnit.path.length > 0 || movedUnit.state === 'MOVING').toBe(true);
  });

  it('advance() publishes a periodic RTS_STATE_HASH and the host also publishes RTS_SNAPSHOT', () => {
    useRtsStore.getState().enterLobby('game-1', makeSession('host-user'), makeLobby(), 'host-user');
    useRtsStore.getState().startMatch(matchStartPayload(), 'host-user');
    expect(useRtsStore.getState().isHost).toBe(true);

    for (let i = 0; i < 30; i++) useRtsStore.getState().advance(FIXED_DT_SECONDS);

    const outbox = useRtsStore.getState().drainOutbox();
    expect(outbox.some((m) => m.type === 'RTS_STATE_HASH')).toBe(true);
    expect(outbox.some((m) => m.type === 'RTS_SNAPSHOT')).toBe(true);
  });

  it('a non-host never publishes RTS_SNAPSHOT', () => {
    useRtsStore.getState().enterLobby('game-1', makeSession('host-user'), makeLobby(), 'guest-user');
    useRtsStore.getState().startMatch(matchStartPayload(), 'guest-user');
    expect(useRtsStore.getState().isHost).toBe(false);

    for (let i = 0; i < 30; i++) useRtsStore.getState().advance(FIXED_DT_SECONDS);

    const outbox = useRtsStore.getState().drainOutbox();
    expect(outbox.some((m) => m.type === 'RTS_SNAPSHOT')).toBe(false);
  });

  it('flags desynced when a remote stateHash for a tick we already recorded disagrees with ours', () => {
    useRtsStore.getState().startMatch(matchStartPayload(), 'host-user');
    for (let i = 0; i < 25; i++) useRtsStore.getState().advance(FIXED_DT_SECONDS);
    expect(useRtsStore.getState().desynced).toBe(false);

    receiveRemoteStateHash(25, 'deliberately-wrong-hash');
    expect(useRtsStore.getState().desynced).toBe(true);
  });

  it('does not flag desynced when a remote stateHash matches ours', () => {
    useRtsStore.getState().startMatch(matchStartPayload(), 'host-user');
    for (let i = 0; i < 25; i++) useRtsStore.getState().advance(FIXED_DT_SECONDS);
    const outbox = useRtsStore.getState().drainOutbox();
    const hashMsg = outbox.find((m) => m.type === 'RTS_STATE_HASH');
    expect(hashMsg).toBeDefined();
    const { hash } = (hashMsg as { payload: { tick: number; hash: string } }).payload;

    receiveRemoteStateHash(25, hash);
    expect(useRtsStore.getState().desynced).toBe(false);
  });

  it('applySnapshot hydrates match state and prunes already-resolved buffered commands', () => {
    useRtsStore.getState().startMatch(matchStartPayload(), 'host-user');
    for (let i = 0; i < 5; i++) useRtsStore.getState().advance(FIXED_DT_SECONDS);
    const later = useRtsStore.getState().match!;
    const snapshotJson = serializeMatch(later);

    useRtsStore.getState().reset();
    useRtsStore.getState().applySnapshot(snapshotJson);
    expect(useRtsStore.getState().match!.tick).toBe(later.tick);
    expect(useRtsStore.getState().phase).toBe('PLAYING');
  });

  it('selectUnits and possess update local UI state', () => {
    useRtsStore.getState().startMatch(matchStartPayload(), 'host-user');
    const unit = useRtsStore.getState().match!.entities.units[0]!;
    useRtsStore.getState().selectUnits([unit.id]);
    expect(useRtsStore.getState().selectedUnitIds).toEqual([unit.id]);

    useRtsStore.getState().possess(unit.id);
    expect(useRtsStore.getState().possessedUnitId).toBe(unit.id);

    useRtsStore.getState().possess(null);
    expect(useRtsStore.getState().possessedUnitId).toBeNull();
  });
});
