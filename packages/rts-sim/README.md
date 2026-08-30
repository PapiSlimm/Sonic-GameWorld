# @sonic-gameworld/rts-sim

Pure, deterministic, lockstep-multiplayer-ready real-time-strategy simulation for the "Global
Dominance" RTS game template (docs/RTS-CONTRACTS.md). Zero rendering and zero networking
dependencies — no `three`, no `pixi`, no `fastify`, no `ws`. `apps/player` (rendering + input),
`apps/studio` (authoring), and `services/api` (multiplayer relay) all import this package
identically; none of that integration wiring exists yet, and none of it is this package's
concern — this package is the simulation, full stop.

It is a **behavioral 3D port**, not a copy-paste, of the reference "Global Dominance RTS v2.0"
prototype preserved at `docs/reference/global-dominance/src/` — same two factions (Raven Alliance
vs. United Dragon Nations), same Sotolium resource economy, same three unit classes
(Infantry/Armored/Air), same building roster, same tuning numbers wherever there wasn't a specific
reason to change them (see "Deviations from the reference" below for the handful of places there
was).

## Why determinism is the whole point

Multiplayer here is **lockstep**: every peer runs its own local copy of this package, all seeded
identically, and receives the same ordered stream of commands. Nobody ever sends game state over
the wire — only commands. That only works if `tickMatch()` is a pure function of
`(state, dtSeconds, commands)`: given the same inputs, on any machine, it produces bit-identical
output. Concretely, that means this package:

- Never calls `Math.random()` — every random choice (AI target selection, unit/projectile id
  generation) draws from a seeded `Rng` (mulberry32, `src/rng.ts`) threaded through
  `RTSMatchState.rngState`.
- Never reads the wall clock — time enters the simulation only through `tickMatch`'s `dtSeconds`
  parameter.
- Never relies on `Set`/`Map` iteration order for an outcome — object/array iteration is either
  order-insensitive by construction (see the comments in `harvestingSystem.ts` and
  `fogOfWarSystem.ts`) or done over arrays with well-defined order.

`src/determinism.test.ts` is, per docs/RTS-CONTRACTS.md §1, "the single most important test in the
whole feature": it runs the same seed and command stream twice — through AI decisions, production,
pathfinding, steering, combat, and harvesting — and asserts `serializeMatch()` output is
byte-identical between the two runs.

## Public API

```ts
function createMatch(options: {
  seed: number;
  mapWidthM: number;
  mapDepthM: number;
  cellSizeM: number;
  factions: FactionSetup[];
}): RTSMatchState;

function tickMatch(state: RTSMatchState, dtSeconds: number, commands: RTSCommand[]): RTSMatchState;
function serializeMatch(state: RTSMatchState): string;
function deserializeMatch(json: string): RTSMatchState;
function stateHash(state: RTSMatchState): string;

const RTS_UNIT_STATS: Record<UnitClass, UnitStats>;
const RTS_FACTIONS: readonly FactionDefinition[]; // Raven Alliance, United Dragon Nations

type RTSUnit; type RTSBuilding; type RTSResourceNode; type RTSProjectile; type RTSCommand;
type RTSMatchState; type FactionSetup; type FactionDefinition; type UnitClass; type UnitStats;
```

This is the exact surface pinned by docs/RTS-CONTRACTS.md §4. `src/index.ts` re-exports it
verbatim from the pinned block, plus a handful of additional exports (below) — nothing above is
renamed or reshaped.

### Additional exports beyond the §4 list

These are additive; none of the names above are affected.

- **`enqueueProduction(state, factionId, unitClass, tick, buildingId?)`** and
  **`runCommanderAI(state, factionId, rng)`** — docs/RTS-CONTRACTS.md §3 explicitly calls for both
  to be part of the public, command-adjacent API, not just internal system details. Most callers
  won't need either directly (a `BUILD` `RTSCommand` through `tickMatch` covers production, and AI
  factions already run automatically inside `tickMatch` — see below) but they're useful for tests,
  tools, or a UI that wants to preview what the AI would do next.
- **`RTS_BUILDING_STATS`**, **`TICKS_PER_SECOND`**, **`AI_THINK_INTERVAL_TICKS`**,
  **`VICTORY_GRACE_SECONDS`** — constants the integration layer needs: building costs/health for
  the production UI, and the tick rate this package's ms-based reference constants were calibrated
  against (see "Tick timing" below) for building a compatible fixed-step accumulator.
- **`createRng`**, **`rngFromState`**, **`generateEntityId`**, and the **`Rng`** type — the PRNG
  this package's determinism depends on, exposed for tests/tools that want to reproduce or
  fast-forward a match's random stream outside of `tickMatch`.
- Supporting types consumers need to build valid entities/commands/config against the pinned API:
  **`Vec3`**, **`RTSMap`**, **`UnitCommand`**, **`UnitLifecycleState`**, **`BuildingClass`**,
  **`BuildingStats`**, **`MatchStatus`**, **`CommandType`**, **`ProductionQueueItem`**.

## Usage

```ts
import { createMatch, tickMatch, RTS_FACTIONS } from '@sonic-gameworld/rts-sim';

const state = createMatch({
  seed: 20260829,
  mapWidthM: 2000,
  mapDepthM: 2000,
  cellSizeM: 40, // matches the reference's CELL_SIZE, keeping the original tuning numbers valid
  factions: [
    { factionId: RTS_FACTIONS[0].id, isAIControlled: false }, // Raven Alliance — human
    { factionId: RTS_FACTIONS[1].id, isAIControlled: true },  // United Dragon Nations — AI
  ],
});

// createMatch() returns an EMPTY world — no units/buildings/resources. Placing the starting
// scenario (bases, initial units, Sotolium nodes) is the integration layer's job: in the shipped
// product that's Studio-authored WorldEntity placements converted to RTSBuilding/RTSUnit/
// RTSResourceNode by the 3D integration layer; in a test it's just pushing plain objects onto
// state.entities.* directly (see src/testFixtures.ts for a worked example).

// Then, at a fixed 10Hz (100ms) from your own accumulator loop:
let current = state;
function onFixedTick(pendingCommands: RTSCommand[]) {
  current = tickMatch(current, 0.1, pendingCommands);

  for (const unit of current.entities.units) {
    // sync unit.transform.position / .rotationY onto your renderer's entity for `unit.id`
  }
  if (current.status === 'GAME_OVER') {
    // current.winnerFactionId names the winning faction
  }
}

// A player selecting three units and right-click-moving them becomes one RTSCommand:
onFixedTick([{ type: 'MOVE', unitIds: [u1, u2, u3], targetPos: { x: 500, y: 0, z: 300 } }]);

// Reconnect / late join: transfer state as a string, resume ticking from it.
const wireFormat = serializeMatch(current);
const resumed = deserializeMatch(wireFormat);

// Desync detection between lockstep peers: compare cheap hashes on a slower cadence.
const checksum = stateHash(current);
```

## AI-controlled factions run *inside* `tickMatch` — not as a separate loop

Every `FactionSetup` with `isAIControlled: true` gets `runCommanderAI` invoked automatically by
`tickMatch` itself, once every `AI_THINK_INTERVAL_TICKS` ticks (30 ticks ≈ the reference's 3
simulated seconds), fed that tick's shared, seeded `rng`. You never call `runCommanderAI`
yourself in normal use.

This is deliberate, and it's why lockstep works at all for AI opponents: `runCommanderAI` is a
**pure function** — `(state, factionId, rng) => RTSCommand[]` — that only *proposes* commands,
which then flow through the exact same `applyCommand` path a human player's `MOVE`/`ATTACK`/
`HARVEST`/`BUILD`/`STOP` command takes. Because every peer's `rts-sim` instance runs
`tickMatch` with the same state and the same shared PRNG, every peer independently computes the
*same* AI decisions on the *same* tick — an AI faction's behavior never needs to be relayed over
the network at all, unlike a human player's commands (see §5 below).

## Integration points other packages need

Nothing outside this package exists yet — `packages/spatial-engine`, `packages/world-schema`,
`services/api`, `apps/player`, and `apps/studio` integration work is explicitly a later phase
(docs/RTS-CONTRACTS.md §6-§8) built against this README, not against this package's source. What
each of those efforts needs from here:

- **3D rendering (spatial-engine)**: read `state.entities.units[].transform.{position,rotationY}`
  and `state.entities.buildings[].{cellX,cellZ,sizeCells}` (× `state.map.cellSizeM` for world
  position) every render frame and sync them onto `WorldEntity`s via `EntityRegistry`— see
  "y / terrain height" below for the one piece this package deliberately does *not* own.
  `state.entities.units[].health/isSelected/factionId` etc. render as HUD overlays/tinting, not as
  `WorldEntity` fields (per §6, to avoid serializing full match state into the world document every
  frame).
- **Multiplayer relay (services/api)**: never runs this simulation at all — it only relays
  `RTS_COMMAND` messages (`{ tick, command: RTSCommand }`) verbatim between subscribers of a
  session's realtime topic, and occasionally relays `serializeMatch()` output for
  reconnect/late-join. `stateHash()` is what each client publishes for desync *detection* (not
  correction) between peers.
- **Player UI (apps/player)**: drives `tickMatch` on a `requestAnimationFrame`-driven fixed-step
  accumulator (10Hz, matching `TICKS_PER_SECOND`), turns marquee-select + right-click + shift-click
  input into `RTSCommand`s, and reads `state.productionQueue` (with `RTS_UNIT_STATS`/
  `RTS_BUILDING_STATS` for cost/duration) to render build queues and progress bars.
- **Studio (apps/studio)**: needs `RTS_UNIT_STATS`/`RTS_BUILDING_STATS`/`RTS_FACTIONS` to populate
  an entity palette and faction-assignment UI; the actual `RTSUnit`/`RTSBuilding` objects a match
  starts with are constructed by that integration layer from whatever a creator places, not by
  this package (`createMatch` always returns an empty world — see "Usage" above).

## `y` / terrain height is intentionally not this package's job

docs/RTS-CONTRACTS.md §2 describes height as coming from a `sampleTerrainHeight(x, z)` function
"injected into match config" — but §4 pins `createMatch`/`tickMatch`'s exact signatures, and
neither takes one. Since this package must never touch `three.js` or any spatial-engine import,
and its API surface is pinned exactly, real terrain-following height for ground units is squarely
the 3D integration layer's responsibility, applied when syncing `RTSMatchState` onto rendered
`WorldEntity`s. Within this package:

- Ground units (`INFANTRY`, `ARMORED`) always simulate at `position.y = 0`.
- `AIR` units always simulate at the fixed `AIR_FLIGHT_HEIGHT_M` (30m).
- Combat range checks (`combatSystem`) use pure XZ distance — height is ignored entirely, not just
  given a small tolerance — so an `AIR` unit flying above a ground unit is always in range of it
  and vice versa, matching the reference's flat-2D combat feel exactly instead of having Air units
  be permanently unreachable once "height" enters the picture.

## Tick timing

The reference measured cooldowns, build times, and AI cadence in wall-clock milliseconds — this
package may never read the wall clock, so every one of those constants is expressed in **ticks**
instead, calibrated against the 10Hz fixed-tick rate docs/RTS-CONTRACTS.md §4 documents
(`TICKS_PER_SECOND = 10`). If an integration layer ticks at a different rate, scale
`FIRE_COOLDOWN_TICKS`/`PRODUCTION_DURATION_TICKS`/`AI_THINK_INTERVAL_TICKS` accordingly — the
underlying real-world durations (1s fire cooldown, 3.5s build time, 3s AI think interval) are
unchanged from the reference.

## Deviations from the reference

Called out here, as docs/RTS-CONTRACTS.md §2 asks, since these are the handful of places behavior
isn't a straight numeric port:

1. **Projectile travel is clamped to the remaining distance to target, per tick.** The reference
   ran on real-time `requestAnimationFrame` deltas (~16ms), so a 750 units/sec projectile moved
   ~12 units/frame — right around `PROJECTILE_HIT_DISTANCE` (12), so it naturally landed inside the
   hit radius on its last frame. This package's fixed 10Hz tick moves a projectile ~75 units/tick
   instead: without clamping, a projectile can tunnel straight through and past the 12-unit hit
   window in a single tick, then reverse direction toward its (now-behind-it) target next tick,
   overshoot again on the way back, and oscillate forever — never resolving, and never dealing
   damage. Clamping travel to `min(speed * dtSeconds, remainingDistance)` fixes this without
   changing the reference's damage/targeting behavior. See `src/systems/projectileSystem.ts`.
2. **A destroyed producing building refunds credits instead of silently eating them.** If a
   faction's production order finishes but the building that started it (and every other
   compatible building) has since been destroyed, the reference just drops the spent credits
   silently. This package refunds the unit's cost instead — losing a factory mid-build shouldn't
   also erase the credits already spent. See `src/systems/productionSystem.ts`.
3. **`ATTACK` is a new command type with no reference equivalent.** The reference's `CommanderAI`
   only ever issued `MOVE` onto an enemy's current position and let proximity-based auto-fire do
   the rest. This package adds an explicit `ATTACK` command (`docs/RTS-CONTRACTS.md §2` requires it
   in the type) that behaves like an attack-move: it re-paths toward a *moving* target's current
   position every tick until the target dies, rather than walking to one stale snapshot position.
   `runCommanderAI` itself is unchanged and still issues `MOVE`, for exact behavioral fidelity with
   the reference's AI.
4. **Height/terrain sampling is out of scope** — see the dedicated section above.
5. **Command replace semantics.** Applying an `RTSCommand` to a unit *replaces* that unit's
   command queue (`unit.commands = [cmd]`) rather than appending to it — matching how the
   reference's own `CommanderAI` issued orders. Shift-click order queuing is a `apps/player` input
   concern for a later phase, not a simulation concern here.

Everything else — `UNIT_STATS`, `BUILDING_STATS`, `SOTOLIUM_CONVERSION_RATE`,
`COOLING_RATE`, steering/separation/arrival tuning, harvest range, movement friction, boundary
margins, A* behavior (including its "fall back to a direct-line path when the search budget is
exhausted but the target cell itself is free" quirk) — is numerically identical to the reference.
See `src/constants.ts` for the full annotated list. (`STARTING_CREDITS` is the one exception,
changed by the §9 depth extension below — see "The `STARTING_CREDITS` change" in that section.)

## §9 additive extensions — depth-extension design material (docs/RTS-CONTRACTS.md §9)

Everything in this section was added *after* the §1-4 baseline above was already built and
verified (97 tests, all still green), layered on additively per a supplemental design brief: new
exported constants/types/functions and new *optional* fields on existing types. **Nothing in the
§4 pinned surface (`createMatch`/`tickMatch`/`serializeMatch`/`deserializeMatch`/`stateHash`
signatures, `RTS_UNIT_STATS`, `RTS_FACTIONS`, or any pinned type) changed shape or was removed or
renamed** — every pre-existing call site (including every one of the original 97 tests) keeps
compiling and behaving identically. The brief assumed an Unreal Engine 5/C++ implementation; that
assumption does not apply here (this platform's TypeScript/three.js stack was fixed in
`docs/RTS-CONTRACTS.md`'s opening "decisions already made") — treat everything below as design
intent and balance targets ported onto the existing architecture, not a rewrite.

### The `STARTING_CREDITS` change

`STARTING_CREDITS` went from `2500` to **`50000`**. This is not a balance tweak to the original
3-unit-class game — it reflects §9's much larger rosters and hard caps (250 combined
INFANTRY+ARMORED, 50 AIR per faction, see below) needing an economy that can actually field armies
that size from the start, rather than trickling in one unit at a time for several minutes.

### Expanded unit roster: `RTS_UNIT_TYPE_STATS`

`UnitClass` (`INFANTRY|ARMORED|AIR`) is unchanged and still drives combat resolution — range,
targeting, and (per `docs/RTS-CONTRACTS.md` §9) any future RPS-style multiplier axis. `UnitType` is
a new, additive, purely cosmetic/economic sub-classification layered on top of it:

```ts
type UnitType = 'RIFLEMAN' | 'SPEC_OPS' | 'SNIPER' | 'HEAVY_GUNNER' | 'COMBAT_MEDIC' | 'OFFICER'    // 6 infantry
  | 'MAIN_BATTLE_TANK' | 'APC' | 'SELF_PROPELLED_ARTILLERY'                                          // 3 vehicles
  | 'VTOL_GUNSHIP' | 'BOMBER_DRONE' | 'RECON_DRONE'                                                   // 3 air
  | 'DESTROYER' | 'FRIGATE' | 'TRANSPORT_SHIP' | 'RAILGUN_CRUISER';                                   // 4 naval

const RTS_UNIT_TYPE_STATS: Record<UnitType, UnitTypeStats>; // { unitClass, cost, health, damage, speed, munition, heatPerShot, coolingRate, navalOnly? }
```

`RTSUnit.unitType?: string` is a new optional field (§2's `heat` field's sibling — see below);
`ProductionQueueItem.unitType?: string` and `RTSCommand.unitType?: string` (on a `BUILD` command)
carry a requested archetype through to production. A unit produced *without* a `unitType` still
uses the plain `RTS_UNIT_STATS[unitClass]` numbers exactly as before (this is how every one of the
original 97 tests keeps working unmodified). One produced *with* one gets that archetype's
cost/health/damage/speed layered on top — `attackRange`/`detectionRadius` still come from the
plain `unitClass` table, since those are the combat-resolution axis this feature deliberately
doesn't touch. Naval archetypes (`navalOnly: true`) are rejected by `tryEnqueueProduction`
(`NAVAL_REQUIRES_SEA_BIOME`) on any map whose `biome` isn't `'SEA'`.

**Why naval archetypes map to `unitClass: 'ARMORED'`, not a dedicated `NAVAL` class**: §9 is
explicit that `UnitClass` "stays exactly as pinned" — it's the combat-resolution axis and must not
grow. Ships are heavy, don't fly, and trade fire like a ground vehicle, so `ARMORED` is the closest
existing fit; `unitType`/`navalOnly` is what actually gates their sea-only placement and steering.

### Munition + heat, wired for real

Each `UnitType` has a `munition: 'BALLISTIC' | 'RAILGUN' | 'PLASMA'` and a `heatPerShot` tuned near
that munition's tier baseline (`MUNITION_HEAT_PER_SHOT`: low/medium/high) plus its own
`coolingRate`. `combatSystem` and `RTSUnit.heat` — reserved but inert in the §1-4 baseline — now
actually use a unit's `unitType` entry for both, falling back to the plain `RTS_UNIT_STATS`/
`COOLING_RATE` numbers when no `unitType` is set (so, again, no behavior change for any
pre-existing unit). `HEAT_DETECTION_THRESHOLD` and `isThermallyExposed(unit)` are the exported
detection-threshold constant/helper the spec asks for; `fogOfWarSystem` uses it to auto-reveal a
thermally-exposed unit regardless of the cell-based visibility it would otherwise compute — also
wired for real, not just an inert export. United Dragon Nations' "guerrilla, low-heat hit-and-run"
doctrine is reflected in `runCommanderAI`: a thermally-exposed Dragon unit holds back from a fresh
opportunistic attack instead of piling on more heat (Raven's sustained-fire doctrine has no such
throttle) — see `src/ai/commanderAI.ts`'s module doc.

### Stealth + radar: `RTS_RADAR` + `computeDetection`

`RADAR` was already a `BuildingClass`/`RTS_BUILDING_STATS` entry in the §1-4 baseline (it just had
no special detection behavior yet); §9 gives it a large detection radius via a new optional
`BuildingStats.detectionRadiusM` field (`RTS_RADAR_DETECTION_RADIUS_M`, 600m) and wires it into
`fogOfWarSystem` for real (a RADAR building grants its owner that radius of visibility instead of
the flat radius every other building gets).

`computeDetection(state, unit, viewerFactionId): boolean` is the exported helper for the full §9
rule — `heatExposed OR withinRadarRange OR withinProximityDetection(halved in cover)` — for callers
that need the exact per-unit answer (a HUD detail panel, an AI stealth decision, a test).
**Deliberate scoping decision**: the automatic per-tick `fogOfWarSystem` (used inside `tickMatch`)
wires in heat-auto-reveal and RADAR range (both real, both tested) but does *not* model cover
there, because cover halves the *target's* effective range rather than the *viewer's*, which
doesn't fit `fogOfWarSystem`'s cell-marking algorithm without a per-unit distance pass on every
tick. `computeDetection` is the fully spec-compliant query when that fidelity is actually needed;
see `src/systems/stealth.ts`'s module doc for the full rationale. "Cover" cells are represented as
`RTSMap.coverCells?: Uint8Array` — row-major, same shape as `occupancy`, 1 = cover — flagged at
map-authoring time in Studio exactly like the brief describes, never computed procedurally by this
package. `createMatch` always allocates an all-zero one (`isCoverCell`/`isPositionInCover` treat a
missing grid as "no cover anywhere" for data serialized before this field existed).

### Economy + roster caps

Hard per-faction caps — `RTS_UNIT_CAP_GROUND` (250, combined INFANTRY+ARMORED) and
`RTS_UNIT_CAP_AIR` (50) — are enforced in `productionSystem`. The spec asks for a rejection "not a
silent no-op", so there are now two ways to enqueue production:

- **`enqueueProduction`** (original §1-4 signature, unchanged, plus one new trailing optional
  `unitType` param) still just returns `boolean` — `false` now also covers "rejected for being over
  cap", exactly like it already covered "can't afford it".
- **`tryEnqueueProduction`** (new) returns a typed result: `{ ok: true; queueItemId: string } | {
  ok: false; reason: 'INSUFFICIENT_CREDITS' | 'UNIT_CAP_REACHED' | 'NAVAL_REQUIRES_SEA_BIOME' }` —
  this is what a HUD should call to show "unit cap reached" instead of a build button that just
  silently does nothing.

A cap counts *both* living units and already-queued orders of the relevant class(es) for that
faction, so spamming BUILD commands can't sneak past it before the first one spawns.

### Difficulty presets

```ts
type DifficultyLevel = 'BEGINNER' | 'INTERMEDIATE' | 'PRO';
const RTS_DIFFICULTY_PRESETS: Record<DifficultyLevel, DifficultyPreset>; // { economyMultiplier, aggressionChance, alliedStrikesEnabled }
```

`FactionSetup` gains an optional `difficulty?: DifficultyLevel` field; `tickMatch` passes the
matching preset into `runCommanderAI` automatically for that faction — `runCommanderAI` itself
gained a new optional 4th parameter, `options?: { difficulty?: DifficultyLevel }`, so every
existing 3-argument call site (including all of the original tests) is unaffected.
`economyMultiplier` (1x/1.5x/2x) divides the AI's production credit threshold, so a higher
difficulty spends more eagerly for the same credit balance; `aggressionChance` gates each idle
unit's opportunistic attack behind a per-unit rng roll instead of committing every idle unit
unconditionally (Beginner hesitates, Pro always commits — matching the original, difficulty-less
behavior exactly). **Omitting `difficulty` entirely reproduces the exact pre-§9 AI behavior
byte-for-byte** — no extra rng draws, no threshold change.

### Allied-nation coordinated strikes (Pro only)

`src/ai/alliedCoordinator.ts` exports `evaluateAlliedStrike(state, primaryFactionId,
allyFactionIds, rng): RTSCommand[]` — a pure function, exactly like `runCommanderAI`, that only
*proposes* commands for `tickMatch` to apply through the normal `applyCommand` path (never a
side-channel mutation, and never `Math.random()` — only the shared seeded `rng`, so every lockstep
peer computes the identical strike batch independently). `FactionSetup` gains an optional
`alliedFactionIds?: string[]`; when a faction's `difficulty` is `'PRO'` and it has allies listed,
`tickMatch` evaluates this automatically every AI-think interval, right alongside `runCommanderAI`.

Trigger condition: `computeMapControlScore` (the primary faction's share of the map's total living
buildings) crosses `ALLIED_STRIKE_MAP_CONTROL_THRESHOLD` (0.6). Once crossed, each ally (capped to
`ALLIED_STRIKE_MAX_ALLIES`, 3) that currently has living units contributes up to
`ALLIED_STRIKE_FORCE_SIZE` (5) of them to one attack-move command converging on the primary
faction's currently weakest (lowest-health) surviving building — a deliberate sabotage target, not
a random walk. This is a documented design call for "map-control progress", which the brief doesn't
define precisely: building-share was chosen over, e.g., visible-cell area, because it's cheap,
already-available state (no new per-tick scan) and easy to reason about/test.

### Biome variants

```ts
type Biome = 'URBAN' | 'JUNGLE' | 'SEA'; // RTSMap.biome, defaults to 'URBAN' in createMatch
```

`getTeamColor(factionId, biome): string` + `RTS_TEAM_COLORS_BY_BIOME` give the rendering layer
Raven Alliance's constant Blue (`#0033FF`) and United Dragon Nations' Red (`#CC1122`, Urban/Sea) or
Green (`#2E8B32`, Jungle) — falling back to a neutral gray for any faction id the table doesn't
know about (e.g. a Pro-difficulty allied faction with its own id).

**Naval steering simplification, stated plainly**: full naval pathfinding (buoyancy, a water-only
navmesh) is out of scope for this pass, exactly as the brief anticipates. On a `biome: 'SEA'` map, a
naval unit (`isNavalUnit`) gets a direct single-waypoint path instead of an A* route
(`commandSystem`'s `pathTo` helper) — `movementSystem`'s existing seek/separation steering
(unchanged) then does the rest, since it already reduces to plain seek-toward-one-waypoint for a
one-point path. This is a real, working simplification (open water is usually obstacle-free) — not
a stub that silently does nothing — but it means a naval unit given a target on the far side of a
landmass on a SEA map will walk (well, sail) straight through it rather than routing around, since
there is no obstacle-aware naval pathfinding yet.

### Full §9 export list

New exported constants: `RTS_UNIT_TYPE_STATS`, `MUNITION_HEAT_PER_SHOT`, `HEAT_DETECTION_THRESHOLD`,
`RTS_RADAR_DETECTION_RADIUS_M`, `RTS_UNIT_CAP_GROUND`, `RTS_UNIT_CAP_AIR`,
`RTS_DIFFICULTY_PRESETS`, `ALLIED_STRIKE_MAP_CONTROL_THRESHOLD`, `ALLIED_STRIKE_FORCE_SIZE`,
`ALLIED_STRIKE_MAX_ALLIES`, `RTS_TEAM_COLORS_BY_BIOME`, `RTS_DEFAULT_TEAM_COLOR`.
New exported functions: `tryEnqueueProduction`, `computeDetection`, `isThermallyExposed`,
`isCoverCell`, `isPositionInCover`, `evaluateAlliedStrike`, `computeMapControlScore`,
`getTeamColor`, `isNavalUnit`, `isNavalUnitType`.
New exported types: `UnitType` (+ its `InfantryUnitType`/`VehicleUnitType`/`AirUnitType`/
`NavalUnitType` constituents), `UnitTypeStats`, `Munition`, `DifficultyLevel`, `DifficultyPreset`,
`RunCommanderAIOptions`, `Biome`, `ProductionResult`, `ProductionRejectionReason`.
New optional fields on existing pinned types: `RTSUnit.unitType`, `RTSCommand.unitType`,
`ProductionQueueItem.unitType`, `FactionSetup.difficulty`, `FactionSetup.alliedFactionIds`,
`RTSMap.coverCells`, `RTSMap.biome`, `BuildingStats.detectionRadiusM`. New optional `CreateMatchOptions`
fields: `biome`, `coverCells`. `enqueueProduction` gained one new trailing optional parameter
(`unitType`); `runCommanderAI` gained one new optional 4th parameter (`options`). Nothing else
changed shape.

## Package layout

```
src/
  types.ts              Vec3-based 3D types (§2) + §9's additive types
  constants.ts           tuning numbers (ported + documented deviations) + §9's new tables
  biome.ts                §9: team-color-by-biome lookup + naval unit-type helpers
  rng.ts                 seeded PRNG (mulberry32) + deterministic id generation
  systems/
    util.ts               shared distance/lookup helpers
    spatialGrid.ts         SpatialGrid (ported from SpatialGrid.ts)
    steering.ts            separation/seek/arrival (ported from Steering.ts)
    pathfinding.ts          grid A* (ported from utils/pathfinding.ts)
    commandSystem.ts        applyCommand (multi-unit fan-out) + per-tick command progression
    movementSystem.ts       steering + waypoint following
    combatSystem.ts         proximity targeting + projectile spawning (§9: per-unitType heat)
    projectileSystem.ts     projectile travel + impact damage
    harvestingSystem.ts     Sotolium extraction + credit conversion
    fogOfWarSystem.ts       death transition + per-viewer-faction visibility (§9: heat/radar reveal)
    victorySystem.ts        last-faction-standing win condition (N factions)
    productionSystem.ts     build queues + enqueueProduction/tryEnqueueProduction (§9: caps)
    stealth.ts              §9: isThermallyExposed / computeDetection / cover-cell helpers
  ai/
    commanderAI.ts          pure runCommanderAI(state, factionId, rng, options?) => RTSCommand[]
    alliedCoordinator.ts    §9: pure evaluateAlliedStrike(state, primaryFactionId, allies, rng)
  index.ts                public API (this file's exports are the pinned §4 surface + §9 additions)
  testFixtures.ts          shared test scaffolding (not exported from index.ts)
  *.test.ts / systems/*.test.ts / ai/*.test.ts   one file per system, plus:
  determinism.test.ts     docs/RTS-CONTRACTS.md §1's byte-identical-replay test (+ a §9 scenario)
  integration.test.ts     full-match test: scripted scenario runs to a decisive victory
```

## Running

```bash
pnpm --filter @sonic-gameworld/rts-sim typecheck
pnpm --filter @sonic-gameworld/rts-sim build     # tsup -> dist/ (ESM + .d.ts)
pnpm --filter @sonic-gameworld/rts-sim test       # vitest
```

No environment variables — this package is pure computation with no I/O of any kind.
