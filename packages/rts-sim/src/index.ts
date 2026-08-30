// Public API for @sonic-gameworld/rts-sim — see README.md for full documentation, an integration
// walkthrough, and the "integration points other packages need" section. This file's exports are
// pinned exactly per docs/RTS-CONTRACTS.md §4; other in-progress efforts (3D rendering,
// multiplayer relay, player UI) build against these names, so changing them is a breaking change
// to work already in flight.
import { evaluateAlliedStrike } from './ai/alliedCoordinator';
import { runCommanderAI } from './ai/commanderAI';
import { AI_THINK_INTERVAL_TICKS, STARTING_CREDITS } from './constants';
import { createRng, rngFromState } from './rng';
import { applyCommand, commandSystem } from './systems/commandSystem';
import { combatSystem } from './systems/combatSystem';
import { fogOfWarSystem } from './systems/fogOfWarSystem';
import { harvestingSystem } from './systems/harvestingSystem';
import { movementSystem } from './systems/movementSystem';
import { enqueueProduction, productionSystem } from './systems/productionSystem';
import { projectileSystem } from './systems/projectileSystem';
import { buildSpatialGridForUnits } from './systems/spatialGrid';
import { victorySystem } from './systems/victorySystem';
import type { Biome, FactionSetup, RTSCommand, RTSMap, RTSMatchState } from './types';

// ---------------------------------------------------------------------------------------------
// createMatch
// ---------------------------------------------------------------------------------------------

export interface CreateMatchOptions {
  seed: number;
  mapWidthM: number;
  mapDepthM: number;
  cellSizeM: number;
  factions: FactionSetup[];
  /**
   * §9 depth extension. Defaults to `'URBAN'` — see `RTSMap.biome`'s doc for what it drives
   * (team color, naval unit placement/steering).
   */
  biome?: Biome;
  /**
   * §9 depth extension: preseed `RTSMap.coverCells` (row-major, same shape as the occupancy grid)
   * instead of the default all-zero grid — mainly useful for tests/tools. Studio marks cover at
   * map-authoring time in the real product; this package never computes it procedurally.
   */
  coverCells?: Uint8Array;
}

/**
 * Builds a fresh, empty `RTSMatchState`: no units/buildings/resources yet (those are placed by
 * the integration layer — see README's "Integration points other packages need" section), an
 * all-zero occupancy grid, and per-faction economy seeded from `FactionSetup.startingCredits`
 * (defaulting to `STARTING_CREDITS`). `rngState` is seeded directly from `seed`, so two calls with
 * the same `seed` produce byte-identical starting states.
 */
export function createMatch(options: CreateMatchOptions): RTSMatchState {
  const gridWidth = Math.max(1, Math.ceil(options.mapWidthM / options.cellSizeM));
  const gridDepth = Math.max(1, Math.ceil(options.mapDepthM / options.cellSizeM));

  const economy: Record<string, { credits: number }> = {};
  for (const faction of options.factions) {
    economy[faction.factionId] = { credits: faction.startingCredits ?? STARTING_CREDITS };
  }

  const map: RTSMap = {
    widthM: options.mapWidthM,
    depthM: options.mapDepthM,
    cellSizeM: options.cellSizeM,
    gridWidth,
    gridDepth,
    occupancy: new Uint8Array(gridWidth * gridDepth),
    coverCells: options.coverCells ?? new Uint8Array(gridWidth * gridDepth),
    biome: options.biome ?? 'URBAN',
  };

  return {
    seed: options.seed,
    rngState: options.seed >>> 0,
    sessionTime: 0,
    tick: 0,
    status: 'PLAYING',
    entities: { units: [], buildings: [], resources: [], projectiles: [] },
    economy,
    map,
    factions: options.factions.map((f) => ({ ...f })),
    productionQueue: [],
    winnerFactionId: null,
    possessedUnitIds: [],
  };
}

// ---------------------------------------------------------------------------------------------
// tickMatch
// ---------------------------------------------------------------------------------------------

/**
 * Advances the match by exactly one fixed tick. Deterministic: given the same input `state`
 * (specifically its `rngState`), `dtSeconds`, and `commands` (same array, same order), this
 * always produces bit-identical output on every machine — see the determinism test in
 * `src/determinism.test.ts` and docs/RTS-CONTRACTS.md §1.
 *
 * Does not mutate `state` — a deep-cloned draft is mutated internally and returned as the new
 * state, so callers can safely keep a reference to the pre-tick state (e.g. for replay/rollback).
 *
 * Order of operations, matching docs/RTS-CONTRACTS.md §3's system list:
 *   1. Apply every command in `commands` (human input) via `applyCommand`.
 *   2. For each AI-controlled faction whose think-cadence is due this tick, run `runCommanderAI`
 *      (fed this tick's shared `rng`) and apply its proposed commands the same way — see
 *      `src/ai/commanderAI.ts` for why this must happen inside `tickMatch` for lockstep to work.
 *   3. `commandSystem` — per-unit pathfinding/harvest-proximity/attack-chase progression.
 *   4. `movementSystem` — steering + A* waypoint following.
 *   5. `combatSystem` — proximity targeting + projectile spawning.
 *   6. `projectileSystem` — projectile travel + impact damage.
 *   7. `harvestingSystem` — Sotolium extraction + credit conversion.
 *   8. `fogOfWarSystem` — death transition + visibility, for human-controlled factions only.
 *   9. `productionSystem` — advance build queues, spawn completed units.
 *  10. `victorySystem` — check for a last-faction-standing win.
 *
 * If `state.status` is not `'PLAYING'` (e.g. `'LOBBY'`, `'PAUSED'`, `'GAME_OVER'`), this is a
 * no-op that returns an equivalent clone — no systems run, no tick/time advances.
 */
export function tickMatch(state: RTSMatchState, dtSeconds: number, commands: RTSCommand[]): RTSMatchState {
  const draft = structuredClone(state);

  if (draft.status !== 'PLAYING') {
    return draft;
  }

  const rng = rngFromState(draft.rngState);

  for (const command of commands) {
    applyCommand(draft, command);
  }

  if (draft.tick > 0 && draft.tick % AI_THINK_INTERVAL_TICKS === 0) {
    for (const faction of draft.factions) {
      if (!faction.isAIControlled) continue;
      // §9: `faction.difficulty` (undefined by default) applies a preset from
      // RTS_DIFFICULTY_PRESETS — omitting it reproduces the exact pre-§9 behavior.
      const aiCommands = runCommanderAI(draft, faction.factionId, rng, { difficulty: faction.difficulty });
      for (const command of aiCommands) applyCommand(draft, command);

      // §9, Pro only: allied-nation coordinated strikes, applied through the same applyCommand
      // path as any other faction's commands — see src/ai/alliedCoordinator.ts.
      if (faction.difficulty === 'PRO' && faction.alliedFactionIds && faction.alliedFactionIds.length > 0) {
        const strikeCommands = evaluateAlliedStrike(draft, faction.factionId, faction.alliedFactionIds, rng);
        for (const command of strikeCommands) applyCommand(draft, command);
      }
    }
  }

  commandSystem(draft);

  const grid = buildSpatialGridForUnits(draft.entities.units);
  movementSystem(draft, dtSeconds, grid);
  combatSystem(draft, dtSeconds, grid, rng);
  projectileSystem(draft, dtSeconds);
  harvestingSystem(draft, dtSeconds);

  const humanFactionIds = draft.factions.filter((f) => !f.isAIControlled).map((f) => f.factionId);
  fogOfWarSystem(draft, humanFactionIds);

  productionSystem(draft, rng);
  victorySystem(draft);

  draft.sessionTime += dtSeconds;
  draft.tick += 1;
  draft.rngState = rng.getState();

  return draft;
}

// ---------------------------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------------------------

interface SerializedMap extends Omit<RTSMap, 'occupancy' | 'coverCells'> {
  occupancy: number[];
  // §9: Uint8Array has no own enumerable indices that survive JSON.stringify as an array (it would
  // serialize as `{"0":1,"1":0,...}` instead), same reason `occupancy` gets the Array.from
  // treatment above — see the original code's pattern, now applied to this additive field too.
  coverCells?: number[];
}
type SerializedMatchState = Omit<RTSMatchState, 'map'> & { map: SerializedMap };

/** For late-join/reconnect state transfer — see docs/RTS-CONTRACTS.md §4/§5. */
export function serializeMatch(state: RTSMatchState): string {
  const { coverCells, ...mapRest } = state.map;
  const serialized: SerializedMatchState = {
    ...state,
    map: { ...mapRest, occupancy: Array.from(state.map.occupancy), coverCells: coverCells ? Array.from(coverCells) : undefined },
  };
  return JSON.stringify(serialized);
}

export function deserializeMatch(json: string): RTSMatchState {
  const parsed = JSON.parse(json) as SerializedMatchState;
  return {
    ...parsed,
    map: {
      ...parsed.map,
      occupancy: Uint8Array.from(parsed.map.occupancy),
      coverCells: parsed.map.coverCells ? Uint8Array.from(parsed.map.coverCells) : undefined,
    },
  };
}

/**
 * Cheap FNV-1a checksum of the serialized state, for desync detection between lockstep peers
 * (docs/RTS-CONTRACTS.md §5) — not cryptographic, just fast and sensitive to any field change.
 */
export function stateHash(state: RTSMatchState): string {
  const json = serializeMatch(state);
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------------------------
// Pinned constants (docs/RTS-CONTRACTS.md §4)
// ---------------------------------------------------------------------------------------------

export { RTS_UNIT_STATS, RTS_FACTIONS } from './constants';

// ---------------------------------------------------------------------------------------------
// Pinned type exports (docs/RTS-CONTRACTS.md §4)
// ---------------------------------------------------------------------------------------------

export type {
  RTSUnit,
  RTSBuilding,
  RTSResourceNode,
  RTSProjectile,
  RTSCommand,
  RTSMatchState,
  FactionSetup,
  FactionDefinition,
  UnitClass,
  UnitStats,
} from './types';

// ---------------------------------------------------------------------------------------------
// Additional exports beyond the §4 list — see README.md's "Additional exports" section for why
// each of these is public. All are additive; none of the pinned names above are affected.
// ---------------------------------------------------------------------------------------------

// §3 explicitly calls for enqueueProduction and runCommanderAI to be part of the public,
// command-adjacent API (not just internal system details).
export { enqueueProduction, runCommanderAI };

// Types consumers reasonably need to build valid entities/commands/config against the pinned API.
export type {
  Vec3,
  RTSMap,
  UnitCommand,
  UnitLifecycleState,
  BuildingClass,
  BuildingStats,
  MatchStatus,
  CommandType,
  ProductionQueueItem,
} from './types';

// The RNG this package's determinism depends on — useful for tests/tools that want to reproduce
// or fast-forward a match's random stream outside of tickMatch.
export { createRng, rngFromState, generateEntityId } from './rng';
export type { Rng } from './rng';

// Building stats + tick-rate constants the integration layer needs to build a compatible
// accumulator loop and to render production progress bars.
export { RTS_BUILDING_STATS, TICKS_PER_SECOND, VICTORY_GRACE_SECONDS } from './constants';
export { AI_THINK_INTERVAL_TICKS };

// ---------------------------------------------------------------------------------------------
// §9 depth extension — additive exports layered on top of everything above. See README.md's
// "§9 additive extensions" section for the full rundown of what each of these is for.
// ---------------------------------------------------------------------------------------------

// Expanded unit roster + munition/heat tiers.
export { MUNITION_HEAT_PER_SHOT, RTS_UNIT_TYPE_STATS } from './constants';
export type { AirUnitType, InfantryUnitType, Munition, NavalUnitType, UnitType, UnitTypeStats, VehicleUnitType } from './types';

// Heat-based stealth detection + radar, plus cover-cell helpers.
export { HEAT_DETECTION_THRESHOLD, RTS_RADAR_DETECTION_RADIUS_M } from './constants';
export { computeDetection, isCoverCell, isPositionInCover, isThermallyExposed } from './systems/stealth';

// Economy + roster caps.
export { RTS_UNIT_CAP_AIR, RTS_UNIT_CAP_GROUND } from './constants';
export { tryEnqueueProduction } from './systems/productionSystem';
export type { ProductionRejectionReason, ProductionResult } from './systems/productionSystem';

// Difficulty presets.
export { RTS_DIFFICULTY_PRESETS } from './constants';
export type { DifficultyLevel, DifficultyPreset } from './types';
export type { RunCommanderAIOptions } from './ai/commanderAI';

// Allied-nation coordinated strikes (Pro only).
export { ALLIED_STRIKE_FORCE_SIZE, ALLIED_STRIKE_MAP_CONTROL_THRESHOLD, ALLIED_STRIKE_MAX_ALLIES } from './constants';
export { computeMapControlScore, evaluateAlliedStrike } from './ai/alliedCoordinator';

// Biome variants + team-color-by-biome.
export type { Biome } from './types';
export { getTeamColor, isNavalUnit, isNavalUnitType, RTS_DEFAULT_TEAM_COLOR, RTS_TEAM_COLORS_BY_BIOME } from './biome';
