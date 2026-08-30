# @sonic-gameworld/spatial-engine

Framework-agnostic Three.js spatial engine for GameWorld documents (CONTRACTS §11), plus SSR-safe React
bindings and a marketplace "discovery globe" helper.

## What's in here

- **Core (`.`, `dist/index.js`)** — `SpatialEngine`: scene/renderer management, instanced entity
  rendering colored by `EntityKind`, GLB loading (`GLTFLoader`) when an entity has `assetRef` +
  `cdnBaseUrl`, LOD billboards, layer visibility, raycast selection, entity tracking, all 10 `CameraMode`s
  with damped per-mode `update()` handlers, environment (sky by `timeOfDay`, fog, weather particles for
  RAIN/STORM/SNOW/SANDSTORM), detection-ring/sensor-cone overlays, cinematic keyframe playback, HUD
  state, JSON+PNG snapshots, and a typed event emitter. No React import anywhere in this half — safe to
  use from a plain `<canvas>`, a test runner, or a non-React framework.
- **RTS integration (docs/RTS-CONTRACTS.md §6)** — the `RTS` strategic camera mode, `RTS_UNIT`/
  `RTS_BUILDING` entity-kind rendering, `SpatialEngine.possessEntity`/`releasePossession`, and the
  `syncRTSEntities()` adapter that mirrors an `@sonic-gameworld/rts-sim` match onto this engine. See
  "RTS integration" below.
- **React bindings (`./react`, `dist/react.js`)** — `SpatialViewport`, `useSpatialEngine`, `HUD`,
  `LayerPanel`, `TrackingPanel`, `CameraModeBar`, `WorldControlBar`, `DiscoveryGlobe`. `'use client'`
  banner on the whole bundle; every component only touches `window`/WebGL inside effects, so it's safe
  to `next/dynamic(() => import('@sonic-gameworld/spatial-engine/react'), { ssr: false })`.
- **Spatial discovery** — `buildDiscoveryGraph(products)` lays marketplace products out on a sphere (one
  latitude band per `ProductCategory`, ring-edges within a band) for the GameWorld Market globe;
  `DiscoveryGlobeRenderer` (core) / `<DiscoveryGlobe>` (React) render it with drag-to-rotate + hover/click.

## Install / build

This is a workspace package — consumed via `"@sonic-gameworld/spatial-engine": "workspace:*"`.

```bash
pnpm --filter @sonic-gameworld/spatial-engine build      # tsup -> dist/{index,react}.{js,d.ts}
pnpm --filter @sonic-gameworld/spatial-engine typecheck   # tsc --noEmit
pnpm --filter @sonic-gameworld/spatial-engine test        # vitest (jsdom)
```

No environment variables. `three`, `react`, and `react-dom` are peer/external — the consuming app
supplies its own versions (tsup marks them `external`, so they're never bundled here).
`@sonic-gameworld/rts-sim` is a **type-only** workspace dependency (every import of it in this
package is `import type { ... }`) — its actual runtime code is never pulled into this package's
bundle, keeping the "zero rendering/networking deps" boundary intact on rts-sim's side (docs/RTS-CONTRACTS.md
§1) without this package having to hand-duplicate its types.

## Core usage

```ts
import { SpatialEngine } from '@sonic-gameworld/spatial-engine';
import { createSampleWorld } from '@sonic-gameworld/world-schema';

const engine = new SpatialEngine({ canvas, width: 1280, height: 720, cdnBaseUrl: 'https://cdn.example.com' });
engine.loadWorld(createSampleWorld('NEON_TOKYO_2099'));
engine.setCameraMode('DRONE');
engine.on('select', ({ ids }) => console.log('selected', ids));
engine.start(); // internal requestAnimationFrame loop; call engine.tick(dt) manually instead for SSR/tests
```

Construct with no `canvas` (or in a DOM-less/jsdom environment) and the engine falls back to a
`NullRenderer` automatically — all scene graph, camera, layer, and selection logic still runs; only
pixels are skipped. That's what this package's own tests rely on instead of mocking `WebGLRenderer`.

## React usage

```tsx
'use client';
import dynamic from 'next/dynamic';
import { createSampleWorld } from '@sonic-gameworld/world-schema';

const SpatialViewport = dynamic(
  () => import('@sonic-gameworld/spatial-engine/react').then((m) => m.SpatialViewport),
  { ssr: false },
);

export function Editor() {
  const world = createSampleWorld('NEON_TOKYO_2099');
  return (
    <SpatialViewport
      world={world}
      selection={[]}
      cameraMode="ORBIT"
      onSelect={(ids) => console.log(ids)}
      onEntityChange={(id, patch) => console.log(id, patch)}
      className="h-full w-full"
    />
  );
}
```

Overlay panels share the viewport's engine via context when nested inside it:

```tsx
<SpatialViewport world={world} onSelect={setSelection} onEntityChange={applyPatch}>
  <div style={{ position: 'absolute', top: 12, left: 12, pointerEvents: 'auto' }}>
    <HUD />
    <CameraModeBar />
  </div>
  <div style={{ position: 'absolute', top: 12, right: 12, pointerEvents: 'auto' }}>
    <LayerPanel />
    <TrackingPanel />
  </div>
  <div style={{ position: 'absolute', bottom: 12, left: 12, pointerEvents: 'auto' }}>
    <WorldControlBar />
  </div>
</SpatialViewport>
```

Every panel also accepts an explicit `engine` prop for standalone use outside a `<SpatialViewport>`
(pair it with `useSpatialEngine()` directly).

`useSpatialEngine(options)` creates one `SpatialEngine` on mount, starts its render loop, keeps it sized
to a `ResizeObserver`'d container, and disposes it on unmount. Constructor-only options (`cdnBaseUrl`,
`background`, `antialias`, `pixelRatio`, `resolveAssetUrl`, `onError`) are read once at mount — remount
(e.g. a `key` prop) to change them; everything else (`world`, camera mode, layers, environment,
selection, tracking) is mutable for the engine's whole lifetime.

## Public API (core)

`SpatialEngine`: `loadWorld(doc)`, `getEntity(id)`, `getLayers()`, `spawn(entity)`, `move(id, transform)`,
`remove(id)`, `select(ids)`, `getSelection()`, `track(id)`, `getTracked()`, `setCameraMode(mode, opts?)`,
`getCameraMode()`, `frame(ids)`, `setLayerVisible(id, visible)`, `isLayerVisible(id)`,
`setEnvironment(env)`, `getEnvironment()`, `raycast(ndc)`, `hoverAt(ndc)`, `selectAt(ndc)`,
`playCinematic(seq)`, `stopCinematic()`, `getHUDState()`, `recordSnapshot()`, `on(event, fn)`,
`resize(w, h)`, `tick(dt?)`, `start()`, `stop()`, `dispose()`.

Also exported: `CameraController`, the 10 `*Mode` classes (`OrbitMode`, `FollowMode`, `ChaseMode`,
`DroneMode`, `FirstPersonMode`, `ThirdPersonMode`, `RailMode`, `CraneMode`, `AIDirectorMode`, `RTSMode`),
`EntityRegistry`, `DetectionOverlay`, `EnvironmentController` / `skyForTimeOfDay`, `CinematicPlayer`,
`interpolateKeyframes`, `localPointToGeo`, `loadGLTF`, `createRenderer` / `NullRenderer`, `damp` /
`dampVec3` / `dampingToLambda`, `TinyEmitter`, `ENTITY_KIND_COLORS` / `ENTITY_KIND_RADIUS` /
`RENDERABLE_KINDS`, the RTS integration exports below, and the discovery helpers below.

## RTS integration (docs/RTS-CONTRACTS.md §6)

Everything the "Global Dominance" RTS game template needs from this package, on top of the
pre-existing 9 camera modes and entity-rendering pipeline:

- **`RTS` camera mode** (`camera/modes/rts.ts`, `RTSMode`) — fixed-pitch overhead strategic camera.
  No orbit, no roll: the camera always looks the same direction (north), only its free-floating
  ground **anchor** (pan) and **distance** (zoom) change. Drive it via
  `engine.cameraController.getModeHandler<RTSMode>('RTS')`:
  - `pan(dxM, dzM)` — edge-pan / click-drag input, in world meters.
  - `jumpTo(x, z)` — minimap click-to-jump.
  - `zoom(deltaM, ctx)` — scroll-wheel input, clamped to `params.minDistanceM`/`maxDistanceM`
    (defaults 40/420; `params.pitchDeg` controls the fixed elevation angle, default 58°).
  - `getAnchor()` / `getDistance()` — read current state back, e.g. for a minimap
    viewport-rectangle overlay.
  `reset()` seeds the anchor from `ctx.targetPosition` when a target entity is supplied (e.g.
  framing a starting base on session start); otherwise the anchor starts at the world origin.
- **Possession** — `SpatialEngine.possessEntity(entityId, mode?, params?)` switches the camera to
  `FIRST_PERSON` (default) or `THIRD_PERSON` on a unit, remembering whatever camera mode/target/
  params were active first (a second `possessEntity` call while already possessing does not
  overwrite that saved snapshot — only which unit/mode is currently active changes).
  `releasePossession()` restores it — wire this to the documented "return to overview" keybind
  (Escape, per §7). `isPossessing()` reports current state. This is a thin convenience wrapper
  around the pre-existing, already-working `setCameraMode`/`track` runtime — it does not
  reimplement `FIRST_PERSON`/`THIRD_PERSON`.
- **`RTS_UNIT` / `RTS_BUILDING` entity kinds** — rendered as instanced primitives like every other
  kind: a capsule for units (`ENTITY_KIND_RADIUS.RTS_UNIT`), a box for buildings
  (`ENTITY_KIND_RADIUS.RTS_BUILDING`), each on its own layer (`RTS_UNITS`/`RTS_BUILDINGS` in
  `@sonic-gameworld/world-schema`'s `LayerKind`) so a creator can toggle their visibility
  independently of the generic VEHICLES/BUILDINGS layers. One shared geometry per kind (dozens of
  units on screen stay cheap) — per-`unitClass`/`sizeCells` size variety comes from `transform.scale`
  on each instance (see `syncRTSEntities` below), not a separate mesh per archetype. **Known gap**:
  this does not yet distinguish `unitType` (the §9 depth-extension roster — Rifleman vs. Sniper vs.
  Main Battle Tank, etc.) visually at all; a later integration pass wanting per-archetype geometry
  will need a bigger change than a scale tweak (e.g. sub-bucketing `RTS_UNIT` by `unitType`).
- **`syncRTSEntities(state, registry, opts?)`** (`src/rts/syncEntities.ts`) — the frame-by-frame
  adapter from an `@sonic-gameworld/rts-sim` `RTSMatchState` onto an `EntityRegistry`. Stateless: it
  diffs `state.entities.{units,buildings}` against whichever synced ids (recognized by the
  `rts-unit:`/`rts-building:` `WorldEntity.id` prefixes) currently exist in `registry`, and
  spawns/moves/removes accordingly via `EntityRegistry`'s existing methods — never bypasses them,
  and never touches an author-placed `WorldEntity`. Position/rotation only, per §6 ("health/
  isSelected/factionId etc. render as HUD overlays/tinting, not `WorldEntity` fields"). Also
  exported: `rtsUnitEntityId`/`rtsBuildingEntityId`/`parseRTSEntityId` (id prefix helpers — e.g. to
  recover the raw `RTSUnit`/`RTSBuilding` id from a `SpatialEngine.raycast()` hit for click-to-select)
  and `quaternionFromRotationY`. `SpatialEngine.syncRTSEntities(state, opts?)` is a thin method
  wrapper for callers that don't have direct access to the private `EntityRegistry`.
  - **Terrain height**: `rts-sim` deliberately never touches terrain (see its README) — ground units
    simulate at `y=0`, `AIR` units at a fixed flight altitude. Pass `opts.sampleTerrainHeight(x, z)`
    to render them on real terrain; the unit's simulated `y` (0 or the flight altitude) is added on
    top unchanged, so an `AIR` unit renders at "terrain height + flight altitude". Defaults to flat
    ground (`() => 0`) when omitted.
  - **Known gap**: no LOD/culling tuning specific to RTS's "dozens of units on screen" case yet —
    it rides the same `applyLOD`/billboard distance threshold every other entity kind uses
    (`SpatialEngine`'s `lodDistanceM`, default 140m), which was tuned for a walking/driving-scale
    player camera, not a zoomed-out strategic view. Likely fine at typical RTS zoom levels but
    worth revisiting once real unit counts are load-tested.

## Public API (`./react`)

`SpatialViewport`, `useSpatialEngine`, `SpatialEngineContext` / `useSpatialEngineContext`, `HUD`,
`LayerPanel`, `TrackingPanel`, `CameraModeBar`, `WorldControlBar`, `DiscoveryGlobe`, `TOKENS` (the
command-center color/font tokens from CONTRACTS §12, used by every overlay component's inline styles).

## Public API (discovery)

`buildDiscoveryGraph(products, opts?)`, `DiscoveryGlobeRenderer` (core renderer), `DiscoveryGlobe`
(React). `DiscoveryProduct` is a minimal structural shape (`id`, `name`, `category`, `genre?`,
`thumbnailUrl?`, `rating?`, `sales?`, `priceCents?`) deliberately *not* imported from
`@sonic-gameworld/gameworld-sdk` — that package's `Product` / `ProductSummary` types satisfy it
structurally, so callers can pass them straight through with no adapter, and this rendering package
never has to depend on the SDK.

## Known limitations (v1)

- `<SpatialViewport>` calls `SpatialEngine.loadWorld()` on every `world` prop identity change (a full
  re-ingest), not an incremental diff — fine for typical edit cadences, but a large world edited on every
  keystroke would want a smarter diff in front of it.
- Camera modes read only `CameraRig.params`' documented fields plus a few implementation-specific extras
  (`rotateSpeed`, `sweepSpeed`, `eyeHeightM`, `shoulderOffsetM`, `riseDurationS`, `orbitSpeed`,
  `pitchDeg`/`minDistanceM`/`maxDistanceM` for `RTS`) that aren't part of the zod schema — they're
  optional tuning knobs with sane defaults, never required.
- GLB loading has no retry/backoff; a failed load falls back to the entity's instanced primitive so the
  world is never left with an invisible gap, and `onError` is invoked for host-app logging.
