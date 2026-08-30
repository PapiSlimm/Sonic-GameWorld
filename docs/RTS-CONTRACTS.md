# RTS Integration Contract — "Global Dominance" inside Sonic GameWorld OS

Binding addendum to `docs/CONTRACTS.md` for one feature: bringing the uploaded **Global Dominance
RTS v2.0** prototype (reference source preserved verbatim at
`docs/reference/global-dominance/`) into Sonic GameWorld as a first-class, creator-spawnable game
template — real-time strategy in a true 3D world, playable in three ways: the existing top-down
strategic command view, and genuine first-person or third-person control of any single unit by
possessing it. Read `docs/reference/global-dominance/src/**` before writing any simulation code —
it is a complete, working 2D RTS (units, factions, economy, combat, pathfinding, steering, AI,
production, fog of war, victory condition) and the closest thing to ground truth for exact game
feel this spec has. This is a **behavioral port, not a literal one**: every system gets rebuilt
for true 3D (XZ-plane movement, terrain-sampled height, deterministic lockstep for multiplayer)
rather than copy-pasted, but the numbers, pacing, and design intent should carry over recognizably
— same two factions (Raven Alliance vs. United Dragon Nations), same Sotolium resource economy,
same three unit classes (Infantry/Armored/Air), same building roster (Refinery/Barracks/Factory/
Airfield/Radar).

Decisions already made (do not re-litigate these):
- This ships as a new **RTS game template/kit** creators spawn from Studio — not a separate
  standalone app, not a passive overlay. It lives inside the existing creation/marketplace loop.
- Core gameplay systems (movement, pathfinding, steering, combat, AI, production) are **rebuilt as
  real 3D systems**, using the reference source as design/behavior truth, not ported verbatim.
- Both single-player-vs-AI and real-time human-vs-human multiplayer ship in this pass.
- Same build/delivery process as the base platform: parallel agents against this contract, full
  workspace verify (typecheck/build/test), then delivered to the user's connected folder + zip.

## 1. Package boundary — read this before writing any code

All core simulation logic lives in **one new package, `packages/rts-sim`**, with zero rendering
and zero networking dependencies (no `three`, no `pixi`, no `fastify`, no `ws`). It is pure,
deterministic TypeScript that `apps/player` (rendering + input), `apps/studio` (authoring), and
`services/api` (multiplayer relay, if it needs to inspect state) all import identically. This
mirrors how the reference's own `engine/` folder was renderer-independent from `GameRenderer` —
keep that separation, just make it a real published workspace package instead of an implicit
convention.

**Determinism is the hard requirement**, because multiplayer here is lockstep (§5): given the same
initial seed and the same ordered command stream, `tickMatch()` must produce bit-identical
resulting state on every machine that runs it. Concretely this means: no `Math.random()` anywhere
in the sim — thread a seeded PRNG (mulberry32 or equivalent, ship it in this package) through
match state and every call site that needs randomness (CommanderAI target selection, unit spawn
IDs, etc.); no `Date.now()` or wall-clock reads inside tick logic — time only enters via the
`dtSeconds` parameter passed into `tickMatch()`; no iteration order that depends on object
insertion into a `Set`/`Map` when the outcome is order-sensitive — use arrays or explicitly sort.
Write a test that runs the same seed + command sequence twice and asserts the resulting serialized
state is byte-identical; this is the single most important test in the whole feature.

## 2. Core types (packages/rts-sim/src/types.ts)

Port `docs/reference/global-dominance/src/types.ts` to 3D and generalize away the hardcoded
2-faction enum (keep Raven/Dragon as the two factions this template ships with with the same
lore/names, but the type system should allow more later — a `factionId: string` rather than a
closed enum). Key shape changes from the reference:

- `Vec3 = { x: number; y: number; z: number }` replaces every 2D `{x,y}` position/velocity. Units
  move on the XZ plane; `y` (height) is set once per tick by calling a `sampleTerrainHeight(x, z):
  number` function injected into match config (spatial-engine's terrain sampling on the
  integration side; the sim package itself never touches three.js — it just calls the function
  it was given).
- `RTSUnit`: id, factionId, unitClass (`'INFANTRY' | 'ARMORED' | 'AIR'`), transform `{ position:
  Vec3; rotationY: number }`, velocity: Vec3 (y velocity ignored/zeroed — no vertical physics for
  v1, Air class unit special-cases a fixed flight height instead), path: `Vec3[]`, health/maxHealth
  /speed/attackRange/damage/detectionRadius (same stat shape as reference `UNIT_STATS`), state
  (`'IDLE'|'MOVING'|'ATTACKING'|'HARVESTING'|'DEAD'`), commands: `RTSCommand[]`, targetNodeId,
  lastFiredAtTick, harvestedSotolium, isDetected, heat, isSelected.
- `RTSBuilding`, `RTSResourceNode` (Sotolium), `RTSProjectile`: same fields as reference, Vec3'd.
- `RTSCommand`: `{ type: 'MOVE'|'ATTACK'|'HARVEST'|'BUILD'|'STOP'; unitIds: string[]; targetPos?:
  Vec3; targetId?: string; buildType?: 'INFANTRY'|'ARMORED'|'AIR' }` — note this is
  **multi-unit** (`unitIds`, plural) unlike the reference's single-unit `commands` queue per-unit,
  because a real RTS issues one command to a whole selection at once; fan it out to each unit's own
  per-unit command queue inside `applyCommand()`.
- `RTSMatchState`: sessionTime, tick (integer, increments once per fixed tick), status
  (`'LOBBY'|'PLAYING'|'PAUSED'|'GAME_OVER'`), entities `{ units, buildings, resources,
  projectiles }`, economy `Record<factionId, { credits: number }>`, map `{ widthM: number;
  depthM: number; cellSizeM: number; occupancy: Uint8Array }` (occupancy grid for pathfinding,
  built from `BUILDING` placement + any world terrain obstacles the integration layer marks
  occupied), rngState (serializable PRNG state), winnerFactionId, productionQueue (per faction).
- Keep the reference's constants as a starting point (`UNIT_STATS`, `STARTING_CREDITS`,
  `SOTOLIUM_CONVERSION_RATE`, `COOLING_RATE`) — same numbers unless a specific reason to change
  them (note any change in this package's README).

## 3. Simulation systems (packages/rts-sim/src/systems/*.ts)

One file per system, each a pure function `(state: RTSMatchState, dtSeconds: number, ...) =>
void` (mutate a draft, or return a new state — pick one convention and use it consistently; the
reference used direct mutation inside a Zustand `set`, which doesn't apply here since this package
owns no store — a plain mutable-draft-passed-in style, called from `tickMatch()`, is simplest).
Port these directly from the reference, adapted to 3D and the multi-unit command shape from §2:

- `commandSystem` — reference `GameEngine.commandSystem`. Same MOVE/HARVEST logic; add a `STOP`
  case (clear commands + path) since a real multi-unit RTS needs it even though the reference
  didn't have one bound to a key.
- `movementSystem` — reference `movementSystem` + `Steering.getSeparation/getSeek/getArrival`
  (port `docs/reference/global-dominance/src/engine/Steering.ts` near-verbatim, XZ instead of XY)
  + `docs/reference/global-dominance/src/utils/pathfinding.ts`'s A* (also near-verbatim — it
  already operates on an abstract grid, trivially reusable) + `SpatialGrid` (also near-verbatim).
  Skip movement for any unit currently possessed by a human player in first/third-person mode
  (reference already had this exact carve-out: `if (viewMode === 'FPS' && unit.id ===
  controlledUnitId) return;` — keep that pattern, generalized to `state.possessedUnitId` per
  player rather than global).
- `combatSystem` + `projectileSystem` — port near-verbatim; targeting/range checks are
  distance-in-3D-but-effectively-XZ (ignore height component or use small height tolerance, since
  Air units flying above ground units would otherwise never be "in range" of each other —
  document whatever tolerance you pick).
- `harvestingSystem` — reference's Sotolium economy loop, verbatim logic.
- `fogOfWarSystem` — reference's detection-radius visibility grid, verbatim logic, keyed by
  `factionId` instead of hardcoded player faction (compute one visibility map per human-controlled
  faction that's actually being queried, not all factions eagerly).
- `victorySystem` — last-faction-with-a-surviving-building wins, verbatim logic, generalized to
  N factions instead of exactly 2.
- `productionSystem` — port `UnitProduction.ts`: build queue keyed by faction, cost/duration from
  `UNIT_STATS`, spawns at the appropriate building type. Expose `enqueueProduction(state,
  factionId, unitClass, tick)` as a command-adjacent API (a `BUILD` command with `buildType`,
  handled by this system rather than commandSystem, since it isn't a per-unit command).
- `commanderAI` (packages/rts-sim/src/ai/commanderAI.ts) — port `CommanderAI.ts`'s three
  behaviors (production-when-affordable, idle-unit-attacks-random-enemy,
  idle-infantry-auto-harvests) as a pure function `runCommanderAI(state, factionId, rng):
  RTSCommand[]` returning commands to apply on the next tick, called once per faction marked
  AI-controlled every ~3 simulated seconds (a tick-count threshold, not wall-clock). No direct
  state mutation from this function — it only proposes commands, exactly like a human player's
  input would, so AI and human factions go through the identical `applyCommand()` path (this
  matters for the multiplayer lockstep model in §5: AI decisions must also be part of the
  deterministic command stream, computed identically on every client, or the AI faction will
  desync — use the shared match `rng`, seeded identically on every peer, for the AI's random
  choices, never `Math.random()`).

## 4. Public API (packages/rts-sim/src/index.ts) — pin this exactly, other agents build against it

```ts
export function createMatch(options: { seed: number; mapWidthM: number; mapDepthM: number; cellSizeM: number; factions: FactionSetup[] }): RTSMatchState;
export function tickMatch(state: RTSMatchState, dtSeconds: number, commands: RTSCommand[]): RTSMatchState; // fixed-tick, e.g. call at 10Hz (100ms) from the integration layer's accumulator
export function serializeMatch(state: RTSMatchState): string; // for late-join/reconnect state transfer
export function deserializeMatch(json: string): RTSMatchState;
export function stateHash(state: RTSMatchState): string; // cheap checksum for desync detection between peers
export const RTS_UNIT_STATS: Record<UnitClass, UnitStats>;
export const RTS_FACTIONS: readonly FactionDefinition[]; // Raven Alliance, United Dragon Nations
export type { RTSUnit, RTSBuilding, RTSResourceNode, RTSProjectile, RTSCommand, RTSMatchState, FactionSetup, FactionDefinition, UnitClass, UnitStats };
```

Write this package's own `README.md` the way every other package in this repo documents itself —
exact exports, a short usage example (`createMatch` → loop of `tickMatch` → read `state.entities`),
and an explicit "integration points other packages need" section, matching the style
`workers/*/README.md` used successfully in the base build (that pattern is why the base platform's
integration pass went smoothly — keep using it).

Test coverage: one test file per system, plus the determinism test from §1, plus a full-match
integration test (create a match, feed it a scripted command sequence for several hundred ticks,
assert a faction eventually wins). Target genuinely thorough coverage — this package has zero
runtime dependents to catch bugs for you (no Fastify route will 500 if the pathfinder is subtly
broken; a unit will just silently never move).

## 5. Multiplayer model — lockstep command relay, not server-authoritative simulation

Classic RTS netcode: nobody sends state, everyone sends **commands**, and every client's local
`rts-sim` instance ticks identically because it started from the same seed and receives the same
commands in the same order. `services/api` does not run the simulation at all — it is purely a
relay + lobby manager, consistent with this codebase's existing "the API only ever enqueues/
relays, workers/clients do the work" pattern used everywhere else in this repo.

Reuse the existing realtime bridge (`services/api/src/realtime/ws.ts`, topic `session:<id>`) —
read it before designing anything new. Add:

- `POST /games/:id/rts/sessions` (or extend the existing `POST /games/:id/sessions` in
  `src/modules/games/index.ts` — check whether it already fits before adding a parallel route) —
  creates a `GameSession`, returns the RTS match seed + `FactionSetup[]` (which `GameSessionPlayer`
  controls which faction; unfilled factions default to AI-controlled).
- A `RTS_MATCH_START` realtime message broadcast on `session:<id>` once all players are ready,
  carrying the seed + faction assignments so every client calls `createMatch()` with identical
  arguments.
- Clients `PUBLISH` (the existing `ClientOp` already supports this op — check `ws.ts`'s
  `isClientOp`/message handling before adding a new op type) an `RTS_COMMAND` message `{ tick:
  number; command: RTSCommand }` — `tick` is the target tick the command should apply on
  (current tick + a small fixed delay, e.g. 3-6 ticks / ~300-600ms, giving every peer time to
  receive it before that tick arrives — standard lockstep input delay). The server relays it
  verbatim to every other subscriber of `session:<id>` (broadcast, no simulation, no validation
  beyond "is this player actually in this session" — cheating prevention is explicitly out of
  scope for this pass, note that in this package's README as a known limitation).
- Reconnect: a rejoining client requests current state from any connected peer (or, simpler for
  v1: the host periodically publishes `serializeMatch()` output on a slower cadence, e.g. every 30
  ticks, and a reconnecting client applies the most recent one instead of full command replay from
  tick 0 — pick whichever is less work to build correctly and document the choice).
- Desync detection (not correction): every N ticks each client publishes `stateHash()`; if hashes
  disagree across peers, surface a "match desynced" notice in the HUD rather than attempting
  reconciliation — that's a real limitation worth being honest about in the audit rather than
  quietly shipping broken netcode dressed up as robust.

## 6. 3D integration (packages/spatial-engine, packages/world-schema)

- Add `'RTS'` as a 10th value to `CameraModeSchema`/`CAMERA_MODES`
  (`packages/world-schema/src/schema.ts`) and `CameraModeArg`
  (`packages/world-schema/src/ai-tools.ts`) — a fixed-pitch overhead strategic camera: edge-pan
  and click-drag pan, scroll-wheel zoom between two bounds, no orbit/roll. Implement it at
  `packages/spatial-engine/src/camera/modes/rts.ts` following the existing `CameraModeHandler`
  interface (`packages/spatial-engine/src/camera/types.ts`) the same way `drone.ts` or `orbit.ts`
  do, and export it from `index.ts` alongside the other 9 modes.
- Possession (switching a selected unit to first/third-person): read
  `packages/spatial-engine/src/camera/CameraController.ts`'s actual runtime `setMode`/target-setting
  method (not the AI-tool-facing `move_camera` schema in world-schema, which is the orchestrator's
  surface, not the client runtime's) and drive it from the RTS HUD when the player clicks
  "possess" on a selected unit, targeting that unit's rendered entity. `FIRST_PERSON` and
  `THIRD_PERSON` already exist and work — this is wiring, not new camera-mode implementation.
- Add `'RTS_UNIT'` and `'RTS_BUILDING'` to `EntityKindSchema`/`ENTITY_KINDS`
  (`packages/world-schema/src/schema.ts`) — confirmed safe: `EntityKind` is not a Postgres enum,
  `WorldVersion.document` is a plain `Json` column, so this is a pure TypeScript/zod schema change
  with no migration. Add corresponding entries to `packages/spatial-engine/src/engine/entities.ts`:
  `ENTITY_KIND_TO_LAYER` (new `LayerKind` values `'RTS_UNITS'`/`'RTS_BUILDINGS'`, or reuse
  `VEHICLES`/`BUILDINGS` layers if a whole new layer feels unnecessary — your call, document it),
  `geometryForKind` (simple primitives are fine — a capsule/box per unit class, a larger box per
  building; this is a real-time strategy game with dozens of units on screen, keep geometry cheap),
  and `ENTITY_KIND_COLORS`/`ENTITY_KIND_RADIUS`/`RENDERABLE_KINDS` in `packages/spatial-engine/src/types.ts`.
- The integration layer owns syncing `rts-sim`'s `RTSMatchState.entities` into actual
  `WorldEntity[]` each render frame (position/rotation only — health/selection/faction render as
  HUD overlays and unit-tinting, not stored on the WorldEntity itself, to avoid serializing full
  match state into the world document every frame). This adapter is new code in
  `packages/spatial-engine` (e.g. `src/rts/syncEntities.ts`) — write it to take an `RTSMatchState`
  and an `EntityRegistry`, and update/create/remove Three.js objects to match, reusing
  `EntityRegistry`'s existing add/update/remove methods rather than bypassing them.
- Studio (`apps/studio`): add RTS unit/building types to whatever entity-palette component lets
  creators place entities (find it — likely under `apps/studio/app/worlds/[id]/**` — and follow
  its existing pattern), plus a minimal faction-assignment UI (which `NPCDefinition.behavior.faction`-
  style field, or new dedicated field, marks starting units/buildings per faction — your call,
  document it) so a creator can lay out a symmetric or asymmetric RTS map.

## 7. Player app integration (apps/player) — the actual game

New play mode alongside the existing player experience (check `apps/player/app/**`'s current
routing/page structure before deciding whether this is a new route or a mode flag on an existing
one). Port the reference's UI/UX intent from
`docs/reference/global-dominance/src/components/Minimap.tsx`,
`docs/reference/global-dominance/src/store/gameStore.ts`, and
`docs/reference/global-dominance/src/input/InputHandler.ts` (marquee drag-select, shift-click
queue, right-click move/attack-move, minimap click-to-jump) as real React components wired to a
Zustand store (matching this repo's existing state-management conventions — check what
`apps/player` already uses before introducing a new pattern) that holds the local `RTSMatchState`
+ drives `tickMatch()` on a `requestAnimationFrame`-driven fixed-step accumulator, publishing
outgoing commands over the websocket relay from §5 and applying incoming ones.

Required HUD pieces, all real (not placeholder): minimap (click-to-recenter camera), unit
selection (drag-box + click, health bars over selected units), command feedback (move markers,
attack-move cursor), production panel (per-building build queue with progress bars, credits
display), a faction/lobby screen before match start (host creates session, others join via the
existing `GameSession`/`GameSessionPlayer` flow, pick faction or accept AI), a "possess" button on
a single selected unit that switches the camera per §6, and a way to return to the RTS overview
camera from possession (documented keybind is fine, e.g. Escape).

## 9. Depth extension — supplemental design material (read after §1-8, before building #10/#11/#13)

The user supplied additional Global Dominance design/lore material (a text brief plus concept art)
after `packages/rts-sim`'s baseline (§1-4) was already built and verified. It assumes an Unreal
Engine 5 / C++ implementation — **that assumption does not apply here and must not be acted on**:
this platform's engine/stack decision (TypeScript, three.js/`spatial-engine`, the existing
monorepo) was made explicitly in this contract's opening "decisions already made" and stays fixed.
Treat the brief purely as **design intent and balance targets** to layer additively onto the
already-pinned `rts-sim` public API (§4) — no breaking changes to `createMatch`/`tickMatch`/
`serializeMatch`/`deserializeMatch`/`stateHash` signatures. This section is what task #13 builds;
#10 and #11 can proceed in parallel against the §1-8 baseline without waiting on it, and the final
integration pass (#12) reconciles anything that touches shared surface (e.g. HUD heat/stealth
readouts).

Concrete additions, all additive to existing types/constants:

- **Expanded unit roster within the existing 3 combat classes.** `UnitClass` (`INFANTRY|ARMORED|
  AIR`, and its RPS damage-multiplier rules) stays exactly as pinned — that's the combat-resolution
  axis and must not grow. Add a separate cosmetic/cost `unitType: string` sub-classification for
  roster variety: roughly 6 infantry archetypes (e.g. Rifleman, SpecOps, Sniper, Heavy Gunner,
  Combat Medic, Officer) and 10 vehicle/ship/air archetypes (e.g. Main Battle Tank, APC, Self-
  Propelled Artillery, VTOL Gunship, Bomber Drone, Recon Drone, Destroyer, Frigate, Transport Ship,
  Railgun Cruiser) — each its own row in an extended `RTS_UNIT_TYPE_STATS` table (cost, health,
  damage, speed, munition type — see below) keyed by `unitType`, layered on top of (not replacing)
  the existing per-`unitClass` `RTS_UNIT_STATS`. Naval archetypes only spawn/move on sea-biome maps.
- **Munition + heat/thermal detection system.** Each `unitType` gets a `munition: 'BALLISTIC' |
  'RAILGUN' | 'PLASMA'` with an associated heat-per-shot value (low/medium/high respectively) and a
  passive cooling rate. `RTSUnit.heat` (already reserved in §2) accumulates on fire, decays over
  time; a unit above a detection threshold is auto-revealed regardless of fog-of-war/cover. This is
  the mechanism that makes United Dragon Nations' guerrilla playstyle (low-heat hit-and-run) feel
  distinct from Raven Alliance's sustained-fire doctrine — reflect that in `commanderAI` behavior
  for AI-controlled factions of each side, not just as a number nobody's AI reacts to.
- **Stealth + radar detection.** Add an `RTS_RADAR` building type (Radar Array): large detection
  radius, reveals any enemy unit inside it regardless of heat/cover, destructible (sabotaging it is
  the counterplay). Detection for a given unit is `heatExposed OR withinEnemyRadarRange OR
  withinEnemyProximityDetection(halved if the unit occupies a marked "cover" grid cell)` — "cover"
  cells come from the map's occupancy grid (§2), flagged at map-authoring time in Studio, not
  computed procedurally. Undetected enemy units render at reduced opacity to their own team and are
  not rendered at all to the opposing team (no client-side "map hack" — server/host never sends
  hidden-unit state to a client that shouldn't see it, consistent with §5's relay model).
- **Economy + roster caps.** `STARTING_CREDITS = 50000` (update the constant; document the change
  from the reference's original value in the package README), Sotolium-to-credit conversion stays
  configurable via the existing constant. Hard per-faction caps enforced in `productionSystem`:
  250 combined INFANTRY+ARMORED units, 50 AIR units. Production requests beyond the cap are
  rejected (same `AppError`-style rejection convention used elsewhere in this repo, surfaced to the
  HUD as "unit cap reached," not a silent no-op).
- **Difficulty presets for AI-controlled factions.** `Beginner | Intermediate | Pro`, applied to
  `commanderAI`: economy income multiplier (1x / 1.5x / 2x), aggression (attack-trigger thresholds
  and idle-to-attack transition speed), and — **Pro only** — the allied-nations behavior below.
  Selected at session/match creation (§5's session-create route gains a `difficulty` field for any
  AI-controlled faction).
- **Allied-nation coordinated strikes (Pro difficulty only).** Up to 3 additional AI-controlled
  factions allied with United Dragon Nations. An `AlliedCoordinator` system evaluates the human/
  primary faction's map-control progress each AI-think interval; crossing a threshold triggers a
  scripted "coordinated strike" command batch (each ally contributes a fixed-size strike force,
  routed to converge on the target) issued through the normal `applyCommand()` path like any other
  faction's commands — this keeps it inside the deterministic lockstep model from §5, not a
  side-channel. Surface it in the HUD (§7) as a clear warning, not a silent ambush.
- **Biome variants.** Urban / Jungle / Sea, chosen per map at authoring time in Studio (§6). Biome
  affects: Dragon team-color (Red for Urban/Sea, Green for Jungle — Raven stays Blue throughout),
  cover-cell density/placement, and whether naval `unitType`s are placeable at all. Full naval
  pathfinding (buoyancy, water-only navmesh) is genuinely more scope than this pass can responsibly
  verify alongside everything else — ship Sea maps with naval units using simple open-water
  steering (seek/separation only, no A* — water tiles are usually obstacle-free) and say so plainly
  in the audit as a scoped-down simplification, rather than quietly shipping a half-working
  navmesh.
- **Team-color/visual identity.** Raven Alliance renders Blue (`#0033FF`-ish) with a "high-tech
  glass HUD" treatment; United Dragon Nations renders Red (Urban/Sea) or Green (Jungle) with a
  "rugged/hacked" HUD treatment. Feed this into the entity tinting from §6 and the Player-app HUD
  theming from §7 — the 15 reference concept-art images (Raven base/Sotolium refinery, in-combat
  HUD with build queue + world-conflict minimap, campaign-select screen) are the visual target;
  match their mood (industrial, neon-accented, military-HUD) rather than their exact pixels.

None of this changes the §4 pinned exports' signatures — it extends `UnitStats`/`RTSUnit`/building
types and adds new constants/systems alongside them. Any agent building #10/#11 should treat §9 as
informative context for what the HUD/rendering layer will eventually need to display, but should
not block on #13 landing first; #12's integration pass reconciles the two.

## 8. Definition of done

- `packages/rts-sim`: builds, typechecks, and its test suite (including the determinism and
  full-match tests from §4) is green in isolation, including the §9 depth-extension additions
  (unit-type roster, heat/stealth, difficulty presets, allied-strike system) once task #13 lands.
- `packages/spatial-engine` and `packages/world-schema`: still fully green after the additions in
  §6 — this means re-running their existing test suites, not just the new RTS-specific tests, since
  extending a shared enum can silently break an exhaustiveness check elsewhere in either package.
- `services/api`: the new/extended session + relay wiring is green, with tests exercising at
  least: session creation returns a valid seed + faction assignment, an `RTS_COMMAND` publish from
  one connected client is relayed to another subscriber of the same session topic.
- `apps/player`: the new RTS mode renders, typechecks, and builds (Next.js production build,
  matching every other app in this repo) with at least a component-level test per major HUD piece.
- `apps/studio`: the entity-palette/faction additions typecheck and build.
- Full workspace `turbo run typecheck && turbo run build && turbo run test` from the repo root is
  100% green, forced/no-cache, exactly like the base platform's verification bar.
- An honest limitations section gets added to `docs/AUDIT.md` (append, don't rewrite) covering
  whatever from §5's desync/reconnect/anti-cheat corners got simplified for this pass, plus
  anything else discovered during the build — same standard of honesty as the rest of that
  document.
