// §9 depth extension: biome-driven team color + naval-unit helpers. Pure lookups/predicates, no
// simulation state mutated — see docs/RTS-CONTRACTS.md §9 "Biome variants" / "Team-color/visual
// identity" and README.md's "§9 additive extensions" section.
import { RTS_FACTIONS, RTS_UNIT_TYPE_STATS } from './constants';
import type { Biome, RTSUnit, UnitType } from './types';

const [RAVEN_ALLIANCE_ID, UNITED_DRAGON_NATIONS_ID] = RTS_FACTIONS.map((f) => f.id);

/**
 * Raven Alliance renders Blue on every biome. United Dragon Nations renders Red on Urban/Sea maps
 * and Green on Jungle maps (docs/RTS-CONTRACTS.md §9). Keyed by `RTS_FACTIONS` id rather than a
 * hardcoded "faction 1/2" position, since `factionId` is an open string (§2).
 */
export const RTS_TEAM_COLORS_BY_BIOME: Record<Biome, Record<string, string>> = {
  URBAN: { [RAVEN_ALLIANCE_ID!]: '#0033FF', [UNITED_DRAGON_NATIONS_ID!]: '#CC1122' },
  JUNGLE: { [RAVEN_ALLIANCE_ID!]: '#0033FF', [UNITED_DRAGON_NATIONS_ID!]: '#2E8B32' },
  SEA: { [RAVEN_ALLIANCE_ID!]: '#0033FF', [UNITED_DRAGON_NATIONS_ID!]: '#CC1122' },
};

/** Fallback color for a `factionId` not in `RTS_TEAM_COLORS_BY_BIOME` (e.g. a §9 allied faction). */
export const RTS_DEFAULT_TEAM_COLOR = '#888888';

/**
 * Looks up the rendering layer's team color for `factionId` on `biome`. Falls back to
 * `RTS_DEFAULT_TEAM_COLOR` for any faction id this table doesn't know about (e.g. a Pro-difficulty
 * allied faction with its own id — see `src/ai/alliedCoordinator.ts`), rather than throwing.
 */
export function getTeamColor(factionId: string, biome: Biome): string {
  return RTS_TEAM_COLORS_BY_BIOME[biome]?.[factionId] ?? RTS_DEFAULT_TEAM_COLOR;
}

/** True when `unitType` names a `RTS_UNIT_TYPE_STATS` archetype flagged `navalOnly`. */
export function isNavalUnitType(unitType: string | undefined): boolean {
  if (!unitType) return false;
  return RTS_UNIT_TYPE_STATS[unitType as UnitType]?.navalOnly === true;
}

/** True when `unit.unitType` names a naval archetype — see `isNavalUnitType`. */
export function isNavalUnit(unit: RTSUnit): boolean {
  return isNavalUnitType(unit.unitType);
}
