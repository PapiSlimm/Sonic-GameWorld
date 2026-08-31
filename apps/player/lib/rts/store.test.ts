import { beforeEach, describe, expect, it } from 'vitest';
import { ALLIED_STRIKE_MAP_CONTROL_THRESHOLD, RTS_BUILDING_STATS, RTS_FACTIONS, RTS_UNIT_STATS, serializeMatch, type RTSBuilding, type RTSUnit } from '@sonic-gameworld/rts-sim';
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

function matchStartPayload(overrides: Partial<RtsMatchStartPayload> = {}): RtsMatchStartPayload {
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
    ...overrides,
  };
}

function building(factionId: string, cellX: number): RTSBuilding {
  return {
    id: `test-building-${factionId}-${cellX}`,
    factionId,
    buildingClass: 'BARRACKS',
    cellX,
    cellZ: 0,
    sizeCells: { ...RTS_BUILDING_STATS.BARRACKS.sizeCells },
    health: RTS_BUILDING_STATS.BARRACKS.health,
    maxHealth: RTS_BUILDING_STATS.BARRACKS.health,
    isOperational: true,
  };
}

function allyUnit(factionId: string): RTSUnit {
  const stats = RTS_UNIT_STATS.INFANTRY;
  return {
    id: `test-ally-unit-${factionId}`,
    factionId,
    unitClass: 'INFANTRY',
    transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    path: [],
    health: stats.health,
    maxHealth: stats.health,
    speed: stats.speed,
    attackRange: stats.attackRange,
    damage: stats.damage,
    detectionRadius: stats.detectionRadius,
    state: 'IDLE',
    commands: [],
    targetNodeId: null,
    lastFiredAtTick: 0,
    harvestedSotolium: 0,
    isDetected: true,
    heat: 0,
    isSelected: false,
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

  it('startMatch applies the session difficulty to AI-controlled factions only (docs/RTS-CONTRACTS.md §9)', () => {
    useRtsStore.getState().startMatch(matchStartPayload({ difficulty: 'Pro' }), 'host-user');
    const { match } = useRtsStore.getState();
    const humanFaction = match!.factions.find((f) => f.factionId === RTS_FACTIONS[0]!.id)!;
    const aiFaction = match!.factions.find((f) => f.factionId === RTS_FACTIONS[1]!.id)!;
    expect(humanFaction.difficulty).toBeUndefined();
    expect(aiFaction.difficulty).toBe('PRO');
  });

  it('threads the default Intermediate difficulty from matchStartPayload() onto the AI faction', () => {
    useRtsStore.getState().startMatch(matchStartPayload(), 'host-user');
    const { match } = useRtsStore.getState();
    const aiFaction = match!.factions.find((f) => f.factionId === RTS_FACTIONS[1]!.id)!;
    expect(aiFaction.difficulty).toBe('INTERMEDIATE');
  });

  it('advance() surfaces an allied-strike warning once a PRO faction with allies crosses the map-control threshold', () => {
    const ALLY = 'allied-faction-1';
    useRtsStore.getState().startMatch(matchStartPayload(), 'host-user');
    const dragonId = RTS_FACTIONS[1]!.id;
    const match = useRtsStore.getState().match!;

    // Give Dragon overwhelming building control and the ally a unit to strike with.
    for (const b of match.entities.buildings) b.factionId = dragonId;
    match.entities.buildings.push(building(dragonId, 900));
    match.factions = match.factions.map((f) => (f.factionId === dragonId ? { ...f, difficulty: 'PRO', alliedFactionIds: [ALLY] } : f));
    match.entities.units.push(allyUnit(ALLY));
    useRtsStore.setState({ match });
    expect(ALLIED_STRIKE_MAP_CONTROL_THRESHOLD).toBeLessThan(1);

    useRtsStore.getState().advance(FIXED_DT_SECONDS);
    expect(useRtsStore.getState().alliedStrikeFactionId).toBe(dragonId);
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
