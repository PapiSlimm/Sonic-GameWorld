import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RTS_FACTIONS } from '@sonic-gameworld/rts-sim';
import type { GameSession, RtsSessionInfo } from '@sonic-gameworld/gameworld-sdk';
import { RtsLobby } from './RtsLobby';

const session: GameSession = {
  id: 'session-1',
  gameId: 'game-1',
  hostId: 'host-user',
  status: 'LOBBY',
  players: [],
  maxPlayers: 2,
  createdAt: new Date().toISOString(),
};

function lobby(overrides: Partial<RtsSessionInfo> = {}): RtsSessionInfo {
  return {
    sessionId: 'session-1',
    gameId: 'game-1',
    seed: 1,
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

describe('RtsLobby', () => {
  it('renders both factions, the host invite panel, and a disabled Ready button before joining', () => {
    const html = renderToStaticMarkup(
      <RtsLobby
        gameName="Global Dominance"
        session={session}
        lobby={lobby()}
        localUserId="guest-user"
        isHost={false}
        busy={false}
        shareUrl="https://play.example/g/game-1/rts?join=session-1"
        onJoinFaction={() => {}}
        onReady={() => {}}
      />,
    );

    expect(html).toContain(RTS_FACTIONS[0]!.name);
    expect(html).toContain(RTS_FACTIONS[1]!.name);
    expect(html).toContain('AI');
    expect(html).toContain('Join a faction to ready up.');
    expect(html).not.toContain('Invite players'); // not the host
  });

  it('shows the invite panel to the host and "Waiting for other players…" once the local player is ready', () => {
    const html = renderToStaticMarkup(
      <RtsLobby
        gameName="Global Dominance"
        session={session}
        lobby={lobby({ readyUserIds: ['host-user'] })}
        localUserId="host-user"
        isHost
        busy={false}
        shareUrl="https://play.example/g/game-1/rts?join=session-1"
        onJoinFaction={() => {}}
        onReady={() => {}}
      />,
    );

    expect(html).toContain('Invite players');
    expect(html).toContain('session-1');
    expect(html).toContain('Waiting for other players');
  });

  it('surfaces a lobby error message', () => {
    const html = renderToStaticMarkup(
      <RtsLobby
        gameName="Global Dominance"
        session={session}
        lobby={lobby()}
        localUserId="guest-user"
        isHost={false}
        busy={false}
        error="That faction was just taken."
        shareUrl=""
        onJoinFaction={() => {}}
        onReady={() => {}}
      />,
    );
    expect(html).toContain('That faction was just taken.');
  });
});
