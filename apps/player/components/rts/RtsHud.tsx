'use client';

import { AlertTriangle, Swords, Trophy, UserCheck, Video } from 'lucide-react';
import { Badge, Button, Kbd } from '@sonic-gameworld/ui';
import { RTS_FACTIONS, type RTSMatchState } from '@sonic-gameworld/rts-sim';
import { factionColor } from './rtsTheme';

export interface RtsHudProps {
  match: RTSMatchState;
  localFactionId?: string;
  selectedUnitIds: string[];
  possessedUnitId: string | null;
  desynced: boolean;
  /** docs/RTS-CONTRACTS.md §9: the faction id currently mid coordinated-strike (Pro-difficulty
   * allied-nation ambush), or null — see `lib/rts/alliedStrike.ts`. Rendered as a clear warning
   * banner per the spec's explicit "not a silent ambush" instruction. */
  alliedStrikeFactionId: string | null;
  onPossess: (unitId: string) => void;
  onReleasePossession: () => void;
}

function factionName(factionId: string | undefined | null): string {
  if (!factionId) return 'Unknown';
  return RTS_FACTIONS.find((f) => f.id === factionId)?.name ?? factionId;
}

/**
 * Top-level RTS HUD composition (docs/RTS-CONTRACTS.md §7): the "possess" button that appears when
 * exactly one unit is selected, the desync warning banner (detection only — see
 * `lib/rts/store.ts`'s `receiveRemoteStateHash`, no reconciliation is attempted), and the
 * game-over banner. Actual keyboard handling (Escape releases possession — the "documented way
 * back to the RTS overview camera") lives in `RtsViewport.tsx`, which owns the canvas/engine and
 * therefore the `keydown` listener; this component only documents the keybind via the `<Kbd>` hint
 * next to the release button so the affordance is discoverable without a keypress.
 */
export function RtsHud({
  match,
  localFactionId,
  selectedUnitIds,
  possessedUnitId,
  desynced,
  alliedStrikeFactionId,
  onPossess,
  onReleasePossession,
}: RtsHudProps) {
  const soleSelectedId = selectedUnitIds.length === 1 ? selectedUnitIds[0] : undefined;
  const canPossessSelection = !!soleSelectedId && soleSelectedId !== possessedUnitId;
  const gameOver = match.status === 'GAME_OVER';

  return (
    <div className="pointer-events-none flex h-full flex-col justify-between p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-panel border border-border bg-panel/90 px-3 py-1.5 backdrop-blur">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: factionColor(localFactionId ?? '') }} aria-hidden />
          <span className="font-hud text-xs uppercase tracking-wider text-text/80">{factionName(localFactionId)}</span>
          <span className="font-hud text-[10px] tabular-nums text-muted">tick {match.tick}</span>
        </div>

        {desynced && (
          <Badge tone="danger" dot className="pointer-events-auto">
            <AlertTriangle className="h-3 w-3" aria-hidden /> Desync detected — simulation state has diverged from a peer (detection only, no
            auto-recovery yet)
          </Badge>
        )}
      </div>

      {alliedStrikeFactionId && (
        <div className="pointer-events-auto mx-auto flex items-center gap-2 rounded-panel border border-danger/60 bg-danger/20 px-4 py-2 text-center backdrop-blur">
          <Swords className="h-4 w-4 shrink-0 text-danger" aria-hidden />
          <span className="text-sm font-medium text-text">
            {factionName(alliedStrikeFactionId)} has called in allied reinforcements — a coordinated strike is inbound!
          </span>
        </div>
      )}

      {gameOver && (
        <div className="pointer-events-auto mx-auto flex flex-col items-center gap-2 rounded-panel border border-border bg-panel/95 px-6 py-5 text-center backdrop-blur">
          <Trophy className="h-8 w-8 text-warn" aria-hidden />
          <h2 className="text-lg font-semibold text-text">
            {match.winnerFactionId ? `${factionName(match.winnerFactionId)} wins` : 'Draw'}
          </h2>
          {match.winnerFactionId === localFactionId && <p className="text-sm text-accent">Victory!</p>}
        </div>
      )}

      <div className="flex items-center justify-center gap-3">
        {possessedUnitId ? (
          <Button
            variant="secondary"
            onClick={onReleasePossession}
            className="pointer-events-auto"
            rightIcon={<Kbd>Esc</Kbd>}
          >
            <Video className="h-4 w-4" aria-hidden /> Return to overview
          </Button>
        ) : (
          canPossessSelection && (
            <Button variant="primary" onClick={() => onPossess(soleSelectedId!)} className="pointer-events-auto">
              <UserCheck className="h-4 w-4" aria-hidden /> Possess unit
            </Button>
          )
        )}
      </div>
    </div>
  );
}
