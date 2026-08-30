// Tunable numbers ported from docs/reference/global-dominance/src/constants.ts and the magic
// numbers scattered through its engine/*.ts files. docs/RTS-CONTRACTS.md §2 says to keep the
// reference's numbers unless there's a specific reason to change them, and to note any change
// here. Every value below is unchanged from the reference *except* where a comment says otherwise
// (all such deviations are also called out in README.md's "Deviations from the reference" section).
import type {
  BuildingClass,
  BuildingStats,
  DifficultyLevel,
  DifficultyPreset,
  FactionDefinition,
  Munition,
  UnitClass,
  UnitStats,
  UnitType,
  UnitTypeStats,
} from './types';

// §9 depth extension: the supplemental design brief sets STARTING_CREDITS = 50000 — a large jump
// from the reference-ported 2500. This reflects the brief's much larger unit rosters/caps (250
// combined INFANTRY+ARMORED, 50 AIR — see RTS_UNIT_CAP_GROUND/RTS_UNIT_CAP_AIR below) needing a
// starting economy that can actually field them, rather than a balance change to the original
// 3-unit-class game. See README.md's "§9 additive extensions" section.
export const STARTING_CREDITS = 50000;
export const COOLING_RATE = 0.4;
export const SOTOLIUM_CONVERSION_RATE = 2.0;
export const HARVEST_RATE_PER_SECOND = 12.5;
export const HARVEST_BATCH_THRESHOLD = 40;
/** Distance (world units) within which a unit can harvest a resource node without moving closer. */
export const HARVEST_RANGE = 60;

// --- Tick timing ------------------------------------------------------------------------------
// The reference measured cooldowns/build times/AI cadence in wall-clock milliseconds. This
// package may never read the wall clock (docs/RTS-CONTRACTS.md §1), so every timing constant is
// expressed in ticks instead, calibrated against the 10Hz fixed-tick rate documented in §4
// (`tickMatch` is "fixed-tick, e.g. call at 10Hz (100ms) from the integration layer's
// accumulator"). If an integration layer ticks at a different rate, scale these constants
// accordingly — the numbers themselves are unchanged from the reference's ms values.
export const TICKS_PER_SECOND = 10;
/** Reference: 1000ms between shots. */
export const FIRE_COOLDOWN_TICKS = TICKS_PER_SECOND;
/** Reference: 3500ms unit build time. */
export const PRODUCTION_DURATION_TICKS = Math.round(3.5 * TICKS_PER_SECOND);
/** Reference: CommanderAI thinks every 3000ms. */
export const AI_THINK_INTERVAL_TICKS = 3 * TICKS_PER_SECOND;
export const AI_PRODUCTION_CREDIT_THRESHOLD = 1300;
/** Reference: victory can't be declared until sessionTime > 15 (seconds). */
export const VICTORY_GRACE_SECONDS = 15;

// --- Steering / movement (Steering.ts, GameEngine.movementSystem) -----------------------------
export const STEERING_SPEED_SCALE = 80;
export const STEERING_SEPARATION_SCALE = 60;
export const STEERING_SEPARATION_RADIUS_INFANTRY = 24;
export const STEERING_SEPARATION_RADIUS_OTHER = 45;
export const STEERING_NEIGHBOR_QUERY_RADIUS = 60;

export const MOVEMENT_FRICTION = 0.88;
export const MOVEMENT_WAYPOINT_ARRIVAL_DIST = 18;
export const MOVEMENT_ARRIVAL_RADIUS = 40;
export const MOVEMENT_BOUNDARY_MARGIN = 12;

// --- 3D-only additions (no reference equivalent — the reference was flat 2D) -------------------
/**
 * Fixed flight height (meters) for AIR-class units. docs/RTS-CONTRACTS.md §2: "Air class unit
 * special-cases a fixed flight height instead [of terrain sampling]". Ground units (INFANTRY,
 * ARMORED) sit at y=0; real terrain-following height for both is applied by the 3D integration
 * layer (spatial-engine's `sampleTerrainHeight`), which is intentionally outside this package's
 * pinned API — see README.md's "y / terrain height" note.
 */
export const AIR_FLIGHT_HEIGHT_M = 30;
/**
 * Height tolerance (meters) used by combatSystem's otherwise-XZ-only range checks, so an AIR
 * unit flying at AIR_FLIGHT_HEIGHT_M is still "in range" of ground units and vice versa —
 * docs/RTS-CONTRACTS.md §3 explicitly calls out that ignoring height (or using a small tolerance)
 * is required here. We ignore height entirely (tolerance = Infinity, i.e. pure XZ distance) to
 * match the reference's combat feel exactly; see README for the full rationale.
 */
export const COMBAT_HEIGHT_TOLERANCE_M = Infinity;

// --- Combat / projectiles (GameEngine.combatSystem/projectileSystem) ---------------------------
export const PROJECTILE_SPEED = 750;
export const PROJECTILE_HIT_DISTANCE = 12;
export const PROJECTILE_UNIT_DAMAGE_RADIUS = 22;
export const PROJECTILE_UNIT_HEAT_ON_HIT = 0.08;

// --- Spatial partitioning / pathfinding (SpatialGrid.ts, pathfinding.ts) -----------------------
export const SPATIAL_GRID_CELL_SIZE = 100;
export const PATHFINDING_MAX_NODES_SEARCHED = 1500;

export const RTS_UNIT_STATS: Record<UnitClass, UnitStats> = {
  INFANTRY: { cost: 150, health: 100, speed: 2.2, attackRange: 160, damage: 12, detectionRadius: 200, heatPerShot: 0.12 },
  ARMORED: { cost: 450, health: 400, speed: 1.4, attackRange: 240, damage: 40, detectionRadius: 250, heatPerShot: 0.3 },
  AIR: { cost: 750, health: 220, speed: 3.0, attackRange: 300, damage: 30, detectionRadius: 320, heatPerShot: 0.2 },
};

// §9 depth extension: RADAR's large detection radius (world meters), reused directly on its
// RTS_BUILDING_STATS entry below and by fogOfWarSystem/computeDetection for stealth/radar logic.
export const RTS_RADAR_DETECTION_RADIUS_M = 600;

export const RTS_BUILDING_STATS: Record<BuildingClass, BuildingStats> = {
  RADAR: { cost: 1000, health: 1500, sizeCells: { w: 2, d: 2 }, detectionRadiusM: RTS_RADAR_DETECTION_RADIUS_M },
  BARRACKS: { cost: 400, health: 1000, sizeCells: { w: 2, d: 2 } },
  FACTORY: { cost: 800, health: 1500, sizeCells: { w: 3, d: 3 } },
  AIRFIELD: { cost: 1100, health: 1200, sizeCells: { w: 3, d: 3 } },
  REFINERY: { cost: 600, health: 1200, sizeCells: { w: 2, d: 2 } },
};

export const RTS_FACTIONS: readonly FactionDefinition[] = [
  {
    id: 'raven-alliance',
    name: 'Raven Alliance',
    description: 'A disciplined coalition fielding balanced, technology-driven forces.',
  },
  {
    id: 'united-dragon-nations',
    name: 'United Dragon Nations',
    description: 'An industrial superpower favoring heavy armor and overwhelming production.',
  },
];

// =================================================================================================
// §9 depth extension — supplemental design material layered additively onto the §1-4 baseline
// above. See docs/RTS-CONTRACTS.md §9 and README.md's "§9 additive extensions" section.
// =================================================================================================

// --- Expanded unit roster + munition/heat tiers -------------------------------------------------

/**
 * Heat generated per shot for each munition family, low/medium/high per docs/RTS-CONTRACTS.md §9.
 * Individual `RTS_UNIT_TYPE_STATS` entries are tuned near (not necessarily exactly equal to) their
 * munition's tier baseline here — this is the documented reference point for "low/medium/high".
 */
export const MUNITION_HEAT_PER_SHOT: Record<Munition, number> = {
  BALLISTIC: 0.12, // low
  RAILGUN: 0.28, // medium
  PLASMA: 0.45, // high
};

/**
 * ~6 infantry + 10 vehicle/ship/air archetypes (docs/RTS-CONTRACTS.md §9), each keyed by `UnitType`
 * and layered on top of (not replacing) `RTS_UNIT_STATS`'s per-`UnitClass` table above:
 * `unitClass` still drives range/targeting/combat resolution; this table's cost/health/damage/
 * speed/munition are what actually get applied when a unit is produced with a specific `unitType`
 * (see `productionSystem.tryEnqueueProduction`'s optional `unitType` argument) — a unit produced
 * without one still uses the plain `RTS_UNIT_STATS[unitClass]` numbers exactly as before.
 * Naval archetypes (`navalOnly: true`) may only be produced/placed on `biome: 'SEA'` maps.
 */
export const RTS_UNIT_TYPE_STATS: Record<UnitType, UnitTypeStats> = {
  // --- Infantry (6) ---
  RIFLEMAN: { unitClass: 'INFANTRY', cost: 120, health: 90, damage: 10, speed: 2.2, munition: 'BALLISTIC', heatPerShot: 0.08, coolingRate: 0.5 },
  SPEC_OPS: { unitClass: 'INFANTRY', cost: 220, health: 80, damage: 16, speed: 2.6, munition: 'BALLISTIC', heatPerShot: 0.1, coolingRate: 0.6 },
  SNIPER: { unitClass: 'INFANTRY', cost: 260, health: 70, damage: 35, speed: 1.8, munition: 'RAILGUN', heatPerShot: 0.22, coolingRate: 0.35 },
  HEAVY_GUNNER: { unitClass: 'INFANTRY', cost: 300, health: 140, damage: 22, speed: 1.6, munition: 'BALLISTIC', heatPerShot: 0.18, coolingRate: 0.3 },
  COMBAT_MEDIC: { unitClass: 'INFANTRY', cost: 180, health: 90, damage: 6, speed: 2.0, munition: 'BALLISTIC', heatPerShot: 0.05, coolingRate: 0.6 },
  OFFICER: { unitClass: 'INFANTRY', cost: 240, health: 100, damage: 12, speed: 2.1, munition: 'BALLISTIC', heatPerShot: 0.08, coolingRate: 0.5 },

  // --- Vehicles (3, ARMORED) ---
  MAIN_BATTLE_TANK: { unitClass: 'ARMORED', cost: 500, health: 450, damage: 45, speed: 1.3, munition: 'BALLISTIC', heatPerShot: 0.3, coolingRate: 0.35 },
  APC: { unitClass: 'ARMORED', cost: 380, health: 350, damage: 20, speed: 1.8, munition: 'BALLISTIC', heatPerShot: 0.15, coolingRate: 0.45 },
  SELF_PROPELLED_ARTILLERY: { unitClass: 'ARMORED', cost: 600, health: 300, damage: 70, speed: 1.0, munition: 'RAILGUN', heatPerShot: 0.4, coolingRate: 0.25 },

  // --- Air (3, AIR) ---
  VTOL_GUNSHIP: { unitClass: 'AIR', cost: 800, health: 200, damage: 35, speed: 3.2, munition: 'PLASMA', heatPerShot: 0.35, coolingRate: 0.3 },
  BOMBER_DRONE: { unitClass: 'AIR', cost: 900, health: 160, damage: 60, speed: 2.6, munition: 'PLASMA', heatPerShot: 0.5, coolingRate: 0.2 },
  RECON_DRONE: { unitClass: 'AIR', cost: 350, health: 90, damage: 8, speed: 4.0, munition: 'BALLISTIC', heatPerShot: 0.05, coolingRate: 0.7 },

  // --- Naval (4, ARMORED — no dedicated NAVAL UnitClass; see README's "why ARMORED" note) ---
  DESTROYER: { unitClass: 'ARMORED', cost: 700, health: 500, damage: 50, speed: 1.5, munition: 'RAILGUN', heatPerShot: 0.3, coolingRate: 0.3, navalOnly: true },
  FRIGATE: { unitClass: 'ARMORED', cost: 500, health: 350, damage: 30, speed: 2.0, munition: 'BALLISTIC', heatPerShot: 0.2, coolingRate: 0.4, navalOnly: true },
  TRANSPORT_SHIP: { unitClass: 'ARMORED', cost: 300, health: 400, damage: 5, speed: 1.6, munition: 'BALLISTIC', heatPerShot: 0.05, coolingRate: 0.6, navalOnly: true },
  RAILGUN_CRUISER: { unitClass: 'ARMORED', cost: 900, health: 550, damage: 80, speed: 1.2, munition: 'RAILGUN', heatPerShot: 0.45, coolingRate: 0.25, navalOnly: true },
};

// --- Heat-based stealth detection -----------------------------------------------------------------

/**
 * `RTSUnit.heat` scale: combatSystem clamps it to at most 1.2 (own-fire) and projectileSystem's
 * on-hit bump clamps separately to 1.0 — see those systems. A unit at/above this threshold is
 * "thermally exposed": auto-revealed regardless of fog-of-war/cover (docs/RTS-CONTRACTS.md §9).
 */
export const HEAT_DETECTION_THRESHOLD = 0.75;

// --- Economy + roster caps -----------------------------------------------------------------------

/** Hard per-faction cap on combined INFANTRY+ARMORED units (docs/RTS-CONTRACTS.md §9). */
export const RTS_UNIT_CAP_GROUND = 250;
/** Hard per-faction cap on AIR units (docs/RTS-CONTRACTS.md §9). */
export const RTS_UNIT_CAP_AIR = 50;

// --- Difficulty presets ----------------------------------------------------------------------------

/**
 * Applied to an AI-controlled `FactionSetup` via its optional `difficulty` field — `tickMatch`
 * passes the matching preset into `runCommanderAI` automatically. Omitting `difficulty` entirely
 * (the default) reproduces the exact pre-§9 AI behavior byte-for-byte, so this table only changes
 * outcomes for matches that opt in. `economyMultiplier` divides `AI_PRODUCTION_CREDIT_THRESHOLD`
 * (higher multiplier ⇒ lower effective threshold ⇒ the AI queues production sooner/more often for
 * the same credit balance); `aggressionChance` is the per-idle-unit probability `runCommanderAI`
 * commits it to an opportunistic attack this think-cycle instead of holding back.
 */
export const RTS_DIFFICULTY_PRESETS: Record<DifficultyLevel, DifficultyPreset> = {
  BEGINNER: { economyMultiplier: 1, aggressionChance: 0.5, alliedStrikesEnabled: false },
  INTERMEDIATE: { economyMultiplier: 1.5, aggressionChance: 0.8, alliedStrikesEnabled: false },
  PRO: { economyMultiplier: 2, aggressionChance: 1, alliedStrikesEnabled: true },
};

// --- Allied-nation coordinated strikes (PRO only) -------------------------------------------------

/** Fraction of the map's total buildings the primary faction must control to trigger a strike. */
export const ALLIED_STRIKE_MAP_CONTROL_THRESHOLD = 0.6;
/** Units each allied faction contributes to one coordinated strike batch. */
export const ALLIED_STRIKE_FORCE_SIZE = 5;
/** docs/RTS-CONTRACTS.md §9: "up to 3 additional AI-controlled factions". */
export const ALLIED_STRIKE_MAX_ALLIES = 3;
