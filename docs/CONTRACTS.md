# Sonic GameWorld OS — Build Contracts

Every package, service, worker, and app in this monorepo is built against this document.
If something here conflicts with your instincts, THIS DOCUMENT WINS. Read it fully before writing code.

## 0. Positioning (from the product spec)

"The Spatial Operating System for Creating, Publishing, Discovering, and Monetizing Interactive Worlds."
Not an asset store. Not a Unity/Unreal competitor. The ecosystem layer connecting game creation, AI,
worlds, assets, creators, publishing and player experiences across engines. **The world is the editor.**

Sub-products: **GameWorld Studio** (creator workspace), **GameWorld Market** (spatial marketplace),
**GameWorld Play** (player/UGC discovery), **GameWorld Cloud** (game backend/runtime), **GameWorld AI**
(AI orchestrator). Sonic GameWorld OS is an independent application inside the V12 Multimedia ecosystem.

## 1. Repo layout & naming

```
sonic-gameworld/
├── apps/            studio, marketplace, player, creator, admin, developer-portal   (Next.js 15, App Router)
├── packages/        world-schema, events, spatial-engine, ui, ai-sdk, auth-sdk, marketplace-sdk,
│                    analytics-sdk, asset-sdk, gameworld-sdk
├── services/        api   (ONE modular Node/TS service; domains as modules, not microservices)
├── workers/         asset-processing, ai-generation, thumbnails, builds, moderation, analytics
├── integrations/    unity (C#), unreal (C++/plugin), stripe, storage, identity
├── infrastructure/  docker, terraform, ci, environments, render.yaml
└── docs/
```

* npm scope: `@sonic-gameworld/<name>` (e.g. `@sonic-gameworld/world-schema`, `@sonic-gameworld/api`).
* Every package: `"type": "module"`, `tsconfig.json` extending `../../tsconfig.base.json`,
  scripts `build`, `typecheck` (`tsc --noEmit`), `test` (`vitest run --passWithNoTests`), `clean`.
* Library packages build with `tsup` (ESM + d.ts) to `dist/`; `main`/`types`/`exports` point at `dist/`.
  **`exports` must also include a `"development"`/`"source"`-free simple mapping: `{".": {"types": "./dist/index.d.ts", "import": "./dist/index.js"}}`.**
* Workspace deps use `"workspace:*"`.
* Node 20+, TypeScript 5.7, strict mode, `noUncheckedIndexedAccess` on. No `any` unless commented.
* Tests: vitest. Each package ships at least a smoke test of its public surface.

## 2. Tech stack (fixed)

| Layer | Choice |
|---|---|
| API | Node 20, TypeScript, **Fastify 5** (+ `@fastify/cors`, `@fastify/websocket`, `@fastify/multipart`, `@fastify/rate-limit`, `@fastify/swagger`), zod validation |
| DB | PostgreSQL 16 + PostGIS + pgvector, **Prisma 6** (`services/api/prisma/schema.prisma`) |
| Cache/queues | Redis 7, **BullMQ** for workers, ioredis |
| Search | OpenSearch (client `@opensearch-project/opensearch`); fallback to Postgres `ILIKE` when `OPENSEARCH_URL` unset |
| Vector | pgvector via raw SQL (`vector(768)` column on `SearchDocument`) |
| Storage | S3-compatible via `@aws-sdk/client-s3` (+ presigned uploads) |
| Events | `@sonic-gameworld/events` bus with drivers: `memory`, `redis` (streams), `pubsub`, `kafka` |
| Realtime | Fastify WebSocket, topic-based rooms (`world:<id>`, `session:<id>`, `creator:<id>`) |
| AI | provider-agnostic `AIProvider` interface; adapters `anthropic`, `gemini`, `mock` (mock is default in tests) |
| Payments | Stripe (Checkout + Connect for creator payouts) with a `MockPaymentProvider` |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind 3.4, Zustand, Motion (`motion/react`), Three.js + `@react-three/fiber` + `@react-three/drei` |
| Logging | pino |

## 3. Identity & auth

* JWT bearer tokens (HS256, `JWT_SECRET`). Claims: `{ sub: userId, org?: orgId, roles: string[], tier: PlanTier }`.
* Firebase ID tokens are accepted on `POST /v1/auth/firebase` and exchanged for a GameWorld JWT.
* Dev login: `POST /v1/auth/dev` with `{ email }` when `NODE_ENV !== 'production'`.
* API keys: header `x-api-key: gw_live_...` resolved to a user/org (for SDKs, Unity, Unreal).
* RBAC roles: `owner | admin | editor | viewer | player | moderator | platform_admin`.
* Fastify decorators: `request.user` (`AuthContext | null`), `fastify.authenticate` preHandler, `fastify.requireRole(...)`.

## 4. Plan tiers & economics

STARTER/CREATOR/PRO are unchanged from the original spec. STUDIO and ENTERPRISE were repriced
(149->199, 999->1499; STUDIO's team seats 10->15) to reflect what those tiers actually include
now, beyond the original numeric-limits-only table below: the full RTS / "Global Dominance"
real-time-strategy creation toolset and the downloadable offline desktop app (see
`packages/world-schema/src/enums.ts`'s `PLAN.<tier>.features` for the exact marketing copy shown
on the pricing table — that list is descriptive only, not an entitlement check; every tier can use
the desktop app and RTS tools today).

```ts
type PlanTier = 'STARTER' | 'CREATOR' | 'PRO' | 'STUDIO' | 'ENTERPRISE'
const PLAN = {
  STARTER:    { priceUsd: 0,    feePct: 20, projects: 1,  assets: 20,  teamMembers: 1  },
  CREATOR:    { priceUsd: 19,   feePct: 15, projects: 10, assets: 250, teamMembers: 1  },
  PRO:        { priceUsd: 49,   feePct: 12, projects: -1, assets: 2500,teamMembers: 3  },
  STUDIO:     { priceUsd: 199,  feePct: 10, projects: -1, assets: -1,  teamMembers: 15 },
  ENTERPRISE: { priceUsd: 1499, feePct: 10, projects: -1, assets: -1,  teamMembers: -1 }, // fee negotiated; default 10
}
```
Base split 85 / 15. Prices are stored as integer **cents**. Currency `USD`.

## 5. Marketplace taxonomy (exact)

```ts
type ProductCategory =
  | 'WORLD' | 'GAME_KIT' | 'SYSTEM' | 'AI_AGENT' | 'CHARACTER'
  | 'VEHICLE' | 'ENVIRONMENT' | 'CINEMATIC' | 'MISSION' | 'EXPERIENCE'
type Genre = 'FANTASY' | 'SCIFI' | 'HORROR' | 'STRATEGY' | 'SHOOTER' | 'RACING' | 'RPG' | 'MMO'
           | 'SURVIVAL' | 'TACTICAL' | 'OPEN_WORLD' | 'CYBERPUNK' | 'OTHER'
type EngineTarget = 'WEB' | 'UNITY' | 'UNREAL' | 'GODOT'
```
Spatial discovery hierarchy: `WORLD → CITY → DISTRICT → BUILDING → ROOM → ASSET`.

## 6. World schema (`@sonic-gameworld/world-schema`) — the canonical GameWorld Asset Format

Zod schemas + inferred types. Everything is engine-agnostic. Exporters (Unity/Unreal/Web) consume this.

```ts
Vec3 = { x, y, z }            Quat = { x, y, z, w }
Transform = { position: Vec3, rotation: Quat, scale: Vec3 }
GeoAnchor = { lat, lon, altM }             // optional real-world anchor (WorldForge)

EntityKind = 'REGION' | 'ZONE' | 'BUILDING' | 'ROOM' | 'NPC' | 'PLAYER_SPAWN' | 'ITEM' | 'VEHICLE'
           | 'TRIGGER' | 'CAMERA' | 'LIGHT' | 'PROP' | 'TERRAIN' | 'WATER' | 'ROAD' | 'VOLUME' | 'GROUP'

WorldEntity = {
  id: string (uuid), kind: EntityKind, name: string, parentId?: string,
  transform: Transform, geo?: GeoAnchor,
  assetRef?: { assetId: string, versionId?: string, variant?: 'ULTRA'|'HIGH'|'MEDIUM'|'LOW'|'MOBILE'|'WEB' },
  behavior?: { systemId?: string, params: Record<string, unknown> },
  script?: { language: 'gwscript'|'js', source: string },
  ai?: { agentId?: string, personalityId?: string, memoryEnabled: boolean },
  tags: string[], permissions: { ownerId: string, editors: string[], visibility: 'PRIVATE'|'TEAM'|'PUBLIC' },
  metadata: Record<string, unknown>,
}

WorldLayer = { id, name, kind: 'TERRAIN'|'BUILDINGS'|'ROADS'|'WATER'|'ENVIRONMENT'|'ENTITIES'|'NPCS'|'VEHICLES'
                |'MISSIONS'|'TRIGGERS'|'CAMERAS'|'DETECTION'|'SENSORS'|'HUD'|'CUSTOM', visible, locked, opacity, order }

WorldEnvironment = { timeOfDay: 0..24, weather: 'CLEAR'|'CLOUDS'|'RAIN'|'STORM'|'SNOW'|'FOG'|'SANDSTORM',
                     weatherIntensity: 0..1, skybox?: string, fog?: {density, color}, gravity: number }

WorldDocument = {
  schemaVersion: '1.0.0', id, name, description, genre: Genre[], sizeKm2, maxPlayers,
  bounds: { min: Vec3, max: Vec3 }, origin?: GeoAnchor,
  layers: WorldLayer[], entities: WorldEntity[], environment: WorldEnvironment,
  missions: MissionDefinition[], cameras: CameraRig[], systems: SystemRef[],
  dependencies: { productId, versionId, license: LicenseRecord }[],
  passport: AssetPassport, createdAt, updatedAt
}

MissionDefinition = { id, name, description, chainId?, order, objectives: Objective[],
  triggers: Trigger[], rewards: Reward[], difficulty: 1..10, state: 'DRAFT'|'ACTIVE'|'COMPLETE'|'FAILED' }
Objective = { id, type: 'REACH'|'KILL'|'COLLECT'|'ESCORT'|'DEFEND'|'INTERACT'|'SURVIVE'|'CUSTOM',
              targetEntityId?, count?, timeLimitS?, description, conditions: Condition[] }
Trigger = { id, kind: 'ENTER_VOLUME'|'EXIT_VOLUME'|'TIMER'|'EVENT'|'PLAYER_COUNT'|'CUSTOM',
            entityId?, event?, params: Record<string, unknown>, actions: ToolCall[] }
Condition = { op: 'EQ'|'NE'|'GT'|'LT'|'HAS'|'NOT', key, value }
Reward = { type: 'XP'|'CURRENCY'|'ITEM'|'UNLOCK', amount?, itemId? }

CameraMode = 'ORBIT'|'FOLLOW'|'CHASE'|'DRONE'|'FIRST_PERSON'|'THIRD_PERSON'|'RAIL'|'CRANE'|'AI_DIRECTOR'
CameraRig = { id, name, mode: CameraMode, targetEntityId?, keyframes: { t, transform, fov }[],
              params: { distance?, height?, damping?, fov?, dof?: {focusM, aperture} } }
CinematicSequence = { id, name, shots: { rigId, durationS, transition: 'CUT'|'FADE'|'DISSOLVE'|'WIPE' }[], grading?: string }

NPCDefinition = { id, name, characterAssetId?, voice?: { provider, voiceId }, personality: { traits: string[], backstory, goals: string[], tone },
  memory: { enabled, capacity }, knowledge: { kbIds: string[] }, behavior: { treeId?, states: string[], aggression: 0..1, faction? },
  dialogue: { style, openingLines: string[] }, questLogic?: { missionIds: string[] }, relationships: { npcId, affinity: -1..1 }[] }

LicenseRecord = { id, commercial, personal, enterprise, redistribution, modification, multiplayer,
                  aiTraining, resale, sublicensing, attribution: boolean, attributionText?, seats?: number, spdx?: string }
AssetPassport = { assetId, creatorId, createdAt, version, source: 'ORIGINAL'|'IMPORTED'|'AI_GENERATED'|'AI_ASSISTED'|'REMIX',
  license: LicenseRecord, dependencies: string[], modificationHistory: { at, by, note }[],
  aiGenerated: boolean, aiAssisted: boolean, thirdPartyContent: boolean,
  aiProvenance?: { model, version, promptHash, creatorId, timestamp, humanModifications: number },
  marketplaceHistory: { productId, at, event: 'LISTED'|'SOLD'|'UPDATED'|'DELISTED' }[] }

LicenseCompatibility = 'GREEN' | 'YELLOW' | 'RED'
checkLicenseCompatibility(licenses: LicenseRecord[], intent: { commercial, multiplayer, redistribute, modify }): { status, reasons[] }

ToolCall = { tool: AIToolName, args: Record<string, unknown> }   // see §8
```
Also export: `createEmptyWorld(opts)`, `validateWorld(doc)`, `sceneGraphToSemantic(doc): string` (the AI context
text: "There are three enemies inside Building 7, Player 12 is outside the northern entrance..."),
`diffWorlds(a,b)`, `WORLD_SCHEMA_VERSION`.

## 7. Events (`@sonic-gameworld/events`)

```ts
interface DomainEvent<T extends string = string, P = unknown> {
  id: string; type: T; occurredAt: string; actorId?: string; orgId?: string; payload: P; version: 1
}
type EventType =
  | 'USER_REGISTERED' | 'CREATOR_ACTIVATED' | 'ORG_CREATED'
  | 'ASSET_UPLOADED' | 'ASSET_PROCESSED' | 'ASSET_REJECTED' | 'ASSET_PUBLISHED'
  | 'WORLD_CREATED' | 'WORLD_UPDATED' | 'WORLD_PUBLISHED' | 'WORLD_SNAPSHOT_CREATED'
  | 'GAME_CREATED' | 'GAME_PUBLISHED' | 'GAME_SESSION_STARTED' | 'GAME_SESSION_ENDED'
  | 'PRODUCT_LISTED' | 'PRODUCT_UPDATED' | 'PRODUCT_DELISTED'
  | 'ORDER_CREATED' | 'ORDER_PAID' | 'PLAYER_PURCHASED_ASSET' | 'ORDER_REFUNDED'
  | 'ROYALTY_ACCRUED' | 'PAYOUT_REQUESTED' | 'PAYOUT_SENT'
  | 'AI_TOOL_REQUESTED' | 'AI_TOOL_EXECUTED' | 'AI_TOOL_DENIED'
  | 'MISSION_CREATED' | 'NPC_CREATED' | 'REVIEW_CREATED'
  | 'MODERATION_FLAGGED' | 'MODERATION_RESOLVED' | 'FRAUD_SIGNAL'
  | 'ANALYTICS_EVENT'
interface EventBus { publish(e): Promise<void>; subscribe(type|'*', handler): () => void; close(): Promise<void> }
createEventBus({ driver: 'memory'|'redis'|'pubsub'|'kafka', ... })
```
Fan-out rules from spec: `PLAYER_PURCHASED_ASSET → billing, creator, analytics, inventory`;
`GAME_PUBLISHED → search, marketplace, recommendation`.

## 8. AI orchestrator & tool pipeline (services/api/src/modules/ai)

**AI never mutates state directly.** Flow: `AI → Tool → Permission → Validation → Execution → Event`.

```ts
type AIToolName =
  | 'create_world' | 'create_entity' | 'modify_entity' | 'delete_entity' | 'modify_terrain'
  | 'spawn_npc' | 'create_quest' | 'set_weather' | 'set_time_of_day' | 'move_camera' | 'create_camera_rig'
  | 'create_trigger' | 'create_cinematic' | 'set_layer_visibility' | 'track_entity' | 'publish_asset'
  | 'query_world' | 'generate_asset' | 'run_playtest' | 'analyze_players'
type AIAgentRole = 'ORCHESTRATOR'|'BUILDER'|'DIRECTOR'|'DESIGNER'|'NPC'|'QUESTMASTER'|'CINEMATOGRAPHER'|'QA'|'ANALYST'|'PUBLISHER'
```
* Each tool has a zod args schema, a required permission (`world:write`, `world:publish`, ...), a validator
  (bounds, quotas, license compatibility), and an executor that returns `{ ok, result, events[] }`.
* `POST /v1/ai/command` `{ worldId, text, mode?: 'DIRECTOR'|'BUILDER'|... , voice?: boolean }` →
  orchestrator builds context via `sceneGraphToSemantic`, picks an agent role, asks the provider for tool calls,
  runs the pipeline, returns `{ plan, executed: ToolExecution[], denied: [], narration }`.
* Provider interface: `complete({ system, messages, tools }) → { text, toolCalls[] }`. `mock` provider parses
  simple English ("spawn 3 enemies near building 7", "start the storm", "follow player 17") into tool calls
  deterministically so the whole stack works with no API key.
* Every execution writes `AIExecution` + `AIUsage` rows and publishes `AI_TOOL_EXECUTED`.

## 9. REST API surface (`/v1`, Fastify, JSON, zod-validated, OpenAPI at `/docs`)

```
auth:        POST /auth/dev  POST /auth/firebase  POST /auth/refresh  GET /auth/me  POST /auth/api-keys  DELETE /auth/api-keys/:id
identity:    GET/PATCH /users/:id   POST /orgs   GET /orgs/:id   POST /orgs/:id/members   PATCH /orgs/:id/members/:userId
creator:     GET /creators/:handle (passport)  PATCH /creators/me  GET /creators/me/dashboard  GET /creators/me/reputation
             GET /creators/me/balance  POST /creators/me/payouts  GET /creators/me/payouts
worlds:      POST /worlds  GET /worlds  GET /worlds/:id  PATCH /worlds/:id  DELETE /worlds/:id
             GET /worlds/:id/document  PUT /worlds/:id/document  POST /worlds/:id/snapshots  GET /worlds/:id/snapshots
             POST /worlds/:id/entities  PATCH /worlds/:id/entities/:eid  DELETE /worlds/:id/entities/:eid
             POST /worlds/:id/publish  POST /worlds/:id/forge   (WorldForge: {lat, lon, radiusKm, theme})
             GET  /worlds/:id/semantic  (AI context text)
games:       POST /games  GET /games  GET /games/:id  PATCH /games/:id  POST /games/:id/publish
             POST /games/:id/sessions  POST /sessions/:id/join  POST /sessions/:id/end  GET /sessions/:id
             GET/PUT /games/:id/saves/:playerId   GET /games/:id/leaderboard  POST /games/:id/leaderboard
assets:      POST /assets/upload-url  POST /assets  GET /assets  GET /assets/:id  GET /assets/:id/passport
             POST /assets/:id/versions  POST /assets/:id/publish  GET /assets/:id/variants
npcs:        POST /npcs  GET /npcs  GET /npcs/:id  PATCH /npcs/:id  POST /npcs/:id/chat  POST /npcs/generate
missions:    POST /missions  GET /missions  GET /missions/:id  PATCH /missions/:id  POST /missions/generate
ai:          POST /ai/command  POST /ai/generate  GET /ai/tools  GET /ai/executions  GET /ai/usage
marketplace: GET /marketplace/search  GET /marketplace/map  (spatial discovery tree)  GET /marketplace/featured
             GET /products/:slug  POST /products  PATCH /products/:id  POST /products/:id/versions
             POST /products/:id/reviews  GET /products/:id/reviews  POST /wishlist  GET /wishlist
             GET /cart  POST /cart/items  DELETE /cart/items/:id  POST /orders  GET /orders  GET /orders/:id
             POST /orders/:id/refund   GET /library (purchased products)
licensing:   GET /licenses/:id  POST /licenses/check  (compatibility engine)  GET /licenses/product/:productId
payments:    POST /payments/checkout  POST /payments/webhook  POST /subscriptions  GET /subscriptions/me  DELETE /subscriptions/me
analytics:   POST /analytics/events  GET /analytics  GET /analytics/creator  GET /analytics/game/:id
recommend:   GET /recommendations  GET /recommendations/similar/:productId
search:      GET /search?q=&category=&genre=&engine=
notifications: GET /notifications  POST /notifications/:id/read
moderation:  GET /moderation/queue  POST /moderation/:id/resolve  POST /moderation/report
cloud:       POST /cloud/matchmake  GET /cloud/servers  POST /cloud/live-events  GET /cloud/live-events
developer:   GET /developer/webhooks  POST /developer/webhooks  GET /developer/integrations
health:      GET /health  GET /ready  GET /metrics
```
Response envelope: success → raw JSON body; errors → `{ error: { code, message, details? } }` with proper status.
Pagination: `?cursor=&limit=` → `{ items, nextCursor }`.

WebSocket `GET /ws?token=` — client sends `{ op: 'SUBSCRIBE', topic }`, server pushes
`{ topic, type, payload }` for world edits, AI executions, session state, notifications.

## 10. Prisma data model (services/api/prisma/schema.prisma)

Implement EVERY model in the spec's "Complete Data Model" section (Identity, Marketplace, Worlds, Games, Assets,
AI, NPC, Missions, Economy, Analytics, Infrastructure). Use `cuid()` ids, `createdAt/updatedAt`, soft-delete
`deletedAt?` on user-facing entities, Json columns for documents (`WorldVersion.document`, `NPC.definition`,
`Mission.definition`, `AssetPassport.data`). Enums for tiers, categories, genres, engines, statuses, license flags.
Include `SearchDocument { id, kind, refId, text, embedding Unsupported("vector(768)")? }` for pgvector and
`WorldRegion.geom Unsupported("geometry(Polygon,4326)")?` for PostGIS (both nullable so migrations work without extensions in tests).

## 11. Spatial engine (`@sonic-gameworld/spatial-engine`) — framework-agnostic core + React bindings

Core (no React): `SpatialEngine` class wrapping a Three.js scene:
`loadWorld(doc)`, `getEntity(id)`, `select(ids)`, `track(entityId)`, `setCameraMode(mode, opts)`, `setLayerVisible`,
`setEnvironment(env)`, `spawn(entity)`, `move(id, transform)`, `remove(id)`, `raycast(ndc)`, `frame(ids)`,
`playCinematic(seq)`, `recordSnapshot()`, `on(event, fn)` (events: `select`, `hover`, `entityChange`, `cameraChange`, `tick`),
`dispose()`. Camera modes per §6 with smooth damping. HUD overlay data via `getHUDState()`
(`{ mode, fps, tracked, counts: {players,npcs,vehicles,events,missions}, cursorGeo?, selection[] }`).
Entities render as instanced primitives colored by kind (loading GLB via `assetRef` when `cdnBaseUrl` set).
LOD: entities beyond distance thresholds collapse to billboards. Detection overlay + sensor rings for `DETECTION`/`SENSORS` layers.
React: `<SpatialViewport world onSelect onEntityChange cameraMode ... />`, `useSpatialEngine()`, `<HUD />`, `<LayerPanel />`, `<TrackingPanel />`.
Must be SSR-safe (dynamic import in Next.js; guard `window`).

## 12. Frontend apps (Next.js 15, App Router, Tailwind, dark "command-center" aesthetic)

Shared design tokens in `@sonic-gameworld/ui`: colors `bg #05070B`, `panel #0B0F17`, `border #1B2230`,
`accent #38F5C8` (teal), `accent2 #7C5CFF` (violet), `warn #FFB020`, `danger #FF4D6D`, text `#E6EDF3`,
monospace HUD font `JetBrains Mono`, UI font `Inter`. Components: Button, Panel, Badge, Tabs, Input, Select,
Slider, Toggle, Dialog, Toast, DataTable, EmptyState, StatTile, Kbd, CommandPalette, PriceTag, LicenseBadge, ScoreRing.

* **studio** (port 3000): left = scene hierarchy (World→Region→Zone→Building→Room→NPC/Item/Trigger), center =
  `SpatialViewport`, right = inspector (transform/behavior/AI/tags/permissions), bottom = AI Director command bar
  (text + mic button) with execution log, top HUD (counts, camera mode buttons ORBIT/FOLLOW/DRONE/FIRST_PERSON,
  world control WEATHER/TIME/SPAWN/EVENTS). Pages: `/` (projects), `/worlds/[id]` (editor), `/worlds/[id]/director`,
  `/worlds/[id]/missions`, `/worlds/[id]/npcs`, `/worlds/[id]/cinematics`, `/worlds/[id]/publish`, `/forge` (WorldForge), `/kits`.
* **marketplace** (3001): `/` spatial discovery map (interactive tree WORLDS/GAMES/ASSETS → genres → items, rendered on a
  3D globe/graph using spatial-engine), `/search`, `/category/[slug]`, `/p/[slug]` product page (3D preview, license badge,
  Asset Passport, reviews, compatibility check), `/cart`, `/checkout`, `/library`, `/c/[handle]` creator storefront.
* **player** (3002): GameWorld Play — `/` discover games/worlds/events/missions/creators/AI characters, `/g/[id]` play page
  (web runtime embed via spatial-engine + session join), `/events`, `/profile`, `/become-a-creator`.
* **creator** (3003): Creator Passport dashboard — `/` overview (sales, revenue, followers, ratings, reputation ScoreRing),
  `/products`, `/products/new` (publish wizard with license builder + pipeline status), `/analytics`, `/payouts`, `/storefront`, `/settings`.
* **admin** (3004): moderation queue, fraud signals, users/orgs, products, payouts, feature flags, observability tiles.
* **developer-portal** (3005): API keys, webhooks, OpenAPI explorer (iframe `/docs`), SDK docs (Unity/Unreal/Web), sandbox.

All apps talk to the API through `@sonic-gameworld/gameworld-sdk` (typed fetch client, `createClient({ baseUrl, token })`).

## 13. Workers (BullMQ, Redis)

Queue names: `asset.process`, `asset.thumbnail`, `ai.generate`, `build.compile`, `moderation.scan`, `analytics.rollup`.
Asset pipeline stages in order (each emits progress on `AssetVersion.pipeline` Json): UPLOAD → MALWARE_SCAN → FILE_VALIDATION
→ METADATA_EXTRACTION → LICENSE_VALIDATION → 3D_VALIDATION → OPTIMIZATION → LOD_GENERATION → TEXTURE_OPTIMIZATION → THUMBNAILS
→ PREVIEW_BUILD → COMPATIBILITY_CHECK → AI_TAGGING → QUALITY_SCORE → CREATOR_APPROVAL → MARKETPLACE.
Variants generated: ULTRA, HIGH, MEDIUM, LOW, MOBILE, WEB. Accepted uploads: FBX GLB GLTF OBJ USD BLEND PNG JPG WAV MP3 MP4 ZIP.
Moderation pipeline: MALWARE → AI_SAFETY → LICENSE → CONTENT_POLICY → HUMAN_REVIEW (when needed) → PUBLISH.
Workers are real implementations with pluggable "processors" (default processors do real GLB parsing via `@gltf-transform/core`
for validation/metadata, simple LOD by decimation ratio metadata, thumbnails via headless three renderer stub when no GPU).

## 14. Ranking & reputation (deterministic, unit-tested)

`creatorScore = weighted(quality .2, reliability .15, sales .15, updates .1, reviews .15, support .1, originality .1, compliance .05)` → 0..100.
`rankProduct = relevance*.25 + quality*.15 + creatorReputation*.15 + conversion*.1 + retention*.1 + recency*.1 + compatibility*.1 + userPref*.05`.

## 15. Definition of done for every agent

1. Code compiles: `pnpm --filter <pkg> typecheck` passes.
2. `pnpm --filter <pkg> build` passes (tsup / next build / tsc).
3. `pnpm --filter <pkg> test` passes with at least one meaningful test.
4. No TODO stubs that throw "not implemented" on primary paths. Mock providers are fine; empty functions are not.
5. A `README.md` in the package root: purpose, how to run, env vars, public API.
6. Do **not** run `pnpm install` at the repo root yourself unless told; the root install is done once by the integrator.
   If you need to test, you MAY run `pnpm install --filter <pkg>...` scoped to your package.
