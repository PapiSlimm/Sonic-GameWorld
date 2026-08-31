'use client';

import { Bot, Check, Loader2, User } from 'lucide-react';
import { Badge, Button, Panel } from '@sonic-gameworld/ui';
import { RTS_FACTIONS } from '@sonic-gameworld/rts-sim';
import type { GameSession, RtsDifficulty, RtsSessionInfo } from '@sonic-gameworld/gameworld-sdk';
import { FACTION_COLOR } from './rtsTheme';

/** docs/RTS-CONTRACTS.md §9's difficulty presets, in the SDK's wire casing (`RtsDifficulty`) —
 * matches `RTS_DIFFICULTY_PRESETS`' three levels, applied to any faction still AI-controlled once
 * the match starts (`rts-sim`'s `DifficultyLevel`/`FactionSetup.difficulty`). */
const DIFFICULTY_LEVELS: RtsDifficulty[] = ['Beginner', 'Intermediate', 'Pro'];

export interface RtsLobbyProps {
  gameName: string;
  session: GameSession;
  lobby: RtsSessionInfo;
  localUserId: string;
  isHost: boolean;
  busy: boolean;
  error?: string;
  shareUrl: string;
  onJoinFaction: (factionId: string) => void;
  onReady: () => void;
  /** Host-only (docs/RTS-CONTRACTS.md §9's difficulty picker): changes the difficulty applied to
   * any faction still AI-controlled once the match starts. */
  onSetDifficulty: (difficulty: RtsDifficulty) => void;
}

/**
 * Faction/lobby screen before match start (docs/RTS-CONTRACTS.md §7): the host has already created
 * the session (`RtsPlayClient` does that before this renders), other players arrive via the
 * `shareUrl` and pick a faction here (or leave it on AI). Every human player readies up
 * independently; `RTS_MATCH_START` fires once they all have (server-side gate — see
 * `services/api/src/modules/games/index.ts`'s `/sessions/:id/rts/ready`).
 */
export function RtsLobby({ gameName, session, lobby, localUserId, isHost, busy, error, shareUrl, onJoinFaction, onReady, onSetDifficulty }: RtsLobbyProps) {
  const localFactionId = Object.entries(lobby.factionAssignments).find(([, uid]) => uid === localUserId)?.[0];
  const isReady = lobby.readyUserIds.includes(localUserId);
  const humanCount = Object.values(lobby.factionAssignments).filter((v) => v !== null).length;
  const readyCount = lobby.readyUserIds.length;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold text-text">{gameName} — RTS Lobby</h1>
        <p className="text-sm text-muted">
          Session <span className="font-hud text-text/80">{session.id}</span> · {readyCount}/{humanCount} ready
        </p>
      </div>

      {isHost && (
        <Panel title="Invite players">
          <p className="text-sm text-text/80">
            Share this link so others can join a faction. Any faction nobody joins is played by AI.
          </p>
          <code className="mt-2 block truncate rounded-control border border-border bg-bg px-3 py-2 text-xs text-accent">{shareUrl}</code>
        </Panel>
      )}

      <Panel title="Factions">
        <div className="flex flex-col gap-3">
          {RTS_FACTIONS.map((faction) => {
            const holder = lobby.factionAssignments[faction.id];
            const isMine = holder === localUserId;
            const factionReady = holder ? lobby.readyUserIds.includes(holder) : false;
            const color = FACTION_COLOR[faction.id] ?? '#8892A6';
            return (
              <div key={faction.id} className="flex items-center justify-between gap-3 rounded-control border border-border p-3">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                  <div>
                    <div className="text-sm font-medium text-text">{faction.name}</div>
                    <div className="text-xs text-muted">{faction.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {holder ? (
                    <Badge tone={factionReady ? 'success' : 'default'}>
                      <User className="h-3 w-3" aria-hidden /> {isMine ? 'You' : 'Player'} {factionReady && <Check className="h-3 w-3" aria-hidden />}
                    </Badge>
                  ) : (
                    <Badge tone="info">
                      <Bot className="h-3 w-3" aria-hidden /> AI
                    </Badge>
                  )}
                  {!holder && !localFactionId && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => onJoinFaction(faction.id)}>
                      Join
                    </Button>
                  )}
                  {isMine && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => onJoinFaction(faction.id)}>
                      Re-confirm
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="AI difficulty">
        <p className="text-sm text-text/80">
          Applies to any faction still on AI control when the match starts.{' '}
          {!isHost && <span>Currently <span className="text-text">{lobby.difficulty}</span>.</span>}
        </p>
        {isHost ? (
          <div className="mt-2 flex gap-2">
            {DIFFICULTY_LEVELS.map((level) => (
              <Button
                key={level}
                size="sm"
                variant={lobby.difficulty === level ? 'primary' : 'secondary'}
                disabled={busy}
                onClick={() => onSetDifficulty(level)}
              >
                {level}
              </Button>
            ))}
          </div>
        ) : null}
      </Panel>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-3">
        <Button
          size="lg"
          disabled={!localFactionId || isReady || busy}
          onClick={onReady}
          leftIcon={busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : undefined}
        >
          {isReady ? 'Waiting for other players…' : 'Ready'}
        </Button>
        {!localFactionId && <span className="text-xs text-muted">Join a faction to ready up.</span>}
      </div>
    </main>
  );
}
