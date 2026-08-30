// Core simulation types for @sonic-gameworld/rts-sim.
//
// This is a behavioral 3D port of `docs/reference/global-dominance/src/types.ts` (see
// docs/RTS-CONTRACTS.md §2). Every 2D `{x,y}` position/velocity becomes a `Vec3` on the XZ plane;
// the closed `Faction` enum becomes an open `factionId: string` so more than two factions can be
// added later without a type-system change; commands become multi-unit (`unitIds: string[]`)
// because a real RTS issues one order to a whole selection at once.

/** A 3D point/vector. Units move on the XZ plane — `y` is height and is not touched by pathing. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type UnitClass = 'INFANTRY' | 'ARMORED' | 'AIR';

/** Lifecycle state machine for a unit. */
export type UnitLifecycleState = 'IDLE' | 'MOVING' | 'ATTACKING' | 'HARVESTING' | 'DEAD';

export type BuildingClass = 'REFINERY' | 'BARRACKS' | 'FACTORY' | 'AIRFIELD' | 'RADAR';

export type MatchStatus = 'LOBBY' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type CommandType = 'MOVE' | 'ATTACK' | 'HARVEST' | 'BUILD' | 'STOP';

export interface UnitStats {
  cost: number;
  health: number;
  speed: number;
  attackRange: number;
  damage: number;
  detectionRadius: number;
  heatPerShot: number;
}

export interface BuildingStats {
  cost: number;
  health: number;
  sizeCells: { w: number; d: number };
  /**
   * §9 depth extension. Large-radius detection for `RADAR`-class buildings — set only on that
   * entry. Undefined for every other building class (no change to their behavior).
   */
  detectionRadiusM?: number;
}

// --- §9 depth extension: expanded unit roster (cosmetic/cost sub-classification) ---------------
// `UnitClass` (INFANTRY|ARMORED|AIR) stays the combat-resolution axis and is unchanged above.
// `UnitType` is an additive, purely cosmetic/economic sub-classification layered on top of it —
// see `RTS_UNIT_TYPE_STATS` in constants.ts and README.md's "§9 additive extensions" section.
export type InfantryUnitType = 'RIFLEMAN' | 'SPEC_OPS' | 'SNIPER' | 'HEAVY_GUNNER' | 'COMBAT_MEDIC' | 'OFFICER';
export type VehicleUnitType = 'MAIN_BATTLE_TANK' | 'APC' | 'SELF_PROPELLED_ARTILLERY';
export type AirUnitType = 'VTOL_GUNSHIP' | 'BOMBER_DRONE' | 'RECON_DRONE';
/** Sea-biome-only archetypes — see `UnitTypeStats.navalOnly` and README's naval steering note. */
export type NavalUnitType = 'DESTROYER' | 'FRIGATE' | 'TRANSPORT_SHIP' | 'RAILGUN_CRUISER';
export type UnitType = InfantryUnitType | VehicleUnitType | AirUnitType | NavalUnitType;

/** Munition family a `UnitType` fires — drives its heat-per-shot tier (see `MUNITION_HEAT_PER_SHOT`). */
export type Munition = 'BALLISTIC' | 'RAILGUN' | 'PLASMA';

export interface UnitTypeStats {
  /** Which of the 3 pinned combat classes this archetype belongs to — drives range/targeting. */
  unitClass: UnitClass;
  cost: number;
  health: number;
  damage: number;
  speed: number;
  munition: Munition;
  heatPerShot: number;
  /** Passive heat decay per second, mirroring `COOLING_RATE` but tuned per archetype. */
  coolingRate: number;
  /** True for naval archetypes: only placeable/producible on `biome: 'SEA'` maps. */
  navalOnly?: boolean;
}

// --- §9 depth extension: difficulty presets -----------------------------------------------------
export type DifficultyLevel = 'BEGINNER' | 'INTERMEDIATE' | 'PRO';

export interface DifficultyPreset {
  /** Scales how eagerly `runCommanderAI` spends credits (divides its production threshold). */
  economyMultiplier: number;
  /** Probability [0,1] that an idle unit is committed to an opportunistic attack this think-cycle. */
  aggressionChance: number;
  /** Pro-only: whether this faction's allied-nation coordinated strikes can trigger. */
  alliedStrikesEnabled: boolean;
}

// --- §9 depth extension: biome variants -----------------------------------------------------------
export type Biome = 'URBAN' | 'JUNGLE' | 'SEA';

/**
 * A command issued by a human player or `runCommanderAI`, addressed to one or more units at
 * once. `BUILD` is the one exception: it is not a per-unit order — `targetId` names the
 * producing building and `unitIds` is ignored — see `commandSystem.applyCommand`.
 */
export interface RTSCommand {
  type: CommandType;
  unitIds: string[];
  targetPos?: Vec3;
  targetId?: string;
  buildType?: UnitClass;
  /**
   * §9 depth extension: optional specific archetype for a `BUILD` command (e.g. `'SNIPER'`) — see
   * `RTS_UNIT_TYPE_STATS`. Ignored for every other `CommandType`, and optional even for `BUILD`
   * (an order with no `unitType` still produces the plain `buildType`-class unit exactly as before).
   */
  unitType?: string;
}

/** The per-unit command queue entry `applyCommand` fans a multi-unit `RTSCommand` out into. */
export interface UnitCommand {
  type: CommandType;
  targetPos?: Vec3;
  targetId?: string;
}

export interface RTSUnit {
  readonly id: string;
  factionId: string;
  unitClass: UnitClass;
  /**
   * §9 depth extension: optional cosmetic/economic archetype (e.g. `'SNIPER'`, `'MAIN_BATTLE_TANK'`)
   * — see `RTS_UNIT_TYPE_STATS`. Additive: undefined for any unit spawned before this existed or
   * spawned without specifying one, in which case combat/heat/cooling fall back to the plain
   * per-`unitClass` tables exactly as before.
   */
  unitType?: string;
  transform: { position: Vec3; rotationY: number };
  /** y is always zeroed — no vertical physics for v1. */
  velocity: Vec3;
  /** A* waypoints in world space (XZ plane; y is always 0 and unused by movement). */
  path: Vec3[];
  health: number;
  maxHealth: number;
  speed: number;
  attackRange: number;
  damage: number;
  detectionRadius: number;
  state: UnitLifecycleState;
  commands: UnitCommand[];
  targetNodeId: string | null;
  /** Tick (not wall-clock ms) this unit last fired a projectile — see `FIRE_COOLDOWN_TICKS`. */
  lastFiredAtTick: number;
  harvestedSotolium: number;
  isDetected: boolean;
  heat: number;
  isSelected: boolean;
}

export interface RTSBuilding {
  readonly id: string;
  factionId: string;
  buildingClass: BuildingClass;
  /** Occupancy-grid cell coordinates (not world meters). */
  cellX: number;
  cellZ: number;
  sizeCells: { w: number; d: number };
  health: number;
  maxHealth: number;
  isOperational: boolean;
}

export interface RTSResourceNode {
  readonly id: string;
  position: Vec3;
  amount: number;
  isBeingHarvested: boolean;
}

export interface RTSProjectile {
  readonly id: string;
  position: Vec3;
  targetPosition: Vec3;
  speed: number;
  damage: number;
  ownerId: string;
  factionId: string;
}

export interface ProductionQueueItem {
  readonly id: string;
  factionId: string;
  unitClass: UnitClass;
  /** The producing building, when known — see `enqueueProduction`. */
  buildingId?: string;
  startedAtTick: number;
  durationTicks: number;
  /** §9 depth extension: the specific archetype this order will spawn, when one was requested. */
  unitType?: string;
}

export interface FactionDefinition {
  id: string;
  name: string;
  description?: string;
}

/** Per-match configuration for one faction slot, passed into `createMatch`. */
export interface FactionSetup {
  /** References a `FactionDefinition.id` (e.g. one of `RTS_FACTIONS`), but any string is valid. */
  factionId: string;
  isAIControlled: boolean;
  startingCredits?: number;
  /**
   * §9 depth extension: applied to this faction's `runCommanderAI` calls inside `tickMatch` when
   * `isAIControlled`. Undefined (the default) reproduces the exact pre-§9 AI behavior — see
   * `RTS_DIFFICULTY_PRESETS`.
   */
  difficulty?: DifficultyLevel;
  /**
   * §9 depth extension, PRO only: up to 3 other `FactionSetup.factionId`s allied with this one.
   * When this faction's `difficulty` is `'PRO'`, `tickMatch` evaluates `evaluateAlliedStrike` for
   * these allies each AI-think interval — see `src/ai/alliedCoordinator.ts`. Ignored otherwise.
   */
  alliedFactionIds?: string[];
}

export interface RTSMap {
  widthM: number;
  depthM: number;
  cellSizeM: number;
  gridWidth: number;
  gridDepth: number;
  /** Row-major (`z * gridWidth + x`) obstacle grid: 1 = blocked, 0 = free. */
  occupancy: Uint8Array;
  /**
   * §9 depth extension: row-major (`z * gridWidth + x`), same shape as `occupancy` — 1 = cover
   * (halves proximity-detection range for a unit standing on it, see `computeDetection`), 0 = no
   * cover. Flagged at map-authoring time (Studio), never computed procedurally by this package.
   * `createMatch` always allocates an all-zero grid; `deserializeMatch` tolerates its absence on
   * data serialized before this field existed.
   */
  coverCells?: Uint8Array;
  /**
   * §9 depth extension: chosen per map at authoring time. Defaults to `'URBAN'` in `createMatch`
   * when omitted. Drives Dragon team color (`RTS_TEAM_COLORS_BY_BIOME`) and whether naval
   * `UnitType`s may be produced/placed and how they path (see README's naval steering note).
   */
  biome?: Biome;
}

export interface RTSMatchState {
  seed: number;
  /** Serializable mulberry32 PRNG state — see `src/rng.ts`. */
  rngState: number;
  sessionTime: number;
  tick: number;
  status: MatchStatus;
  entities: {
    units: RTSUnit[];
    buildings: RTSBuilding[];
    resources: RTSResourceNode[];
    projectiles: RTSProjectile[];
  };
  economy: Record<string, { credits: number }>;
  map: RTSMap;
  factions: FactionSetup[];
  productionQueue: ProductionQueueItem[];
  winnerFactionId: string | null;
  /**
   * Unit ids currently possessed (first/third-person control) by any player. Generalizes the
   * reference's single global `controlledUnitId` to a set, since multiple human players on
   * different factions may each possess a unit at once. `movementSystem`/`combatSystem` skip
   * any unit whose id appears here — see docs/RTS-CONTRACTS.md §3.
   */
  possessedUnitIds: string[];
}
