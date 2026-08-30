# @sonic-gameworld/api

The Sonic GameWorld OS backend: a single modular Fastify 5 service. Domains live as **modules**
under `src/modules/*`, not as separate microservices — see `src/modules/registry.ts`.

This package provides the **application shell** (config, logging, db, redis, storage, search,
event bus, auth/RBAC/quotas, realtime websocket bridge, error handling) plus these domain
modules: `health`, `auth`, `identity`, `creator`, `notifications`, `developer`, `analytics`.
Every other domain (`assets`, `marketplace`, `licensing`, `payments`, `recommend`, `search`,
`moderation`) is owned by other agents and appended to the same registry — see **Appending a
module** below. `worlds`, `games`, `npcs`, `missions`, `cloud`, and `ai` (all documented below) are built.

## Running it

```bash
pnpm --filter @sonic-gameworld/api dev     # tsx watch src/index.ts
pnpm --filter @sonic-gameworld/api build   # tsc -p tsconfig.build.json
pnpm --filter @sonic-gameworld/api typecheck
pnpm --filter @sonic-gameworld/api test    # vitest run

pnpm --filter @sonic-gameworld/api prisma:generate   # regenerate the Prisma client after schema changes
pnpm --filter @sonic-gameworld/api prisma:migrate    # dev migration
pnpm --filter @sonic-gameworld/api prisma:seed
```

The server listens on `API_HOST:API_PORT` (defaults `0.0.0.0:4000`). All REST routes are mounted
under `/v1` (e.g. `GET /v1/health`); the OpenAPI explorer is at `/docs`; the realtime bridge is at
top-level `/ws?token=<jwt>`.

## Environment variables

All parsed and validated by `src/config.ts` (zod) — every one has a working default for local dev
and tests, so the service boots with **zero required env vars**. In production, `JWT_SECRET` must
be overridden (the default is rejected when `NODE_ENV=production`).

| Var | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `API_PORT`, `API_HOST`, `API_BASE_URL` | `4000`, `0.0.0.0`, `http://localhost:4000` | listen address + the base URL advertised in the OpenAPI doc |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | insecure dev default, `1h` | access-token signing |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | refresh-token lifetime |
| `API_KEY_PREFIX` | `gw_live_` | prefix stamped on minted API keys |
| `DATABASE_URL` | local Postgres URL | Prisma datasource |
| `REDIS_URL`, `EVENT_BUS_DRIVER` | `redis://localhost:6379`, `memory` | cache + event bus (`memory`\|`redis`\|`pubsub`\|`kafka`) |
| `CORS_ORIGIN` | `*` | comma-separated allow-list or `*` |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW` | `300`, `1 minute` | global rate limit |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `S3_PUBLIC_URL_BASE` | — | object storage (any S3-compatible endpoint) |
| `OPENSEARCH_URL`, `OPENSEARCH_USERNAME`, `OPENSEARCH_PASSWORD` | unset → Postgres `ILIKE` fallback | search backend |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | unset → `MockPaymentProvider`/`MockPayout` | payments + creator payouts |
| `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_SERVICE_ACCOUNT_PATH` | — | `firebase-admin` is lazily imported; only touched by `POST /auth/firebase` |
| `LOG_LEVEL` | `debug` (dev) / `info` (prod) / `silent` (test) | pino level |
| `WEBHOOK_TIMEOUT_MS`, `WEBHOOK_MAX_FAILURES` | `5000`, `10` | developer webhook dispatcher |

## Application shell (`src/`)

- `config.ts` — zod-validated env → `AppConfig` (`getConfig()` singleton, `loadConfig()` for tests).
- `logger.ts` — pino, pretty-printed outside prod/test.
- `db.ts` — `PrismaClient` singleton behind a `db` proxy; `setPrismaForTests()` swaps in the fake.
- `redis.ts` — lazy `ioredis` singleton + best-effort `pingRedis()`.
- `bus.ts` — wraps `@sonic-gameworld/events`' `createEventBus`, resolving the driver from config; `setBusForTests()` for tests.
- `storage.ts` — S3 client + presigned upload/download URLs.
- `search.ts` — OpenSearch client that mirrors every indexed doc into `SearchDocument`, so it degrades to Postgres `ILIKE` automatically when `OPENSEARCH_URL` is unset (or OpenSearch errors).
- `errors.ts` — `AppError` (+ `NotFoundError`/`ValidationError`) and the Fastify error handler producing `{ error: { code, message, details? } }`.
- `types.ts` — `AuthContext`, `Permission`, the `fastify`/`FastifyRequest` module augmentation, and `ModuleRegistrar`.
- `plugins/auth.ts` — JWT bearer + `x-api-key` resolution on every request; decorates `request.user`, `fastify.authenticate`, `fastify.requireRole(...)`, `fastify.requirePermission(...)`; exports the token/API-key primitives (`signAccessToken`, `verifyAccessToken`, `generateRefreshToken`, `generateApiKey`, `verifyFirebaseIdToken`) used by the `auth` module's routes.
- `plugins/rbac.ts` — `ROLE_PERMISSIONS` map (§3) + `hasPermission`/`hasRole`.
- `plugins/quotas.ts` — `fastify.quotas.{assertProjectQuota,assertAssetQuota,assertTeamQuota}` enforcing `PLAN` (§4) limits; throws `AppError.quotaExceeded` (HTTP 402).
- `plugins/pagination.ts` — `PaginationQuerySchema`, `toPrismaPageArgs`, `toPage` — the `?cursor=&limit=` → `{ items, nextCursor }` convention (§9).
- `realtime/ws.ts` — `GET /ws?token=`; topic rooms `world:<id>` / `session:<id>` / `creator:<id>` / `user:<id>`; bridges every bus event onto matching subscribers.
- `modules/registry.ts` — `MODULES: ModuleRegistrar[]`, mounted under `/v1` by `app.ts`.
- `app.ts` — `buildApp()`: cors, rate-limit, multipart, swagger (+ swagger-ui at `/docs`), auth/rbac/quotas/pagination plugins, realtime, error handler, then every module in `MODULES` under `/v1`.
- `server.ts` / `index.ts` — process bootstrap (`start()`) and the package entry point.

## Modules owned by this package

- **health** — `GET /health`, `GET /ready` (checks Postgres + Redis), `GET /metrics`.
- **auth** — `POST /auth/dev` (disabled when `NODE_ENV=production`), `POST /auth/firebase`, `POST /auth/refresh`, `GET /auth/me`, `GET|POST /auth/api-keys`, `DELETE /auth/api-keys/:id`.
- **identity** — `GET|PATCH /users/:id`, `POST /orgs`, `GET /orgs/:id`, `POST /orgs/:id/members`, `PATCH /orgs/:id/members/:userId`.
- **creator** — `GET /creators/:handle` (Creator Passport), `PATCH /creators/me`, `GET /creators/me/dashboard`, `GET /creators/me/reputation`, `GET /creators/me/balance`, `POST|GET /creators/me/payouts`. Reputation math (§14) lives in `creator/reputation.ts` (pure `computeCreatorScore`, unit-tested) separate from `gatherReputationInputs` (the DB-driven policy). Payouts (`creator/payouts.ts`) use Stripe Connect transfers when `STRIPE_SECRET_KEY` + the creator's `stripeAccountId` are both set, otherwise an instant `MockPayout`.
- **notifications** — `GET /notifications`, `POST /notifications/:id/read`; exports `createNotification()` for other modules to call.
- **developer** — full webhook CRUD under `/developer/webhooks`, `GET /developer/integrations`, and `developer/webhookDispatcher.ts` — subscribes to the event bus and POSTs matching events to every active webhook with an `x-gameworld-signature: sha256=<hmac>` header (auto-disables a webhook after `WEBHOOK_MAX_FAILURES` consecutive failures).
- **analytics** — `POST /analytics/events` (single or batched ingest → `AnalyticsEvent` rows + `ANALYTICS_EVENT` bus publish), `GET /analytics`, `GET /analytics/creator`, `GET /analytics/game/:id` (includes cohort retention, avg session length, peak concurrency).
- **ai** — GameWorld AI orchestrator (§8): `POST /ai/command` (`{worldId, text|transcript, voice?, mode?}` → orchestrator picks an `AIAgentRole` — `providers/mock.ts`'s `selectAgentRole`, used regardless of active provider — builds context via `context.ts`'s `sceneGraphToSemantic` + RAG, asks the `AIProvider` for tool calls, and runs them through `pipeline.ts`'s `executeToolPlan`: permission → `validate()` → `execute()` → `AIExecution`/`AIUsage` rows + `AI_TOOL_REQUESTED`/`AI_TOOL_EXECUTED`/`AI_TOOL_DENIED` bus events, returning `{plan, executed, denied, narration}`), `POST /ai/generate` (`generate.ts`'s deterministic WORLD/NPC/MISSION/CINEMATIC generators — e.g. a "10 km cyberpunk city with four districts..." prompt yields 4 `REGION` + `VOLUME`/`ZONE`/`BUILDING`/`ROAD`/`PROP` entities — routed through the same `executeToolPlan` when a `worldId` is given, so generation never bypasses permission/validation either), `GET /ai/tools` (all 20 `AIToolName`s + JSON-schema args), `GET /ai/executions`, `GET /ai/usage`. All 20 tools live in `ai/tools/registry.ts`; the 10 `AIAgentRole` system prompts + tool subsets in `ai/agents/*.ts` (subsets derived from `AI_TOOL_DEFINITIONS[...].roles`, never hand-duplicated). `ai/permissions.ts` maps `Role → AIPermission` with an ownership-aware fallback (see its own header comment) so an unelevated `player`-role creator can still fully drive their own world via AI, matching what they can already do through the plain REST routes. `providers/{anthropic,gemini,mock}.ts` implement the shared `AIProvider` interface; `mock` (default whenever no API key is configured) deterministically parses commands via `@sonic-gameworld/ai-sdk`'s `parseCommandMock`.

## Modules added by the worlds/games/npcs/missions/cloud agent

`worlds`, `games`, `npcs`, `missions`, `cloud` — world editing, the runtime/session layer on top
of it, deterministic NPC/quest generation, and GameWorld Cloud (§9).

- **worlds** (`src/modules/worlds/`) — `POST /worlds`, `GET|PATCH|DELETE /worlds/:id`,
  `GET|PUT /worlds/:id/document`, `GET|POST /worlds/:id/versions|snapshots`,
  `POST|PATCH|DELETE /worlds/:id/entities[/:eid]`, `POST /worlds/:id/publish` (creates a `Product`
  draft of category `WORLD`), `POST /worlds/:id/forge`, `GET /worlds/:id/semantic`. All mutation
  logic lives in `service.ts` (`worldService.getDocument/putDocument/createEntity/updateEntity/
  deleteEntity/applyEntityPatch/createSnapshot/publishWorld/forgeWorld/semanticText`, plus the
  `canAccessWorld`/`assertCanReadWorld`/`assertCanWriteWorld` access checks) with **no Fastify
  dependency**, specifically so the `ai` module's tool executors and the `games`/`npcs`/`missions`
  modules can reuse it instead of re-deriving world access/versioning logic. Versioning model:
  `putDocument` (a full replace — PUT or a forge run) always creates a new `WorldVersion` row; entity
  CRUD (`patchCurrentDocument`) mutates the *current* version's `document` Json in place — snapshots
  are the user-labelled checkpoint mechanism for that in-place history. `forge.ts` is `WorldForge`:
  a `WorldForgeProvider` interface with `SyntheticProvider` (deterministic, seeded procedural city —
  the default; guarantees 50+ entities including terrain/roads/water/buildings/a spawn) and
  `OverpassProvider` (real fetch to OSM Overpass + open-elevation.com, tagging every entity
  `ODbL-1.0`/`© OpenStreetMap contributors`; an explicit `OVERPASS` request that fails falls back to
  `SYNTHETIC` rather than erroring the whole forge run) plus `applyForgeTheme` for the four spec
  themes (`POST_APOCALYPTIC`/`CYBERPUNK`/`ZOMBIE_OUTBREAK`/`FUTURE_FLOOD`).
- **games** (`src/modules/games/`) — Game CRUD, `POST /games/:id/publish` (a published game lists
  as an `EXPERIENCE` product — there's no dedicated `GAME` `ProductCategory` per §5), sessions
  (`POST /games/:id/sessions`, `POST /sessions/:id/join|end`), saves
  (`GET|PUT /games/:id/saves/:playerId`), and the leaderboard. `sessionStore.ts` layers fast-moving
  live session state (current player list, live status) on top of the durable
  `GameSession`/`GameSessionPlayer` rows — Redis-backed when `REDIS_URL` is actually set, an
  in-memory `Map` otherwise (checks the raw env var, not `app.config.redisUrl`, which always has a
  default — this is what makes dev/tests never touch a real Redis instance).
- **npcs** (`src/modules/npcs/`) — NPC CRUD, `POST /npcs/generate`, `POST /npcs/:id/chat`.
  `generator.ts` is a deterministic archetype-based `NPCDefinition` generator (guard/merchant/
  bandit/scholar/healer/innkeeper/blacksmith/wanderer/quest-giver, matched from the prompt text or
  picked via a seeded PRNG, plus one flavor trait lifted straight out of the prompt) with an
  optional `aiHook` — CONTRACTS.md's "use AI provider when the `ai` module exposes one later" — that
  is merged over the deterministic base and never allowed to fail the request (a throwing/rejecting
  hook is caught and ignored). `dialogue.ts` is the reply engine backing `chat`: intent keywords
  (greeting/farewell/thanks/quest) short-circuit to a scripted line, everything else falls back to a
  tone-templated reply seeded by `(npcId, turn, message)` so a conversation replays identically.
  Conversation history is `NPCConversation`/`NPCMessage` rows (the schema's actual "NPC memory"
  storage) — `chat` only feeds prior turns back into the reply when `definition.memory.enabled`,
  capped at `memory.capacity`. Visibility: an NPC's owner (or `platform_admin`) always has full
  access; anyone can `chat` with one once its `status` is `ACTIVE`.
- **missions** (`src/modules/missions/`) — Mission CRUD, `POST /missions/generate`. `generator.ts`
  is the deterministic questmaster: it maps prompt keywords to an `Objective.type`
  (kill/collect/escort/defend/reach/interact/survive), then picks a *real* matching entity out of
  the target world's current document (tagged `enemy`/`hostile` NPCs for `KILL`, `ITEM`/`PROP` for
  `COLLECT`, etc.) so the produced `MissionDefinition` never references an id that doesn't exist —
  when no candidate exists (e.g. an empty world) the optional `targetEntityId`/`entityId` fields are
  simply omitted rather than left dangling. Same-inputs-same-output: seeded off
  `(worldId, prompt, chainId, order)`. Every request-body objective/trigger is missing a required
  `id` by design (clients don't invent ids) — `index.ts`'s `withGeneratedIds` stamps a fresh uuid on
  each before it reaches `MissionDefinitionSchema.parse`.
- **cloud** (`src/modules/cloud/`) — `POST /cloud/matchmake`, `GET /cloud/servers`,
  `POST|GET /cloud/live-events`. `matchQueue.ts` is the FIFO queue behind matchmaking (same
  `REDIS_URL`-unset -> in-memory fallback convention as `games/sessionStore.ts`), keyed per
  `gameId:mode:region` so unrelated matchmaking requests never mix; a ticket is only popped once at
  least 2 are queued (returns `SEARCHING` + queue length until then), at which point a `GameServer`
  is allocated — reusing an existing `READY` server in that region with spare capacity, or creating
  one — and every popped ticket flips to `MATCHED` with `sessionId` set to the server's id. Live
  events have no owning-user column of their own, so authorization is derived from what they're
  scoped to: the referenced game/world's owner may create one for it, and a platform-wide event
  (neither `gameId` nor `worldId` set) requires an `admin`/`platform_admin` role.

## Modules added by the marketplace/economy agent

`marketplace`, `products`, `licensing`, `payments`, `subscriptions`, `orders`, `royalties`,
`search`, `recommendation`, `moderation` — the full creator-economy surface (§9/§4/§5/§14).

- **products** (`src/modules/products/`) — `GET /products/:slug`, `POST /products`,
  `PATCH /products/:id` (publish/delist fan-out: indexes/deindexes search, publishes
  `PRODUCT_LISTED`/`PRODUCT_UPDATED`/`PRODUCT_DELISTED`), `POST|GET /products/:id/versions`.
  `license.ts` is the license builder (preset + flag overrides → a `LicenseRecord`), `slug.ts` a
  generic unique-slug minter, `engine.ts` the engine-compatibility predicate (WEB is a universal
  fallback target). `serializeProduct`/`indexProduct` are exported for reuse by `search` and
  `marketplace`.
- **marketplace** (`src/modules/marketplace/`) — `GET /marketplace/search` (§14-ranked, via
  `search/productSearch.ts`'s shared candidate resolver + `recommendation/rank.ts`),
  `GET /marketplace/map` (the WORLDS/GAMES/ASSETS → genre → items spatial tree, `spatialMap.ts`,
  pure/unit-tested), `GET /marketplace/featured`, reviews (`POST|GET /products/:id/reviews`, with
  `reviewHeuristics.ts`'s manipulation scoring routing suspicious ones into the moderation queue
  and a fake-engagement scan over the product's whole review history), wishlist
  (`POST|GET|DELETE /wishlist`), and cart (`GET /cart`, `POST /cart/items`,
  `DELETE /cart/items/:id`).
- **licensing** (`src/modules/licensing/`) — `GET /licenses/:id`, `GET /licenses/product/:productId`
  (creator/admin only — grants carry buyer identity), `POST /licenses/check` wrapping
  `@sonic-gameworld/world-schema`'s `checkLicenseCompatibility` (GREEN/YELLOW/RED) over an explicit
  `licenses[]` and/or resolved `productIds[]`.
- **payments** (`src/modules/payments/`) — `POST /payments/checkout` and `POST /payments/webhook`
  (Stripe signature verification via a scoped raw-body content-type parser, or a best-effort mock
  event shape when Stripe isn't configured). `provider.ts` is the `PaymentProvider` interface with
  `StripeProvider` (real Checkout Sessions, lazily-imported SDK) and `MockProvider` (always
  succeeds synchronously) for both one-off and subscription checkout.
- **subscriptions** (`src/modules/subscriptions/`) — `POST /subscriptions` (tier change; free tier
  activates instantly, paid tiers go through the payment provider), `GET /subscriptions/me`
  (a virtual STARTER subscription when the user has none), `DELETE /subscriptions/me`. Downgrades
  run `app.quotas.assert*Quota` first and are rejected if current usage wouldn't fit the new tier.
- **orders** (`src/modules/orders/`) — `POST /orders` (from an explicit item list or the caller's
  cart), `GET /orders`, `GET /orders/:id`, `POST /orders/:id/refund` (full or partial), `GET
  /library`. `fulfillment.ts` is the single "order paid" / "order refunded" pipeline (shared by the
  MockProvider's synchronous path and the Stripe webhook): royalty accrual → `ProductLicense` grant
  → `Product.sales` increment → `PLAYER_PURCHASED_ASSET`/`ORDER_PAID` → anti-fraud checks, and its
  refund-side inverse (royalty reversal + refund-abuse check).
- **royalties** (`src/modules/royalties/`) — `split.ts`: creator share = `100 - PLAN[tier].feePct`,
  computed on the *selling creator's* tier (exhaustively unit-tested per tier, including the
  cents-never-lost-to-rounding property). `accrual.ts` is the write-side (`accrueRoyalty`,
  `reverseRoyaltyForOrderItem`) called from `orders/fulfillment.ts`. `GET /royalties/me`,
  `GET /royalties` (admin) expose the ledger — there's no separate `CreatorBalance` counter; a
  balance is always computed on read from `RoyaltyAccrual`/`Payout` rows.
- **search** (`src/modules/search/`) — `GET /search?q=&category=&genre=&engine=`. `productSearch.ts`
  holds the shared "which published products match these filters" resolver (OpenSearch/ILIKE via
  `app.searchService` when `q` is set, a plain filtered scan otherwise) plus an in-memory cursor
  paginator — both reused by `marketplace/index.ts`'s ranked search. Array-valued fields
  (`genre`/`engines`) are filtered in JS rather than via a Prisma `where`, so the same code path is
  correct against both real Postgres and `fakePrisma` (which doesn't implement array `has`).
- **recommendation** (`src/modules/recommendation/`) — `rank.ts` is the pure, exhaustively-tested
  §14 `rankProduct` formula plus reusable component derivations (`recencyScore`, `conversionScore`,
  `retentionScore`, `compatibilityScore`, `userPrefScore`). `index.ts` is the policy layer:
  `GET /recommendations` (purchase history → genre affinity → ranked, excluding already-owned
  products) and `GET /recommendations/similar/:productId` (pgvector cosine over
  `SearchDocument.embedding` when populated — never throws, just returns `[]` so the caller falls
  back — else a tag/genre Jaccard-overlap + category-match heuristic).
- **moderation** (`src/modules/moderation/`) — `GET /moderation/queue`, `POST /moderation/report`,
  `POST /moderation/:id/resolve` (rejecting a `PRODUCT` delists it). `fraud.ts` is the anti-fraud
  module: pure `compute*`/`detect*` risk scorers (payment risk, purchase anomaly/self-dealing,
  refund abuse, fake engagement) plus `raiseFraudSignal` (files a `ModerationItem` + publishes
  `FRAUD_SIGNAL`) and `placePayoutHold`/`hasActivePayoutHold`. Called from `orders/fulfillment.ts`
  (purchase anomaly + payout holds), `payments/index.ts` (checkout risk), and `marketplace/index.ts`
  (fake-engagement scan after each new review).

## Testing infra (`src/test/`)

- `fakePrisma.ts` — a generic in-memory stand-in for the whole generated `PrismaClient`: every
  model gets `findUnique/findFirst/findMany/create/createMany/update/updateMany/upsert/delete/
  deleteMany/count/aggregate/groupBy`, with `where` (equality, `null`-matches-unset, `in`/`notIn`/
  `not`/`gte`/`lte`/`gt`/`lt`/`contains`/`startsWith`/`endsWith`/`mode: insensitive`, `AND`/`OR`/
  `NOT`, and Prisma-style compound-unique keys), `orderBy`, `take`/`skip`/`cursor` pagination,
  one-level `include` via the `<name>Id` foreign-key convention, and `$transaction(array|fn)`.
  Read the file header before relying on a behavior it doesn't call out — in particular, it only
  auto-fills `id`/`createdAt`/`updatedAt` on create, not every schema-level `@default(...)`.
- `helpers.ts` — `buildTestApp()` wires `buildApp()` to a fresh `fakePrisma` + memory event bus via
  `setPrismaForTests`/`setBusForTests` (no `vi.mock` needed); `devLogin()` is a one-line helper to
  get an authenticated session in a test.

Run `pnpm --filter @sonic-gameworld/api test` to execute:
`creator/reputation.test.ts` (the §14 formula), `developer/webhookDispatcher.test.ts` (HMAC
signature + delivery/failure handling), `auth/auth.test.ts` (dev login → `/auth/me`, API keys),
`test/fakePrisma.test.ts` (the fake's own behaviors); from the worlds/games/npcs/missions/cloud
modules — `worlds/worlds.test.ts` (create → entity add → semantic text, entity-delete cascade,
publish → `Product` draft, `SyntheticProvider` determinism + 50+ entities, and the forge endpoint
end-to-end), `games/games.test.ts` (create → publish → session create/join/end → save → leaderboard,
end-to-end), `npcs/npcs.test.ts` (generator determinism + archetype matching + AI-hook fallback,
the dialogue engine, and generate/chat routes including the DRAFT-vs-ACTIVE visibility rule),
`missions/missions.test.ts` (generator produces a schema-valid `MissionDefinition` — including from
an empty world — references a real matching entity when one exists, and is deterministic; plus the
CRUD/generate routes), `cloud/cloud.test.ts` (queue → match → `GameServer` allocation, per-key queue
isolation, and live-event authorization); and — from the marketplace/economy modules —
`orders/fulfillment.test.ts` (royalty split at every plan tier, end-to-end through
`fulfillPaidOrder` + fakePrisma, plus idempotency), `licensing/check.test.ts`
(GREEN/YELLOW/RED against real product listings), `recommendation/rank.test.ts` +
`recommendation/recommendation.test.ts` (the §14 formula and the purchase-history/tag-overlap
policy around it), `moderation/fraud.test.ts` (including the refund-abuse trigger),
`royalties/split.test.ts`, `marketplace/marketplace.test.ts` (wishlist/cart/reviews),
`marketplace/reviewHeuristics.test.ts`, `marketplace/spatialMap.test.ts`, `search/search.test.ts`;
and `ai/ai.test.ts` (mock-provider `POST /ai/command` end-to-end — spawn/weather/tracking/boss-arena
commands, a `PERMISSION`-denied tool for a downgraded `viewer` session, world-access rejection,
voice input, and the `AIExecution`/`AIUsage` audit trail — plus `POST /ai/generate` for all four
kinds, including the cyberpunk-city example from CONTRACTS.md §8, and `GET /ai/tools`).

## Appending a module (read this if you're another agent)

`src/modules/registry.ts` is the **only** file you touch outside your own module directory:

1. Build your domain in `src/modules/<your-domain>/index.ts`, exporting one async function
   matching `ModuleRegistrar` from `src/types.ts`:

   ```ts
   import type { FastifyInstance } from 'fastify';

   export async function registerWorldsModule(app: FastifyInstance): Promise<void> {
     app.get('/worlds', { preHandler: [app.authenticate] }, async (request) => {
       // app.db, app.bus, app.redis, app.storage, app.searchService, app.config, app.quotas,
       // app.authenticate, app.requireRole(...), app.requirePermission(...) are all
       // already available — see src/types.ts for the full decorator surface.
     });
     // Register paths relative to the module — the /v1 prefix is applied by app.ts, so use
     // '/worlds/:id', never '/v1/worlds/:id'.
   }
   ```

2. In `src/modules/registry.ts` — and only there — add one import and append your registrar to
   the `MODULES` array:

   ```ts
   import { registerWorldsModule } from './worlds/index.js';
   // ...
   export const MODULES: ModuleRegistrar[] = [
     registerHealthModule,
     // ...existing entries, unchanged...
     registerAnalyticsModule,
     registerWorldsModule, // <-- appended here, at the bottom
   ];
   ```

Don't reorder or remove existing entries, and don't edit any other file in this package to wire
your module in — everything a registrar needs is already on `app` by the time `MODULES` runs.

## Known cross-package notes

- This package does not depend on `@sonic-gameworld/gameworld-sdk`, but every response shape here
  was deliberately matched field-for-field against that package's `src/types.ts` (e.g. `Page<T>`,
  `AuthSession`, `CreatorPassport`, `Webhook`, `AnalyticsOverview`) so the SDK's types line up with
  what this service actually returns.
- `@prisma/client` in this sandbox is a verification-only shim (see the repo-root tooling notes) —
  every model delegate typechecks but throws if actually called; real behavior against Postgres is
  exercised the moment `pnpm db:generate` is run with real network access. All of this package's
  own tests go through `fakePrisma` instead, so `pnpm test` never touches it.
- **fakePrisma gotcha worth knowing** (bit the marketplace/economy modules twice — fixed there,
  flagging in case it recurs elsewhere): `fakePrisma.create()` only auto-fills `id`/`createdAt`/
  `updatedAt`, never a model's other schema-level `@default(now())` timestamp fields (e.g.
  `ProductLicense.grantedAt`, `WishlistItem.addedAt`, `CartItem.addedAt`, `Payout.requestedAt`).
  Real Postgres fills those in; fakePrisma leaves them `undefined`, and a response serializer
  calling `new Date(row.thatField).toISOString()` on an undefined value throws `RangeError:
  Invalid time value` at request time (a 500, not a typecheck error — nothing catches it statically
  since the field is typed as a required `Date` on the model). Pass every such field explicitly in
  the `data` you write, both in tests and in the route/pipeline code itself. The same pattern was
  also live in `games/index.ts`'s leaderboard-submit handler (`LeaderboardEntry.achievedAt` never
  set on create, so `serializeLeaderboardEntry`'s `.toISOString()` 500'd) — fixed by the
  worlds/games/npcs/missions/cloud agent while building out `games.test.ts`.
- `moderation/fraud.ts`'s `raiseFraudSignal` originally accepted `refKind: 'ORDER'` (and defaulted
  to it), but `ModerationRefKind` (prisma/schema.prisma) has no `ORDER` value — that would have
  thrown a Prisma enum-validation error against real Postgres the first time an order-level fraud
  signal fired (masked here only because fakePrisma doesn't validate enums). Fixed: order-level
  signals now file as `refKind: 'USER'`/`refId: <buyerId>`; `orderId` is still threaded through for
  the `FRAUD_SIGNAL` event payload and the reason text, just never as the ModerationItem's ref.
- `moderation/fraud.ts`'s `RISK_THRESHOLD` was `60`, which made every "should be risky" case in its
  own `fraud.test.ts` fail (the module's realistic two-signal combinations score 40–55). Lowered to
  `40` — see the comment above the constant for exactly which test cases pin it there.
- The `ai` module's `worldStore.ts` had been written against an *assumed* shape for
  `worlds/service.ts` (`getDocument(app, worldId) => WorldDocument`, `putDocument(app, worldId,
  doc, actorId) => {versionId}`) before that file existed. It has since landed with a different
  real signature — `getDocument(db, worldId) => {world, version, document}` and
  `putDocument(db, bus, {worldId, document, userId, summary}) => {world, version, document}`,
  operating on `PrismaLike`/`EventBus` rather than a `FastifyInstance`. Because the hand-off uses a
  dynamic `import()` (deliberately, so `ai` compiles whether or not `worlds` has landed yet — see
  the file's own comment), TypeScript could never have caught the mismatch: it would have
  type-checked fine while silently calling `db.world.findUnique` on a Fastify instance at runtime
  the moment both modules were registered together. Fixed by adapting to the real shape (`ai`-side
  only — `worlds/service.ts` itself wasn't touched). Worth double-checking any other module that
  does the same "probe a sibling module's file via dynamic import" trick once that sibling lands.
- Same `fakePrisma` "only `id`/`createdAt`/`updatedAt` are auto-filled" gotcha noted above bit
  `AIUsage` too: `AIUsage.periodStart` (`@default(now())`) and `.costCents` (`@default(0)`) are
  never auto-filled by the fake, so `pipeline.ts`'s `aIUsage.create()` now passes both explicitly
  (harmless against real Postgres, which would apply the same defaults anyway) — otherwise
  `GET /ai/usage`'s `row.periodStart.toISOString()` 500'd on every fake-backed request.
