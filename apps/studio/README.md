# GameWorld Studio

The creator workspace for Sonic GameWorld OS — "the world is the editor." Next.js 15 (App Router),
React 19, Tailwind (via `@sonic-gameworld/ui`'s preset), Zustand, and `@sonic-gameworld/gameworld-sdk`.
Runs on **port 3000**.

## Running

```bash
pnpm --filter @sonic-gameworld/studio dev     # http://localhost:3000
pnpm --filter @sonic-gameworld/studio build
pnpm --filter @sonic-gameworld/studio typecheck
pnpm --filter @sonic-gameworld/studio test
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Base URL of `services/api`. |

Whenever the API is unreachable (dev login fails, health check fails, or a request throws),
Studio transparently falls back to a fully-featured **offline demo mode**:

* World data comes from `createSampleWorld('NEON_TOKYO_2099')` (`@sonic-gameworld/world-schema`),
  persisted to `localStorage` so new worlds created via the New World dialog, WorldForge, and Game
  Kits survive navigation and reloads.
* The AI Director command bar runs a deterministic local parser (`lib/localAi.ts`) that mirrors
  the server's `mock` AI provider — it understands weather, time of day, camera follow/track,
  spawning NPCs, cinematic shots, and "boss arena" conversions, and denies `publish_asset` the
  same way the real permission pipeline would.
* Mission/NPC "Generate with AI" buttons fall back to `lib/localGenerate.ts`.
* WorldForge falls back to `lib/localForge.ts`, which procedurally scatters buildings/roads/water
  around the given coordinates.
* An **"Offline demo"** badge appears in the editor's top HUD whenever this fallback is active.

## Pages

| Route | Purpose |
|---|---|
| `/` | Projects grid, "New World" dialog, AI prompt box ("Build me a 10km cyberpunk city…") |
| `/ai/generate?prompt=` | Generation progress screen, then redirects into the new world |
| `/forge` | WorldForge: lat/lon/radius + theme → generates and opens a world |
| `/kits` | Game Kits gallery (Extraction Shooter Starter, Battle Royale Arena, …) with one-click start |
| `/worlds/[id]` | **Flagship editor**: scene hierarchy, `SpatialViewport`, inspector, top HUD, AI Director bar |
| `/worlds/[id]/director` | Director Mode: World tracking table (players/NPCs/events) + camera/events/weather controls |
| `/worlds/[id]/missions` | Mission list + editor (objectives/triggers/rewards) + Generate with AI |
| `/worlds/[id]/npcs` | NPC cards + editor (personality/memory/knowledge/behavior/dialogue) + chat test panel |
| `/worlds/[id]/cinematics` | Camera rig list + shot-list timeline, "Play in viewport" |
| `/worlds/[id]/publish` | Publish wizard: category, genre, price, license builder, compatibility check, passport summary |

`⌘K` / `Ctrl+K` opens a global command palette (navigation, camera modes, undo/redo, and — inside
a world — free-text submission straight to the AI Director).

## State

`lib/store.ts` is a single Zustand store holding the active `WorldDocument`, selection, camera
mode, a dirty flag, and an undo/redo stack. Every mutation goes through `commitDocument`, which:

1. Computes a `WorldDiff` via `@sonic-gameworld/world-schema`'s `diffWorlds` (no-op edits are
   dropped so they don't pollute history).
2. Pushes the *previous* document + diff onto `past` (capped at 50 frames) and clears `future`.
3. Stamps the new document with `touchWorld` (updates `updatedAt` + `passport.modificationHistory`).

`undo`/`redo` swap between `past`/`future`; a fresh commit after an undo discards the redo branch,
matching standard editor semantics. See `lib/store.test.ts` for coverage (basic undo/redo,
branching after undo, add/remove with descendant cleanup, the 50-frame cap, and no-op suppression).

Realtime updates for `world:<id>` (`lib/realtime.ts`) merge into the same document via
`mergeRemotePatch` without touching the undo stack, since they represent externally-applied state
rather than local edits.

## Public API

This is an application, not a library — it has no package exports. Its internal modules worth
knowing about if you're extending it:

* `lib/store.ts` — `useStudioStore`, `StudioState`, `LogEntry`.
* `lib/client.ts` — `getClient()`, `ensureSession()`, `pingApi()`.
* `lib/useWorldSession.ts` — `useWorldSession(worldId)`: load → realtime → autosave lifecycle.
* `lib/useAiDirector.ts` — `useAiDirector({ worldId, mode })`: wires the AI Director bar to
  `client.ai.command` or the offline fallback, and registers ⌘K free-text submission.
* `components/editor/ViewportPane.tsx` — wraps `@sonic-gameworld/spatial-engine/react`'s
  `SpatialViewport` behind `next/dynamic({ ssr: false })`, per CONTRACTS §11.

## RTS map authoring (docs/RTS-CONTRACTS.md §6/§7)

The scene hierarchy's entity-palette dropdown (`components/editor/SceneTree.tsx`) already lists
`RTS_UNIT`/`RTS_BUILDING` for free — it iterates `ENTITY_KINDS` from `@sonic-gameworld/world-schema`,
so no palette-specific code was needed once those two kinds existed in the schema.

What *was* added is the faction-assignment UI: selecting an `RTS_UNIT`/`RTS_BUILDING` entity and
opening its Inspector's **Behavior** tab shows an "RTS placement" panel
(`components/editor/Inspector.tsx`'s `RTSFactionFields`) with a **Faction** picker (populated from
`@sonic-gameworld/rts-sim`'s `RTS_FACTIONS` — Raven Alliance / United Dragon Nations) and, depending
on kind, a **Unit class** (Infantry/Armored/Air) or **Building class** (Refinery/Barracks/Factory/
Airfield/Radar) picker.

**Field/schema choice** (documented here since RTS-CONTRACTS.md left it as a "your call"): rather
than adding a new dedicated `WorldEntity` field, this reuses the existing generic
`behavior.params: Record<string, unknown>` bag every other kind already stores scripted-behavior
config in — the same convention `NPCDefinition.behavior.faction` established on the NPC side, and
that `@sonic-gameworld/world-schema`'s `sceneGraphToSemantic` already reads (`behavior.params.faction`)
for AI-context narration. Concretely: `behavior.params.factionId` (matches an `RTS_FACTIONS[].id`,
but any string is valid — `FactionSetup.factionId` is intentionally open in `rts-sim`, so a future
third faction needs no schema change here either), plus `behavior.params.unitClass`/
`behavior.params.buildingClass`. No `WorldEntitySchema` change was needed. See
`lib/store.test.ts`'s "places RTS_UNIT/RTS_BUILDING entities and persists faction assignment" test.

**Known gap**: nothing here yet turns a placed `RTS_UNIT`/`RTS_BUILDING` `WorldEntity` into the
actual `RTSUnit`/`RTSBuilding` objects a `createMatch()`-started match begins with — per
`packages/rts-sim`'s README, `createMatch` always returns an empty world, and building the starting
scenario from Studio-authored placements is explicitly the 3D integration layer's job, not yet
built in this pass (`apps/player`'s match-bootstrap step, per §7). The `factionId`/`unitClass`/
`buildingClass` fields set here are exactly what that later step will need to read.

## Known cross-package gap (historical — resolved)

`@sonic-gameworld/spatial-engine` now builds a `react` entry point (`packages/spatial-engine/src/react`
→ `dist/react.js`), so `ViewportPane`'s dynamic import of `SpatialViewport` from
`@sonic-gameworld/spatial-engine/react` resolves correctly in both `next build` and `tsc`. It still
degrades to a static "viewport unavailable" message if the chunk fails to load at runtime for any
other reason (e.g. a WebGL-less environment), which is why that fallback path is kept.
