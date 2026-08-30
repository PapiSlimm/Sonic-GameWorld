# Architecture

This expands on the root README's diagrams with component responsibilities, data flow, and the
technology layers behind each. It is descriptive, not binding — `CONTRACTS.md` is the binding
contract; if anything here conflicts with it, `CONTRACTS.md` wins.

## Layers

```
┌───────────────────────────────────────────────────────────────────────────┐
│  CLIENTS                                                                   │
│  6 Next.js apps (studio/marketplace/player/creator/admin/developer-portal)│
│  + Unity SDK (com.sonicgameworld.sdk) + Unreal plugin (SonicGameWorld)    │
└───────────────────────────────┬───────────────────────────────────────────┘
                                 │  REST (/v1/*) + WebSocket (/ws)
                                 │  @sonic-gameworld/gameworld-sdk (web) or native HTTP (Unity/Unreal)
┌───────────────────────────────▼───────────────────────────────────────────┐
│  services/api  — ONE modular Fastify 5 service (not microservices)        │
│  Domains as modules: auth · identity · creator · worlds · games · assets ·│
│  npcs · missions · ai · marketplace · licensing · payments · analytics ·  │
│  recommend · search · notifications · moderation · cloud · developer      │
└───┬──────────────┬──────────────┬──────────────┬──────────────┬──────────┘
    │              │              │              │              │
    ▼              ▼              ▼              ▼              ▼
Postgres 16    Redis 7 +      S3-compatible   OpenSearch    Stripe
+ PostGIS      BullMQ         storage         (ILIKE        (Checkout +
+ pgvector     (queues +      (assets, GLB,   fallback if   Connect)
(Prisma 6)     event bus      thumbnails)     unset)
               `redis` driver)
                    │
                    ▼
          @sonic-gameworld/events bus
          (drivers: memory/redis/pubsub/kafka)
                    │
        ┌───────────┼──────────────────────────────┐
        ▼           ▼                              ▼
  workers/*   (6 BullMQ workers, one queue each, consuming events + direct jobs)
  asset-processing · ai-generation · thumbnails · builds · moderation · analytics
```

## Component responsibilities

### `services/api` — the modular monolith

One Fastify 5 process. Domains live as separate modules under `src/modules/*` — each owns its
routes, its slice of the Prisma schema, and its own tests — but they share one process, one
database connection pool, and one deploy artifact. This is a deliberate CONTRACTS.md choice
(§1, §23) over a microservices split: it trades independent scaling per domain for radically
simpler operations at this stage, while keeping the module boundaries clean enough to peel a
domain out into its own service later if one genuinely needs to scale independently (the AI
orchestrator and the asset pipeline are the most likely first candidates, which is part of why
asset processing is already a separate worker fleet rather than inline in the API).

Cross-cutting concerns (auth, rate limiting, CORS, WebSocket upgrade, request-scoped Prisma client,
event bus handle) are wired once at the Fastify instance level and injected into every module via
decorators (`fastify.authenticate`, `fastify.requireRole`, `request.user`).

### Identity & auth

Three credential paths converge on the same GameWorld JWT (HS256, `{sub, org?, roles, tier}`):

1. **Dev login** (`POST /v1/auth/dev`) — email only, no password, gated to `NODE_ENV !== 'production'`.
2. **Firebase** (`POST /v1/auth/firebase`) — a Firebase ID token is verified server-side via
   firebase-admin and exchanged for a GameWorld JWT; Firebase is a credential front door, not the
   platform's source of truth for roles/tier (see `integrations/identity/custom-claims-mapping.md`).
3. **API keys** (`x-api-key: gw_live_...`) — for SDKs, Unity, and Unreal, resolved server-side to
   the same `AuthContext` shape as a JWT so every downstream module treats all three paths
   identically.

RBAC is role-string based (`owner|admin|editor|viewer|player|moderator|platform_admin`), checked
per-route via `fastify.requireRole(...)`, not a separate permissions service.

### The AI orchestrator

**AI never mutates state directly.** Every AI-driven change flows through one pipeline:

```
natural language ──▶ AI provider ──▶ ToolCall[] ──▶ Permission check ──▶ Validator ──▶ Executor ──▶ DomainEvent
   (POST /ai/command)  (anthropic/          (zod-typed,     (world:write,   (bounds,      (mutates    (AI_TOOL_EXECUTED,
                        gemini/mock)         20 tool names)   world:publish…)  quotas,       Prisma,     published on
                                                                               license       returns     the event bus)
                                                                               compat)       events[])
```

The provider layer is swappable (`AIProvider.complete({system, messages, tools}) -> {text,
toolCalls[]}`); the `mock` provider parses a small set of English patterns into deterministic tool
calls so the entire AI Director experience — Studio's command bar, NPC dialogue, mission
generation — works end-to-end with zero API keys, which is what makes `pnpm dev` require no
secrets. Every execution is persisted (`AIExecution`, `AIUsage`) regardless of provider, so usage
metering and the execution log in Studio work identically against mock or live providers.

### The world model — GameWorld Asset Format

`@sonic-gameworld/world-schema` is the single source of truth for what a "world" is: a
`WorldDocument` (layers, entities, environment, missions, cameras, systems, license dependencies)
expressed as engine-agnostic, zod-validated JSON. Every producer and consumer in the system reads
or writes this same document shape:

* `services/api` stores it as a Prisma `Json` column (`WorldVersion.document`) and is the
  authoritative read/write path (`GET/PUT /worlds/:id/document`).
* `packages/spatial-engine` renders it in the browser (Three.js) for Studio, Market's product
  previews, and Player's web runtime.
* `integrations/unity`'s `GameWorldWorldLoader` parses the identical JSON into Unity GameObjects
  (GLB payloads via glTFast when present).
* `integrations/unreal`'s `GameWorldLoader` parses the same JSON into Unreal actors
  (`AGameWorldWorldActor`/`AGameWorldEntityActor`), including the coordinate-system conversion
  (Y/Z swap, handedness negation, meters→centimeters) that Unreal requires and Unity/Three.js do
  not.

Because every engine target consumes the exact same wire format, a world (or a licensed asset
inside one) built in Studio is playable through the web runtime, Unity, or Unreal without a
format-specific export step — the "engine-agnostic format" the assignment brief calls out.

### Licensing & the Asset Passport

Every asset carries an `AssetPassport` (provenance, `LicenseRecord`, modification history, AI
provenance if generated) that travels with it through the marketplace, into a purchaser's world,
and into both the Unity and Unreal SDKs. `checkLicenseCompatibility` runs the same GREEN/YELLOW/RED
logic in three places: server-side (`GET /licenses/check`, the authoritative gate before publish),
and offline in both `GameWorldLicense.CheckCompatibilityLocal` (Unity, C#) and
`UGameWorldLicensing::CheckCompatibilityLocal` (Unreal, C++) — the offline copies are a
deliberate, exact port of the server logic so a creator gets the same answer with no network
round-trip while iterating in-editor, at the cost of needing to keep three implementations in sync
if the compatibility rules ever change.

### Events, workers, and eventual consistency

`@sonic-gameworld/events` defines 34 `EventType`s and one `EventBus` interface with four drivers
(`memory` for tests/local dev, `redis` streams for a single-region deploy, `pubsub` for the GCP
Terraform path, `kafka` as a future high-throughput option). `services/api` publishes; the six
`workers/*` processes and other API modules subscribe. Two fan-out rules from the spec anchor the
design: `PLAYER_PURCHASED_ASSET → billing, creator, analytics, inventory` and `GAME_PUBLISHED →
search, marketplace, recommendation` — a single domain action ripples into several independent
side effects (grant a license, accrue royalty, reindex search, recompute recommendations) without
the originating module needing to know about any of them.

Workers themselves are BullMQ queue consumers, not raw event subscribers, for anything
resource-intensive: `asset-processing` (GLB/texture pipeline), `thumbnails`, `builds`,
`ai-generation`, `moderation`, `analytics`. Each ships as its own package, but
`infrastructure/docker/workers.Dockerfile` bundles all six into one image selectable at runtime via
`WORKER=all|<name>` (see `infrastructure/docker/README.md`), because running six always-on
container services for what's currently light traffic is unnecessary operational overhead — they
can be split back into six deploys later with no code change, just a different `WORKER` value per
service.

### Data platform

* **Postgres 16 + PostGIS + pgvector** via Prisma 6 is the system of record. PostGIS backs
  `WorldRegion.geom` for WorldForge's real-world anchoring; pgvector backs `SearchDocument.embedding`
  for semantic search/recommendations, with both columns nullable so migrations still apply in
  environments (like CI) without those extensions enabled.
* **OpenSearch** is the primary search backend when `OPENSEARCH_URL` is set; unset, `search`
  degrades to Postgres `ILIKE` — a real fallback, not a stub, so local dev and CI need no search
  cluster.
* **S3-compatible storage** (MinIO locally, S3/GCS/R2 in deploy) holds uploaded assets, generated
  variants, and thumbnails behind presigned upload/download URLs — `services/api` never proxies
  file bytes itself.

## Data flow: a purchase, end to end

1. Player clicks buy in `apps/marketplace` → `POST /v1/orders` → `POST /v1/payments/checkout`
   creates a Stripe Checkout Session (or a `MockPaymentProvider` session if no Stripe key is set).
2. Stripe redirects back through `API_BASE_URL` (a **marketplace app** URL — see the root README's
   cross-package notes, issue #3) to a marketplace success route.
3. Stripe's `checkout.session.completed` webhook (raw-body signature-verified) hits
   `POST /v1/payments/webhook`, which calls `fulfillPaidOrder` for `mode: payment` or
   `activateSubscriptionFromWebhook` for `mode: subscription`.
4. Fulfillment publishes `ORDER_PAID` and `PLAYER_PURCHASED_ASSET`; per the fan-out rule above,
   `creator` accrues a royalty (`ROYALTY_ACCRUED`), `analytics` records the sale, `inventory` grants
   the license into the buyer's library, `billing` reconciles the ledger.
5. The buyer's next `GET /v1/library` reflects the purchase; if the product is a world/asset, its
   `AssetPassport` and `LicenseRecord` are now resolvable from within Studio, the Unity SDK, or the
   Unreal plugin identically.
6. On a Connect-onboarded creator's payout (`POST /creators/me/payouts`), `stripe.transfers.create`
   moves funds to their connected account per the 85/15 base split (fee % varies by `PlanTier`,
   `CONTRACTS.md` §4) — see `integrations/stripe/connect-onboarding.md` for the onboarding flow
   this depends on, which does not yet have a corresponding API route (documented there as a gap).

## Deploy topology

Two interchangeable targets build from the same three Docker images
(`infrastructure/docker/{api,workers,web}.Dockerfile`):

* **Render** (`render.yaml`) — managed Postgres + Redis, one API web service, one combined workers
  background service, six web services, all Docker-runtime.
* **GCP** (`infrastructure/terraform/`) — Cloud SQL, Memorystore, GCS+CDN, Pub/Sub, Cloud Run v2 for
  the same three image families, Secret Manager for secrets. See that module's README for where it
  deliberately stops short of production-hardening (no image build/push pipeline, no Cloud Armor,
  local Terraform state by default).

Both targets read from `infrastructure/environments/*.env.example` as the reference for which env
vars exist and what they should contain per environment.
