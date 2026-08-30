# Sonic GameWorld OS

**The Spatial Operating System for Creating, Publishing, Discovering, and Monetizing Interactive
Worlds.**

Not an asset store. Not a Unity/Unreal competitor. Sonic GameWorld OS is the ecosystem layer that
connects game creation, AI, worlds, assets, creators, publishing, and player experiences across
engines — web, Unity, and Unreal alike. **The world is the editor.**

Five sub-products, one platform:

| Sub-product | What it is |
|---|---|
| **GameWorld Studio** | The creator workspace — build worlds, NPCs, missions, and cinematics with an AI Director at your side. |
| **GameWorld Market** | The spatial marketplace — discover and license worlds, game kits, characters, and systems through a zoomable map, not a search box. |
| **GameWorld Play** | Player-facing discovery and web runtime for published games, worlds, and live events. |
| **GameWorld Cloud** | The game backend — sessions, matchmaking, saves, leaderboards, live events. |
| **GameWorld AI** | The orchestrator turning natural language into validated, permissioned world edits. |

Sonic GameWorld OS is an independent application inside the V12 Multimedia ecosystem.

## Architecture at a glance

```
                              ┌─────────────────────────────┐
                              │        GOD'S EYE VIEW        │
                              │   (one platform, many doors) │
                              └──────────────┬───────────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
              CREATE (Studio)           PLAY (Player)             SELL (Market)
                    │                        │                        │
                    └────────────────────────┼────────────────────────┘
                                             │
                          WORLDS · GAMES · MARKETPLACE (shared substrate)
```

```
        CREATE / PLAY / TRADE  (Studio, Player, Market — the 3 doors above)
                                       │
                             ┌─────────▼─────────┐
                             │   GAMEWORLD CLOUD  │   sessions · matchmaking · saves ·
                             │   (services/api)   │   leaderboards · live events · realtime WS
                             └─────────┬─────────┘
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
             IDENTITY & AUTH      ECONOMY & LICENSING  AI ORCHESTRATOR
           (JWT / Firebase /      (plans · Stripe ·    (tool pipeline: AI → Tool →
            API keys / RBAC)      payouts · passports)  Permission → Validation → Event)
                    │                  │                  │
                    └──────────────────┼──────────────────┘
                                       │
                             ┌─────────▼─────────┐
                             │   DATA PLATFORM    │   Postgres+PostGIS+pgvector ·
                             │                     │   Redis/BullMQ · OpenSearch · S3
                             └─────────┬─────────┘
                                       │
                             ┌─────────▼─────────┐
                             │ INTELLIGENCE GRAPH │   events bus (34 EventTypes) ·
                             │                     │   analytics · reputation · fraud signals
                             └─────────┬─────────┘
                                       │
                             ┌─────────▼─────────┐
                             │  AI WORLD MODEL     │   GameWorld Asset Format (engine-agnostic
                             │  (world-schema)     │   WorldDocument JSON — the canonical wire format)
                             └─────────┬─────────┘
                             ┌─────────┴─────────┐
                             │                   │
                       UNITY SDK           UNREAL PLUGIN
                    (com.sonicgameworld    (SonicGameWorld
                        .sdk, UPM)          .uplugin, C++)
                             │                   │
                             └─────────┬─────────┘
                                       │
                                   PLAYERS
```

*(Diagrams adapted from SPEC.pdf §24 "The Master Vision" and §60 "The Ultimate Sonic GameWorld
OS"; the monorepo layout below reflects `docs/CONTRACTS.md` §1, which is the binding source of
truth and supersedes SPEC.pdf §40's more aspirational multi-service sketch — one modular
`services/api`, not a service per domain.)*

## Quickstart

```bash
# 1. Copy env defaults (or infrastructure/environments/dev.env.example for the fuller version)
cp .env.example .env

# 2. Start Postgres (PostGIS + pgvector), Redis, and MinIO
docker compose up -d

# 3. Install dependencies (already done once at repo root if you're picking this up mid-build)
pnpm install

# 4. Run migrations, then seed sample data
pnpm db:migrate
pnpm db:seed

# 5. Run every app, service, and worker in dev mode (Turborepo)
pnpm dev
```

No API keys are required to run the full stack locally: unset `ANTHROPIC_API_KEY`/`GEMINI_API_KEY`
falls back to a deterministic `mock` AI provider, and unset `STRIPE_SECRET_KEY` falls back to a
`MockPaymentProvider` — see `docs/CONTRACTS.md` §2 and §8.

### App ports (local dev)

| App | Port | Purpose |
|---|---|---|
| `apps/studio` | 3000 | Creator workspace — scene editor, AI Director, publish flow |
| `apps/marketplace` | 3001 | GameWorld Market — spatial discovery, checkout, storefronts |
| `apps/player` | 3002 | GameWorld Play — discover & play published games/worlds |
| `apps/creator` | 3003 | Creator Passport dashboard — sales, payouts, reputation |
| `apps/admin` | 3004 | Moderation queue, fraud signals, platform admin |
| `apps/developer-portal` | 3005 | API keys, webhooks, OpenAPI explorer, SDK docs |

`services/api` listens on **4000** (`API_PORT`); Postgres on 5432, Redis on 6379, MinIO on 9000
(console 9001) via `docker-compose.yml`.

### Deploying

* **Render** (default target): `render.yaml` at the repo root is a Blueprint spec — one API web
  service, one combined workers background service (`WORKER=all`), six Next.js web services, a
  managed Postgres database, and a Redis instance, wired through two env var groups
  (`gameworld-shared`, `gameworld-secrets`). Push to `main`; `.github/workflows/ci.yml` runs
  typecheck/test/build against real Postgres+Redis service containers, and
  `.github/workflows/deploy.yml` fires the corresponding Render deploy hook once CI is green. See
  `infrastructure/docker/README.md` for the three Dockerfiles it builds from.
* **GCP** (alternative target): `infrastructure/terraform/` is a self-contained skeleton — Cloud
  SQL, Memorystore, GCS+CDN, Pub/Sub, Cloud Run — for the same three Docker images. See
  `infrastructure/terraform/README.md`, including its "design notes" section on where this
  skeleton deliberately stops short of production-hardened.

## Repo map

```
sonic-gameworld/
├── apps/                studio (3000) · marketplace (3001) · player (3002) · creator (3003) ·
│                        admin (3004) · developer-portal (3005)      — Next.js 15, App Router
├── packages/            world-schema · events · spatial-engine · ui · ai-sdk · auth-sdk ·
│                        marketplace-sdk · analytics-sdk · asset-sdk · gameworld-sdk
├── services/
│   └── api/             ONE modular Fastify service; domains as modules, not microservices
├── workers/             asset-processing · ai-generation · thumbnails · builds · moderation ·
│                        analytics                                    — BullMQ + Redis
├── integrations/
│   ├── unity/           com.sonicgameworld.sdk — UPM package (C#)
│   ├── unreal/          SonicGameWorld.uplugin — C++ plugin + editor module
│   ├── stripe/          webhook event catalogue, Connect onboarding doc
│   ├── storage/         S3/GCS/R2/MinIO setup docs + CORS configs
│   └── identity/        Firebase setup, custom-claims mapping, sync script
├── infrastructure/
│   ├── docker/          api.Dockerfile, workers.Dockerfile, web.Dockerfile
│   ├── terraform/       GCP deployment skeleton (Cloud SQL, Redis, GCS/CDN, Pub/Sub, Cloud Run)
│   └── environments/    dev/staging/prod .env templates
├── .github/workflows/   ci.yml, deploy.yml    (this repo's CI — there is no infrastructure/ci/)
├── render.yaml           Render Blueprint (repo root, not under infrastructure/ — Render requires this)
└── docs/                 CONTRACTS.md (binding), SPEC.pdf (product spec), ARCHITECTURE.md, API.md, ROADMAP.md
```

A note on `render.yaml`'s location: `docs/CONTRACTS.md` §1 lists it under `infrastructure/`, but
Render's Blueprint feature only auto-discovers a `render.yaml` at the repository root — it's kept
there for that reason, exactly like `.github/workflows/` sits at the root rather than under
`infrastructure/ci/` because GitHub Actions requires it there. Both are platform constraints
overriding the aspirational layout, not deviations from CONTRACTS.md's intent.

## Cross-package issues (found while building integrations/infrastructure)

These are real inconsistencies in the existing application code — discovered while wiring
deployment and integration configs against it — not typos in the infra files below. Every infra
artifact in this repo (Docker images, `render.yaml`, Terraform, `infrastructure/environments/*`)
works around them by setting **both** conventions to the same value; the underlying application
code (outside this assignment's scope) still needs a real fix.

| # | Issue | Where it shows up |
|---|---|---|
| 1 | `services/api` reads `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/`S3_PUBLIC_URL_BASE`; every `workers/*` reads `S3_ACCESS_KEY`/`S3_SECRET_KEY`/`CDN_BASE_URL` for the identical credentials. | `services/api/src/config.ts` vs. every `workers/*/src/env.ts` |
| 2 | `services/api` reads `FIREBASE_SERVICE_ACCOUNT_JSON`/`FIREBASE_SERVICE_ACCOUNT_PATH`; the pre-existing root `.env.example` instead has `FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY`, which `services/api` never reads at all. | `services/api/src/config.ts` vs. root `.env.example` |
| 3 | `services/api`'s `API_BASE_URL` (despite the API-sounding name) is used only to build Stripe Checkout redirect URLs — a **marketplace app** concern — and must point at the marketplace app's origin, not the API's own. The root `.env.example`'s `API_URL`/`WEB_URL` are both unread by any code. | `services/api/src/modules/payments`, root `.env.example` |
| 4 | `services/api`'s `NODE_ENV` schema only accepts `development \| test \| production` — no `staging` value — forcing any staging environment to choose between dev-login availability and production-only safety checks (JWT secret strength enforcement). Documented in `infrastructure/environments/staging.env.example`. | `services/api/src/config.ts` |
| 5 | `packages/events/src/drivers/pubsub.ts`'s real `PubSubEventBus` publishes every event to **one shared topic** with per-subscriber pull subscriptions, not "one Pub/Sub topic per EventType" as the original assignment brief assumed. `infrastructure/terraform/pubsub.tf` provisions the real topic by default; per-EventType topics are opt-in (`create_per_event_type_topics`) and unused by any current code. | `packages/events/src/drivers/pubsub.ts` |
| 6 | `createEventBusFromEnv()`'s Pub/Sub driver defaults every consumer's `subscriber` option to `'api'` — if every service/worker used the default they'd collide onto one subscription. Terraform's `pubsub_subscribers` list and its README prescribe distinct subscriber names per worker; this is not yet wired up in `workers/*` source. | `packages/events/src/drivers/pubsub.ts`, `infrastructure/terraform/variables.tf` |
| 7 | Every `apps/*` hardcodes its dev-server port via `next start -p <N>` in its own `package.json` `start` script instead of reading `$PORT`, which most PaaS platforms inject dynamically. Worked around in `infrastructure/docker/web.Dockerfile`'s `CMD`, which invokes `next start -p ${PORT:-$APP_PORT}` directly. | every `apps/*/package.json` |
| 8 | None of the 6 Next.js apps set `output: 'standalone'` in `next.config.mjs`, so `web.Dockerfile` ships full production `node_modules` per app image rather than Next's slim standalone bundle — a size optimization opportunity, not a correctness bug. | every `apps/*/next.config.mjs` |

See `infrastructure/environments/README.md` for the condensed version of #1–4 as a table, and each
integration's own README (`integrations/storage/README.md`, `integrations/identity/README.md`,
`integrations/stripe/README.md`) for the naming mismatch as it applies to that specific concern.

## Further reading

* `docs/CONTRACTS.md` — the binding build contract for every package in this repo.
* `docs/ARCHITECTURE.md` — component responsibilities and data flow in more depth.
* `docs/API.md` — the full REST + WebSocket route table.
* `docs/ROADMAP.md` — development phases 1–5 and the first MVP loop.
* `docs/SPEC.pdf` — the full 76-page product spec.
