# GameWorld Play

The player/UGC discovery app for Sonic GameWorld OS — "GameWorld Play". Next.js 15 (App Router),
React 19, Tailwind (via `@sonic-gameworld/ui`'s preset), Zustand, and `@sonic-gameworld/gameworld-sdk`.
Runs on **port 3002**.

## Running

```bash
pnpm --filter @sonic-gameworld/player dev     # http://localhost:3002
pnpm --filter @sonic-gameworld/player build
pnpm --filter @sonic-gameworld/player typecheck
pnpm --filter @sonic-gameworld/player test
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Base URL of `services/api`. |
| `NEXT_PUBLIC_STUDIO_URL` | `http://localhost:3000` | GameWorld Studio origin — "Remix this world" deep links. |
| `NEXT_PUBLIC_MARKETPLACE_URL` | `http://localhost:3001` | GameWorld Market origin — creator storefront deep links. |

Every discovery rail, the play page, and the leaderboard fetch independently and fall back to
offline demo content (`lib/demo/data.ts`, `withDemoFallback` in `lib/sdk.ts`) whenever
`services/api` is unreachable or a single endpoint is slow/erroring — no endpoint failure ever
blanks the whole page. The demo content is built on `createSampleWorld('NEON_TOKYO_2099')` from
`@sonic-gameworld/world-schema`, so the demo world, its missions, and its NPCs stay internally
consistent. A "Offline demo mode" badge appears whenever any section had to fall back.

## Pages

| Route | Purpose |
|---|---|
| `/` | Discovery home: Games, Worlds, Live Events, Missions, Creators, AI Characters, Communities rails |
| `/g/[id]` | Play page: embedded web runtime, session join, HUD, minimap, leaderboard tab, "Remix this world" |
| `/events` | Live events list with filter tabs (Live/Scheduled/Ended) and live countdowns |
| `/profile` | Player passport: progress & saves, achievements, purchases; dev-login sign-in |
| `/become-a-creator` | The UGC loop (Play → Discover → Remix → Create → Publish → Monetize → Grow) + CTA that upgrades the signed-in player to a creator via `PATCH /v1/creators/me` |

## The play page ("web runtime")

`app/g/[id]/PlayClient.tsx` loads the game + its `WorldDocument`, joins a session
(`POST /games/:id/sessions` → `POST /sessions/:id/join`), opens the realtime `session:<id>` topic,
and renders `components/play/PlayViewport.tsx` — dynamically imported with `next/dynamic({ ssr:
false })` since it drives WebGL.

`PlayViewport` is a **minimal player controller built directly on `@sonic-gameworld/spatial-engine`'s
public `SpatialEngine` class** (CONTRACTS §11), not a bespoke renderer:

1. Mounts a `SpatialEngine` onto a `<canvas>` ref and calls `loadWorld(doc)`.
2. `spawn()`s a player-avatar entity at the world's `PLAYER_SPAWN` location. (`EntityKind` has no
   dedicated `PLAYER` kind — `PLAYER_SPAWN`, rendered as a teal cone, is the closest fit and
   doubles as a legible marker; it gets its own id, so the world's actual spawn-point entity is
   left in place.)
3. `setCameraMode('THIRD_PERSON', { targetEntityId, params })` — the engine's own damped chase
   camera, not hand-rolled camera math.
4. Every animation frame: pure WASD input (`lib/engine/controller.ts`: `keyToAxis`,
   `movementVector`, `integrateMovement` — camera-relative movement, world-bounds clamping,
   turn-to-face) computes a new transform, which is applied with `engine.move(id, transform)`;
   then `engine.tick(dt)` steps the engine's own render/camera/environment/LOD loop.
5. On unmount, `engine.remove(id)` before `dispose()` — see "Cross-package notes" below for why
   that matters.

The live player position/heading is published (throttled to 12 Hz) into a tiny external store
(`lib/engine/playerRuntime.ts`, `useSyncExternalStore`) so the `Minimap` (Canvas 2D, top-down
projection — `lib/engine/projection.ts`, unit-tested in `projection.test.ts`) and the REACH-mission
proximity check in `PlayClient` can read it without forcing a 60fps React re-render.

The `Hud` shows health/XP (from the per-game session progress in `lib/store/playerStore.ts`) and
the active mission's objectives, checking off `REACH`-type objectives automatically when the
player walks within range of the target entity. (Other objective types — `KILL`/`COLLECT`/etc. —
aren't simulated by this MVP viewport; there's no combat/inventory system in this app.)

## Public API

This is an application, not a library — it has no package exports. Its internal modules worth
knowing about if you're extending it:

* `lib/sdk.ts` — `getGameWorldClient()`, `setStoredToken()`, `withDemoFallback()`, and the
  `NEXT_PUBLIC_*` origin constants.
* `lib/demo/data.ts` — every `getDemo*()` offline-fallback dataset, all derived from the one
  `createSampleWorld('NEON_TOKYO_2099')` document.
* `lib/engine/controller.ts` — pure, dependency-free player-movement math: `keyToAxis`,
  `movementVector`, `integrateMovement`, `thirdPersonCameraTarget`, `damp`.
* `lib/engine/projection.ts` — pure minimap projection math: `projectToMinimap`,
  `projectAndClampToMinimap`, `boundsFromWorldBounds`, `headingToMinimapAngle`.
* `lib/engine/playerRuntime.ts` — `createPlayerRuntime()`, the live-position external store.
* `lib/store/playerStore.ts` — `usePlayerStore` (Zustand, persisted): session, per-game progress,
  achievements.
* `components/play/PlayViewport.tsx` — the `SpatialEngine`-backed play viewport described above.

## Cross-package notes

* **`@sonic-gameworld/spatial-engine`'s React bindings aren't consumed here.** As of this build,
  `packages/spatial-engine`'s core (`SpatialEngine`, camera modes, entities, environment,
  detection, discovery) is fully implemented and builds cleanly
  (`pnpm --filter @sonic-gameworld/spatial-engine build` produces `dist/index.js`/`dist/index.d.ts`),
  but its `./react` subpath entry point — `src/react.ts`, which `tsup.config.ts` already declares
  as a build target (`SpatialViewport`, `useSpatialEngine`, `<HUD/>`, `<LayerPanel/>`,
  `<TrackingPanel/>` per CONTRACTS §11) — **does not exist yet as a source file**, so that build
  target fails (`Cannot find react: src/react.ts`) and there is no `dist/react.js` to resolve. This
  is a different, more fundamental gap than the `package.json` `exports` "import"+"default"
  condition issue apps/studio hit (and which a separate agent is fixing concurrently per this
  fleet's shared brief) — even with that fix applied, `@sonic-gameworld/spatial-engine/react`
  still has no built output to resolve to.
  GameWorld Play sidesteps this entirely: `PlayViewport` imports `SpatialEngine` from the package
  **root** (`@sonic-gameworld/spatial-engine`, which does build) and mounts it onto a `<canvas>`
  itself, per CONTRACTS §11's description of the core engine as "framework-agnostic" and usable
  standalone. `next build`/`tsc --noEmit` both pass cleanly against the root export today. If/when
  `src/react.ts` ships, adopting `<SpatialViewport>` there would mostly just delete the manual
  canvas-mount/RAF-loop code in `PlayViewport.tsx` — the `spawn`/`move`/`setCameraMode` player
  controller logic (`lib/engine/controller.ts`) is UI-framework-agnostic either way.
* **`SpatialEngine.loadWorld()` keeps the exact object/array references it's given** (no deep
  clone), so `engine.spawn()` mutates the same `WorldDocument.entities` array this app holds in
  React state. `PlayViewport` calls `engine.remove(playerEntity.id)` on unmount to undo that
  mutation — worth knowing if `spatial-engine` grows more mutating methods and other consumers
  don't expect their `WorldDocument` props to be touched in place.
* **`@sonic-gameworld/gameworld-sdk` re-exports `WorldDocument`/`WorldEntity`/`MissionDefinition`
  etc. from `@sonic-gameworld/world-schema`, but not every world-schema symbol** — e.g.
  `EntityKind`, `Transform`, `Quat`, or value exports like `randomUuid`/`quatIdentity`. This app
  (like `apps/studio`) imports those directly from `@sonic-gameworld/world-schema` rather than
  going through gameworld-sdk, since there's currently nothing to import there.
* **No API surface for "communities" or cross-game player achievements.** `docs/CONTRACTS.md` §9
  has nothing for the home page's Communities rail (`getDemoCommunities()` is presentation-only,
  permanently, not just an offline fallback), nor an endpoint to list a player's achievements or
  progress across games — only per-game saves (`GET/PUT /games/:id/saves/:playerId`). The Profile
  page's Progress/Achievements tabs are backed by `usePlayerStore`'s `localStorage`-persisted state
  until such endpoints exist.
