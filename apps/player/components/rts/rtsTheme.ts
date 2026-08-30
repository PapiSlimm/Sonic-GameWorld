/**
 * Team-color identity (docs/RTS-CONTRACTS.md §9): Raven Alliance renders Blue throughout; United
 * Dragon Nations renders Red on Urban/Sea maps or Green on Jungle maps. Biome selection is a
 * Studio-authoring concern (§6/§9) that hasn't landed in this app's scope — §9 explicitly frames
 * biome-driven HUD theming as reconciled in the final integration pass (#12) — so this keeps the
 * simple, always-correct baseline (Blue vs. Red) rather than guessing a biome.
 */
import { RTS_FACTIONS } from '@sonic-gameworld/rts-sim';

export const FACTION_COLOR: Record<string, string> = {
  [RTS_FACTIONS[0]?.id ?? 'raven-alliance']: '#3B82F6', // Raven Alliance — Blue
  [RTS_FACTIONS[1]?.id ?? 'united-dragon-nations']: '#EF4444', // United Dragon Nations — Red (Urban/Sea default)
};

export function factionColor(factionId: string): string {
  return FACTION_COLOR[factionId] ?? '#8892A6';
}
