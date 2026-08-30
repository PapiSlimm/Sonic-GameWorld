# Build Audit — Sonic GameWorld OS

Honest record of what was built, what was verified, what was found and fixed along the way, and
what remains a known limitation. Written at the end of the build, after a full workspace-wide
verification pass. If you only read one section, read "Known limitations" before you deploy
anything.

## What this is

A complete, from-scratch implementation of the Sonic GameWorld OS monorepo described in
`docs/SPEC.pdf` (the original product spec) and `docs/CONTRACTS.md` (the binding technical
contract every package was built against): a spatial game-creation platform, a marketplace, an AI
orchestrator with 20 typed tools across 10 agent roles, and the cloud services underneath —
implemented as a pnpm/Turborepo monorepo, TypeScript 5.9 strict mode throughout.

24 workspace packages: 6 Next.js 15 frontends (`apps/studio`, `apps/marketplace`, `apps/player`,
`apps/creator`, `apps/admin`, `apps/developer-portal`), 1 Fastify 5 API service (`services/api`,
23 domain modules), 6 BullMQ worker packages (`workers/asset-processing`, `workers/thumbnails`,
`workers/ai-generation`, `workers/builds`, `workers/moderation`, `workers/analytics`), and 10
shared packages (`world-schema`, `events`, `ui`, `spatial-engine`, and six thin client SDKs).
Plus engine integration stubs (Unity, Unreal), infra (Docker Compose, Terraform, Render, GitHub
Actions CI/CD), and a 611-line Prisma seed script.

## Final verification status

Run from the repo root via Turborepo, forced (no cache), immediately before delivery:

| Check | Result |
|---|---|
| `pnpm install` | Clean, lockfile up to date |
| `turbo run typecheck` | **33/33 tasks passing** |
| `turbo run build` | **23/23 tasks passing** |
| `turbo run test` | **33/33 tasks passing, ~440 tests, 0 failures** |

`services/api` alone: 21 test files, 155 tests, all green. Every worker package, every frontend
app, and every shared package has its own real (not placeholder) test suite and passes in
isolation and under full concurrent workspace load.

## How it was built

Built by a fleet of parallel agents against a single binding contract (`docs/CONTRACTS.md`, ~300
lines covering positioning, the full REST route table, the Prisma data model, the world-schema
spec, the AI tool/agent taxonomy, the licensing/compatibility engine, plan tiers and marketplace
economics, and a page-by-page frontend spec), so that work done in parallel would actually fit
together. After the parallel build phase, an integration pass went through every package's
self-reported cross-package issues and fixed them directly. That integration work is the bulk of
what's documented below.

## Issues found and fixed during integration

**`@sonic-gameworld/ui` broke Server Components.** The package built as a single bundle with a
blanket `'use client'` banner, so any Next.js Server Component importing a pure helper (`cn`,
`formatCents`) from it broke. Fixed at the source: `packages/ui/tsup.config.ts` now builds two
entry points — components (with the banner) and a server-safe `./utils` + `./tailwind-preset`
subpath (without it) — rather than leaving every consuming app to route around it locally.

**Five analytics Prisma models were missing.** `workers/analytics` was built against a documented
`PrismaLike` interface (`PlayerMetric`, `GameMetric`, `AssetMetric`, `CreatorMetric`,
`MarketplaceMetric`) that didn't exist yet in `services/api/prisma/schema.prisma`, by design —
the worker's own README flagged the gap and specified the exact model shapes to close it. Added
all five to the schema.

**Env var naming mismatch between services/api and the workers/root `.env.example`.** The API
service's `config.ts` only recognized the AWS-style `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/
`S3_PUBLIC_URL_BASE` and full Firebase service-account JSON, while every worker package and the
root `.env.example` use the shorter `S3_ACCESS_KEY`/`S3_SECRET_KEY`/`CDN_BASE_URL` and a
`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` triple. Both conventions are now accepted in
`services/api/src/config.ts` (whichever is set wins) and wired into the Firebase Admin credential
resolution in `src/plugins/auth.ts`.

**No code actually enqueued any background job.** This was the largest gap: all six BullMQ worker
packages were fully built and independently tested, but nothing in `services/api` ever produced a
job onto any of their queues — each worker's own README documented exactly what should trigger it
and what payload to send, flagged as "not yet wired." This integration pass wired all five
producer queues:

- `asset.process` — `POST /assets` and `POST /assets/:id/versions` in a newly-built `assets`
  module (see below).
- `ai.generate` — the `generate_asset` AI tool only (the other 19 tools are synchronous and
  unaffected), returning immediately with an asset id pollable via the pre-existing
  `GET /ai/executions/:id`.
- `build.compile` — `POST /games/:id/publish`.
- `moderation.scan` — Product/Review create in the `products` module, `POST /moderation/report`,
  and `POST /moderation/:id/resolve` (which re-enqueues to resume the paused pipeline past
  `HUMAN_REVIEW`), plus `POST /assets/:id/publish`.
- `analytics.rollup` — an hourly BullMQ repeatable job registered on API boot (guarded off in
  tests), since this queue has no natural HTTP trigger.

The producer surface lives in the new `services/api/src/queues.ts` (decorates `app.queues`;
payload shapes are hand-mirrored from each worker's `src/types.ts` — see that file's header
comment for why they aren't imported directly). Every worker README's "not yet wired" section was
rewritten to point at the actual call site.

**The `/assets/*` routes didn't exist at all.** `docs/CONTRACTS.md` §9 specifies eight asset
endpoints (`POST /assets/upload-url`, `POST /assets`, `GET /assets`, `GET /assets/:id`,
`GET /assets/:id/passport`, `POST /assets/:id/versions`, `POST /assets/:id/publish`,
`GET /assets/:id/variants`), and the underlying Prisma models (`Asset`, `AssetVersion`,
`AssetVariantFile`, `AssetPassport`) already existed, but no parallel-build agent had been
assigned the module itself. Built it from scratch in `services/api/src/modules/assets/` following
the same conventions (zod validation, `AppError`, quota checks, ownership rules) as the
`products` module it's closest to, with its own test suite (9 tests).

**A real, reproducible test flake, traced to its root cause and fixed.** The new assets module's
tests passed reliably in isolation but failed intermittently (`500` instead of `200` on
`POST /assets/upload-url`) whenever the full workspace test suite ran under Turborepo. The cause:
`services/api`'s `POST /assets/upload-url` handler calls the AWS SDK's `getSignedUrl`, and with no
static S3 credentials configured (the default in dev/test), the SDK falls back to its async
default credential provider chain (environment, shared config, IMDS, SSO) before presigning — a
real network-touching code path that no test in this codebase had ever exercised before, because
no earlier module's tests happened to call `app.storage`. Fixed properly rather than papered
over: added a `getStorage()`/`setStorageForTests()` singleton-with-override pair to
`services/api/src/storage.ts` (mirroring the existing `getPrisma`/`setPrismaForTests` and
`getBus`/`setBusForTests` pattern), a deterministic in-memory `FakeStorage` test double
(`src/test/fakeStorage.ts`), and wired it into the shared `buildTestApp()` test harness
(`src/test/helpers.ts`) so every test — not just the new ones — now gets a fake storage layer with
zero real network I/O. Verified by forcing the full workspace test suite (`turbo run test
--force`, no cache) three times in a row with zero failures after the fix, having reproduced the
failure consistently before it.

Several other cross-package bugs were found and fixed by the build agents themselves within their
own scope during the parallel build phase (a missing `LeaderboardEntry.achievedAt` default, an
invalid moderation ref-kind enum value, a `ToolDefinition.execute` return-type mismatch, React
19's stricter `useRef` typing breaking `apps/creator`, a `.js`-extension import convention
breaking `apps/admin`'s Next.js build, `apps/player` mutating a shared entity array on unmount) —
each is described in more detail in that package's own commit history/comments; they're not
re-litigated here since they never reached this integration pass as open issues.

## Known limitations — read this before deploying

**`prisma generate` was never run for real in this environment, by necessity, and you must run it
once.** The sandbox this repo was built in has network egress restricted to a small allowlist
(npm, PyPI, crates.io, a few others) that does not include `binaries.prisma.sh`, which
`prisma generate` needs to download its query-engine binary. `services/api/prisma/schema.prisma`
itself is completely standard — plain `provider = "prisma-client-js"`, no preview features, no
workarounds baked into the schema — so this is purely an artifact of the build environment, not
the deliverable. To get a real, working `@prisma/client`:

```bash
pnpm install
pnpm db:generate   # runs `prisma generate` in services/api — needs normal internet access
```

Everywhere `pnpm typecheck` / `pnpm build` / `pnpm test` were run in the build environment, they
ran against a hand-written, sandbox-only fake `@prisma/client` type shim (a script, not part of
this repo, that regenerates a structurally-typed-but-throws-at-runtime client from the schema) —
sufficient to verify every model name, field, and relation used across the codebase actually
exists in the schema and typechecks correctly, but it cannot execute real queries. Run
`pnpm db:generate` once on a machine with normal internet access (your own machine, CI, or Render)
before running the API or any worker for real, and again after any future `schema.prisma` change.

**Asset thumbnail rendering is a real, working renderer — but a 2D card, not a 3D scene capture.**
`workers/thumbnails` uses `sharp` to compose an actual marketplace-grid PNG (name, category, poly
count) rather than a stub — this is genuinely in production use in the worker's own tests — but it
does not render an actual 3D preview of the model. A true 3D thumbnail (headless GPU rendering of
the GLB) is out of scope for what was built here.

**LOD generation is real but CPU-side.** `workers/asset-processing`'s `LOD_GENERATION` pipeline
stage uses `meshoptimizer` to produce real, validated lower-detail mesh variants — this is not
mocked — but it produces in-memory glTF `Document`s during the pipeline run; persisting each LOD
level as its own `AssetVariantFile` upload is not wired up.

**Malware scanning has no external AV engine or network egress.** `workers/asset-processing`'s
`MALWARE_SCAN` stage does real work — magic-byte signature detection, file-extension/content
cross-checks, and ZIP Central-Directory expansion-ratio analysis to catch zip bombs without
inflating them — but it cannot call out to a cloud AV service, by design (workers should not need
outbound network access to third parties for this).

**Payment and identity providers are real integrations, but need your own credentials.** Stripe
(`integrations/stripe`) and Firebase Auth (`services/api/src/plugins/auth.ts`) are wired against
the real SDKs, not mocked, but every route that touches them requires you to supply real API
keys/service-account credentials via `.env` — none are baked in, and nothing was tested against a
live Stripe/Firebase account in this environment (that would also require outbound network
access this sandbox doesn't have).

**Unity and Unreal integrations are SDK/plugin scaffolding, not full engine builds.** They provide
the client-side contract (asset import format, API client, auth flow) an engine-side developer
would build against, per CONTRACTS.md's engine-target spec — they are not full playable Unity/UE
projects.

**Docker Compose, Terraform, and CI/CD are provided but unexercised end-to-end in this
environment.** `docker-compose.yml`, `infrastructure/terraform/*`, and
`.github/workflows/{ci,deploy}.yml` are complete and internally consistent with the rest of the
repo, but no container was actually started, no Terraform plan applied, and no GitHub Actions run
executed here (no Docker daemon / cloud credentials / real CI runner available in this sandbox).
Review them before first use the way you would any infra-as-code you didn't personally run once.

## RTS play mode (Global Dominance) — known limitations (task #11)

`services/api`'s lockstep relay (docs/RTS-CONTRACTS.md §5) and `apps/player`'s RTS play mode (§7)
are real, working code — a full session-create/join/ready lobby flow, a `session:<id>`-scoped
websocket command relay, and a real `RTSMatchState`-driven 3D battlefield with minimap, drag/click
selection, move/attack-move feedback, a production panel, and camera possession — not a stub or a
mock. The following are deliberate scope decisions and genuine gaps, not hidden bugs:

**Desync detection has no reconciliation.** Every peer periodically publishes `stateHash()`
(`RTS_STATE_HASH`, every 25 ticks) and flags `desynced: true` on a mismatch (`lib/rts/store.ts`'s
`receiveRemoteStateHash`) — the HUD shows a warning banner — but nothing attempts to resync a
diverged client. Per §5 this is explicitly detection-only for v1; recovering would need either a
full snapshot re-hydration (already implemented as `applySnapshot`, but not auto-triggered on
desync) or a rollback/replay scheme neither package attempts here.

**Reconnect/late-join is "wait for the next periodic snapshot", not a request/response.** The host
publishes a full `serializeMatch()` snapshot (`RTS_SNAPSHOT`) every 30 ticks over the same relay,
and any client applies whichever one arrives next (`applySnapshot`). A client that joins the
websocket topic right after a snapshot just fired waits up to ~3s for the next one rather than
being able to ask for one on demand — §5 picks this over full command replay from tick 0 as the
simpler v1 choice; an explicit "give me a snapshot now" request/response was not built.

**No hard lockstep barrier — late commands are rescheduled, not dropped or stalled.**
`lib/rts/lockstep.ts`'s `scheduleCommand` clamps a command's target tick forward to
`max(tick, notBeforeTick)` if it arrives after its originally-intended tick has already passed,
rather than pausing the simulation for stragglers (a real barrier) or discarding the input. This
keeps the local simulation always moving forward, at the cost of a real (if narrow, and bounded by
the 4-tick input-delay buffer) desync risk under bad network conditions — exactly the case the
`stateHash()` detection above exists to surface, not prevent.

**No anti-cheat / command validation beyond session membership.** `services/api`'s relay checks
only that the publishing user is an active player of that session (`GameSessionPlayer`) — it does
not validate that a command's `unitIds` belong to the sender's faction, that a `BUILD` target is
one of the sender's own buildings, etc. Per §5/§8 this is explicitly out of scope for this pass;
a malicious client can currently issue commands on another faction's units.

**The minimap's camera-viewport rectangle is an approximation.** `RtsMinimap.tsx` draws a square
scaled by `distanceM * 0.6` centered on the camera anchor. The RTS camera mode
(`packages/spatial-engine`) has a fixed pitch, so its true on-ground footprint is a trapezoid, not
a square — computing that exactly (a ground-plane intersection of the four view-frustum corners)
was judged not worth the complexity for a minimap indicator at this stage.

**Starting scenarios are a hardcoded default, not Studio-authored.** `rts-sim`'s `createMatch()`
always returns an empty world by design (README: placement is "the integration layer's job").
Studio's RTS entity-placement authoring flow (§6) is out of this task's scope, so
`apps/player/lib/rts/scenario.ts` seeds a simple, symmetric, deterministic default (one base per
faction in opposite map corners, a small starting force, a few neutral resource nodes) every peer
computes identically from the match seed. A creator cannot yet author a custom RTS map layout.

**§9's depth-extension fields (heat, `unitType`, biome, difficulty presets, allied AI) are not yet
surfaced in the HUD.** `rts-sim` gained these additively while this task was in progress (safe to
ignore per the pinned-API contract, and they were ignored deliberately rather than chased). The
production panel only ever builds the plain `UnitClass` (Infantry/Armored/Air), not a specific
`unitType` archetype; there is no heat/cooldown or stealth/detection readout in the HUD; and the
lobby's difficulty selector always defaults every AI faction to `'Intermediate'` (no per-faction
difficulty picker, no allied-faction picker for Pro difficulty). `docs/RTS-CONTRACTS.md` frames
reconciling shared-surface HUD additions like this as the final integration pass's (#12) job, and
every touched file that has a natural extension point for one of these fields says so in a comment
(e.g. `RtsProductionPanel.tsx`, `rtsTheme.ts`'s biome-driven team-color note).

**Possession is store-driven, and third-person only.** The "possess" button sets
`useRtsStore`'s `possessedUnitId`; `RtsViewport`'s render loop is the sole place that diffs that
against the engine's actual possession state and calls `SpatialEngine.possessEntity()` /
`releasePossession()` (chosen over an imperative ref so every RTS component stays reachable
through `next/dynamic(..., { ssr: false })` without ref-forwarding). It always requests
`THIRD_PERSON` — there is no in-HUD way to switch a possessed unit to `FIRST_PERSON`, though
`SpatialEngine.possessEntity()` supports it. While a unit is possessed, match simulation
(`useRtsStore.advance()`) is paused rather than continuing in the background, so possessing a unit
mid-battle freezes the rest of the battlefield until the player hits Escape to return to the RTS
overview camera — a deliberate simplification (avoids reasoning about outgoing commands and camera
math at the same time) rather than the reference behavior of possession running alongside a live
simulation.

**Lobby faction/ready updates are polled, not pushed.** Only `RTS_MATCH_START` is a realtime
broadcast (per §5's explicit list of relay message types); another player joining a faction or
readying up is picked up via `RtsPlayClient` polling `GET /sessions/:id/rts` every 2 seconds while
in the lobby, not a push event. Acceptable latency for a pre-match lobby screen, but worth knowing
if you're looking for a "some player just joined" websocket event that does not exist.

**RTS play requires an online API connection — there is no offline/demo fallback.** Unlike
`PlayClient.tsx`'s FREE_ROAM mode (`withDemoFallback`), a lockstep match has no meaning without a
live seed authority and command relay, so `RtsPlayClient.tsx` shows an explicit "couldn't reach
GameWorld" state instead of falling back to a local-only demo when `services/api` is unreachable.

**`apps/player` had no React-component test convention before this task, and needed a small
vitest fix to get one.** All of this app's existing tests were pure-logic `.ts` files; the new RTS
HUD component tests are `.tsx` files rendered with `react-dom/server`'s `renderToStaticMarkup`
(the same pattern `packages/ui/src/ui.test.tsx` already used) and assertions against the resulting
HTML string, rather than `@testing-library/react` interaction tests — no new test dependency was
added to this app. This surfaced (and required fixing) a real, pre-existing gap: this app's
`tsconfig.json` sets `"jsx": "preserve"` (correct for Next.js's own SWC-based build), but Vitest's
default esbuild transform reads that same tsconfig and, finding `"preserve"`, leaves JSX
untransformed — `.tsx` tests threw `ReferenceError: React is not defined` at run time. Fixed by
adding `apps/player/vitest.config.ts`, scoped to the test runner only (`esbuild: { jsx:
'automatic' }`), which does not touch Next's own build. Because these are static-markup
assertions, they cannot exercise interactive behavior (click handlers, canvas drawing inside
`useEffect`, keyboard input) — they verify each component's conditional rendering logic (empty
states, disabled states, desync/game-over banners, health-bar math, marker fade timing), not full
user interaction flows. `RtsViewport.tsx` (the 3D canvas / input-handling component) has no
component-level test for this reason — it is exercised indirectly through the pure-logic tests for
`lib/rts/selection.ts`, `lib/rts/commands.ts`, and `lib/rts/lockstep.ts` that back its input
handling instead.

## What to do first on your own machine

```bash
pnpm install
pnpm db:generate                 # real prisma generate — needs normal internet access
cp .env.example .env             # then fill in real secrets (JWT, S3, Stripe, Firebase, AI keys)
docker compose --profile full up -d   # postgres, redis, opensearch, minio
pnpm db:migrate                  # applies services/api/prisma/migrations/0001_init
pnpm db:seed                     # optional: seed sample data (services/api/prisma/seed.ts)
pnpm dev                         # starts every app/service via turbo
```

Then re-run `pnpm typecheck && pnpm build && pnpm test` once more on your machine as a final
sanity check — it should be identical to the results in this document, now against a real
generated Prisma client instead of the sandbox shim.

## RTS integration — "Global Dominance" (added after the base platform build)

A second build pass added a full 3D real-time-strategy game template — "Global Dominance," Raven
Alliance vs. United Dragon Nations — on top of the base platform above, per the binding spec at
`docs/RTS-CONTRACTS.md`. Built from an uploaded 2D reference prototype (preserved at
`docs/reference/global-dominance/`, reference-only, not part of the deliverable) plus supplemental
design material (lore, unit roster, economy numbers, heat/stealth mechanics) supplied mid-build.
Same process as the base build: parallel agents against one binding contract, then this integration
pass, then full workspace re-verification.

**New/changed packages**: `packages/rts-sim` (new — deterministic, renderer-free 3D RTS simulation
core: movement/pathfinding/steering/combat/production/fog-of-war/victory systems, commander AI, and
the §9 depth extensions below), `packages/spatial-engine` (new `RTS` camera mode, entity possession
API, `RTS_UNIT`/`RTS_BUILDING` rendering + a `syncRTSEntities` adapter), `packages/world-schema`
(new camera mode/entity kind/layer kind enum values), `services/api` (new RTS session + lockstep
command-relay routes on the existing realtime websocket bridge), `apps/player` (new `/g/[id]/rts`
play mode — full RTS HUD: minimap, drag-selection, production panel, faction lobby, possession),
`apps/studio` (RTS unit/building palette entries + a faction-assignment inspector panel).

**Final verification status**, forced/no-cache, run twice back-to-back after the RTS build to
check for flakiness (none found):

| Check | Result |
|---|---|
| `pnpm install` | Clean, lockfile up to date |
| `turbo run typecheck` | **35/35 tasks passing** (was 33; +2 for the new `rts-sim` package's typecheck/build split) |
| `turbo run build` | **24/24 tasks passing** |
| `turbo run test` | **35/35 tasks passing, run twice, 0 failures either run** |

`packages/rts-sim` alone: 22 test files, 154 tests (97 from the initial build + 57 from the depth
extension below), including a byte-identical-replay determinism test extended to cover heat/
stealth/allied-strike/naval logic, not just the original baseline systems. `services/api`: 23 test
files, 162 tests (the original 155 + 7 new RTS session/relay tests) — the entire pre-existing suite
stayed green through this pass. `apps/player`: 13 test files, 85 tests, all new (the app had zero
`.tsx` component tests before this pass — see below).

### What was built, in three parallel phases against `docs/RTS-CONTRACTS.md`

1. **Simulation core** (`packages/rts-sim`, §1-4): pure, deterministic TypeScript — no `Math.random()`,
   no wall-clock reads inside tick logic, a seeded PRNG threaded through match state — because
   multiplayer here is lockstep (every client simulates identically from the same seed + command
   stream). A real bug was caught and fixed here during the initial build: projectile tunneling at
   the 10Hz tick rate (fast projectiles could skip past `PROJECTILE_HIT_DISTANCE` in one tick);
   fixed by clamping per-tick travel to `min(speed*dt, remainingDistance)`.
2. **3D + Studio integration** (`packages/spatial-engine`, `packages/world-schema`, `apps/studio`,
   §6 + Studio half of §7): a new overhead `RTS` camera mode; `RTS_UNIT`/`RTS_BUILDING` entity
   kinds; a `possessEntity()`/`releasePossession()`/`isPossessing()` API layered on the pre-existing
   `FIRST_PERSON`/`THIRD_PERSON` camera runtime (not a reimplementation of it); a `syncRTSEntities()`
   adapter that mirrors `rts-sim` match state into rendered Three.js entities via the existing
   `EntityRegistry`, never bypassing it; Studio palette entries and a faction-assignment panel.
3. **Multiplayer relay + Player HUD** (`services/api`, `apps/player`, §5 + player half of §7):
   lockstep command relay on the existing `services/api/src/realtime/ws.ts` bridge — the API never
   runs the simulation, only relays commands and manages lobbies, consistent with this repo's
   existing "API relays, clients/workers do the work" convention. Full RTS play mode in
   `apps/player`: minimap, drag-select, production panel, faction lobby, and a possession button
   wired to the real spatial-engine API from phase 2 (not a stub — verified during this integration
   pass).

### Depth extension (§9): supplemental design material, folded in as an additive pass

Partway through the build, the user supplied further Global Dominance design material — written
against an Unreal Engine 5/C++ implementation. That engine/language assumption does not apply here
(this platform's stack — TypeScript, three.js/`spatial-engine`, the existing monorepo — was already
decided and stays fixed); the material was used purely as **design intent and balance targets**,
layered additively onto `rts-sim`'s already-pinned public API with zero breaking changes to
`createMatch`/`tickMatch`/`serializeMatch`/`deserializeMatch`/`stateHash`. What landed: an expanded
unit roster (6 infantry + 10 vehicle/ship/air archetypes layered on the existing 3 combat classes),
a munition/heat system (Ballistic/Railgun/Plasma, each with heat-per-shot and cooling), radar-building
and heat-threshold stealth detection with urban-cover halving, updated economy (`$50,000` starting
credits, replacing the reference's original value — noted in `packages/rts-sim`'s own README
changelog — plus hard per-faction caps of 250 ground + 50 air units), three AI difficulty presets
(Beginner/Intermediate/Pro), a Pro-only allied-nation coordinated-strike system for up to three
additional AI factions, and biome metadata (Urban/Jungle/Sea) driving team-color variants and a
scoped-down open-water naval steering mode (seek/separation only, no A* — documented as a
simplification, not silently shipped as full naval pathfinding).

### Issues found and fixed during this integration pass

No cross-package breakage was found — the three parallel build agents' interfaces matched up
cleanly, which is the direct payoff of pinning `packages/rts-sim`'s public API in
`docs/RTS-CONTRACTS.md` §4 *before* dispatching the phase-2/3 agents, and of running the depth
extension (§9) as a strictly additive pass while phases 2 and 3 were already in flight against the
pre-§9 API. One agent (the multiplayer/player-HUD build) was interrupted mid-task by a transient
org-wide spend-limit error partway through building the RTS viewport component; it was resumed from
its own preserved context and completed the remaining scope without any rework. One real,
pre-existing gap in the base platform was found and fixed along the way: `apps/player` had zero
component-level (`.tsx`) tests before this pass, and its `tsconfig.json`'s `"jsx": "preserve"`
setting (correct for Next.js's own build) was silently breaking Vitest's esbuild transform,
throwing `ReferenceError: React is not defined` the moment a `.tsx` test file was added. Fixed with
a scoped `apps/player/vitest.config.ts` (`esbuild: { jsx: 'automatic' }`) that only affects the test
runner, not the Next.js production build.

### Known limitations — RTS-specific, read before shipping multiplayer matches

**No anti-cheat and no desync recovery, by explicit design-doc decision, not oversight.** The
lockstep relay validates only "is this client actually a member of this session" — a modified
client could send illegal commands and the server would relay them as-is. Desync is *detected*
(`stateHash()` published periodically; a mismatch surfaces a HUD warning) but never *corrected* —
if two clients' simulations diverge, the match stays visibly desynced rather than silently
resolving to a possibly-wrong shared state. Both are called out in `docs/RTS-CONTRACTS.md` §5 as
acceptable scope cuts for this pass; treat them as blocking for any real-money or ranked-competitive
use of this template as shipped.

**Lockstep has no hard input barrier.** A command that arrives late reschedules to a later tick
rather than blocking simulation — simpler to build correctly, but a narrow window where a slow peer
can cause a desync that `stateHash()` will catch after the fact rather than prevent.

**Reconnect is "wait for the next periodic snapshot," not request/response.** A rejoining client
applies the most recently broadcast `serializeMatch()` snapshot rather than requesting current state
on demand — simpler, at the cost of a rejoining player being up to one snapshot interval behind.

**RTS unit-type visual variety is not yet implemented.** The §9 unit roster (16 named archetypes)
exists in `rts-sim`'s data and is consumable by the HUD/production panel, but `spatial-engine`'s
renderer currently draws one shared capsule per unit class (INFANTRY/ARMORED/AIR) rather than a
distinct model per archetype — a real gap, not a rounding error, and the single biggest visual-
fidelity item left if this template is taken further.

**§9's heat/stealth/difficulty/biome fields are simulated correctly but not yet fully surfaced in
the HUD.** `rts-sim` computes heat accumulation, stealth detection, and allied-strike triggers for
real; `apps/player`'s HUD does not yet render a heat gauge, a difficulty picker at session creation,
or a distinct "stealthed" visual treatment. The simulation is correct and tested; the presentation
layer has a documented gap to close in a future pass.

**Naval warfare is a deliberate simplification, not full ship combat.** Sea-biome maps support naval
unit placement and movement (open-water seek/separation steering), but do not implement buoyancy,
water-only pathfinding around obstacles, or the reference material's full "Sea Warfare" ambitions —
called out explicitly in §9 rather than shipped as a half-working navmesh dressed up as complete.

**Studio map-authoring for RTS is basic.** Creators can place `RTS_UNIT`/`RTS_BUILDING` entities and
assign factions, but cover-cell painting (which tiles grant stealth-detection-halving) and biome
selection are not yet first-class Studio authoring tools — `rts-sim`'s `RTSMap.coverCells` defaults
to all-zero until Studio grows a way to paint it.
