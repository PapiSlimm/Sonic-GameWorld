// Ported from docs/reference/global-dominance/src/engine/GameEngine.ts's `victorySystem`
// (docs/RTS-CONTRACTS.md §3), generalized from exactly 2 factions to N: victory is declared once
// exactly one of the match's configured factions still has a surviving (health > 0) building,
// after `VICTORY_GRACE_SECONDS` of session time have elapsed (same grace period as the
// reference, to avoid an instant win before any building has taken damage). Idempotent — once a
// winner is set, subsequent calls are no-ops, matching `status` flipping to `GAME_OVER`.
import { VICTORY_GRACE_SECONDS } from '../constants';
import type { RTSMatchState } from '../types';

export function victorySystem(state: RTSMatchState): void {
  if (state.winnerFactionId || state.status === 'GAME_OVER') return;
  if (state.factions.length < 2) return; // no opponent configured — nothing to "win" against

  const aliveFactions = new Set<string>();
  for (const building of state.entities.buildings) {
    if (building.health > 0) aliveFactions.add(building.factionId);
  }

  if (aliveFactions.size === 1 && state.sessionTime > VICTORY_GRACE_SECONDS) {
    const [winner] = aliveFactions;
    state.winnerFactionId = winner ?? null;
    state.status = 'GAME_OVER';
  }
}
