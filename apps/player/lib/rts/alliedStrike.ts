/**
 * HUD-facing preview of docs/RTS-CONTRACTS.md §9's allied-nation coordinated strike, which the
 * spec explicitly asks to "surface in the HUD as a clear warning, not a silent ambush." `tickMatch`
 * (packages/rts-sim) already applies the strike's commands automatically, every AI-think interval,
 * for any faction whose `difficulty` is `'PRO'` and that lists `alliedFactionIds` — but it does so
 * entirely internally (via the normal `applyCommand` path, per §5's lockstep model), with no event
 * or flag left on `RTSMatchState` saying a strike just fired. This module re-runs the same
 * read-only trigger check `evaluateAlliedStrike` performs, purely to answer "is a strike active
 * right now" for the banner — it never applies the commands it computes.
 *
 * Safe without touching the shared lockstep rng: whether `evaluateAlliedStrike` returns any
 * commands at all depends only on the map-control threshold and whether an ally has living units
 * (see its module doc) — the `rng` argument only decides *which* of an ally's units join the
 * strike, never *whether* one is returned. A throwaway, non-shared rng here is therefore a safe,
 * read-only preview that can never desync the match (it's never fed back into `tickMatch`).
 */
import { createRng, evaluateAlliedStrike, type RTSMatchState } from '@sonic-gameworld/rts-sim';

/**
 * Returns the `factionId` of the first PRO-difficulty, allied faction whose coordinated-strike
 * condition is active this tick, or `null` if none is. Mirrors exactly the condition `tickMatch`
 * itself gates `evaluateAlliedStrike` on (docs/RTS-CONTRACTS.md §9's README: "difficulty is 'PRO'
 * and it has allies listed").
 */
export function detectAlliedStrikeWarning(match: RTSMatchState): string | null {
  for (const faction of match.factions) {
    if (faction.difficulty !== 'PRO' || !faction.alliedFactionIds || faction.alliedFactionIds.length === 0) continue;
    const commands = evaluateAlliedStrike(match, faction.factionId, faction.alliedFactionIds, createRng(1));
    if (commands.length > 0) return faction.factionId;
  }
  return null;
}
