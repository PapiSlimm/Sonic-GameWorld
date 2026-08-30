# API reference

`services/api` exposes one REST + WebSocket surface under `/v1`, JSON in and out, zod-validated,
with a generated OpenAPI document served at `/docs`. This file is a human-readable map of that
surface (source of truth: `docs/CONTRACTS.md` §9) — the live `/docs` endpoint is authoritative for
exact request/response shapes.

## Conventions

* **Base URL**: `http://localhost:4000/v1` locally; `https://api.sonicgameworld.com/v1` in prod
  (see `infrastructure/environments/prod.env.example`'s `NEXT_PUBLIC_API_URL`).
* **Auth**: `Authorization: Bearer <jwt>` (from dev login or Firebase exchange) or
  `x-api-key: gw_live_...` / `gw_test_...` (SDKs, Unity, Unreal). Unauthenticated requests to a
  protected route get `401`.
* **Success envelope**: raw JSON body — no `{data: ...}` wrapper.
* **Error envelope**: `{ "error": { "code": string, "message": string, "details"?: unknown } }`
  with a non-2xx status.
* **Pagination**: cursor-based — `?cursor=&limit=` in, `{ items: T[], nextCursor: string | null }`
  out. Applies to every list-shaped route below (marked implicitly; not repeated per row).
* **WebSocket**: `GET /ws?token=<jwt-or-api-key>`. Client → server: `{ "op": "SUBSCRIBE", "topic":
  string }`. Server → client: `{ "topic": string, "type": string, "payload": unknown }`. Topics
  follow the pattern `world:<id>`, `session:<id>`, `creator:<id>` and carry world edits, AI
  execution updates, session state changes, and notifications.

## Routes by domain

### Auth

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/dev` | `{ email }` — dev-only login, `NODE_ENV !== 'production'` |
| POST | `/auth/firebase` | Exchange a Firebase ID token for a GameWorld JWT |
| POST | `/auth/refresh` | Refresh an expiring JWT |
| GET | `/auth/me` | Current `AuthContext` |
| POST | `/auth/api-keys` | Issue a new API key |
| DELETE | `/auth/api-keys/:id` | Revoke an API key |

### Identity

| Method | Path | Notes |
|---|---|---|
| GET / PATCH | `/users/:id` | |
| POST | `/orgs` | |
| GET | `/orgs/:id` | |
| POST | `/orgs/:id/members` | |
| PATCH | `/orgs/:id/members/:userId` | |

### Creator

| Method | Path | Notes |
|---|---|---|
| GET | `/creators/:handle` | Public Creator Passport |
| PATCH | `/creators/me` | |
| GET | `/creators/me/dashboard` | Sales, revenue, followers, ratings |
| GET | `/creators/me/reputation` | Deterministic reputation score (CONTRACTS §14) |
| GET | `/creators/me/balance` | |
| POST / GET | `/creators/me/payouts` | Triggers a Stripe Connect transfer; see `integrations/stripe/connect-onboarding.md` for the onboarding prerequisite this route currently assumes but has no dedicated onboarding endpoint for |

### Worlds

| Method | Path | Notes |
|---|---|---|
| POST | `/worlds` | |
| GET | `/worlds` | |
| GET / PATCH / DELETE | `/worlds/:id` | |
| GET / PUT | `/worlds/:id/document` | The `WorldDocument` (GameWorld Asset Format) |
| POST / GET | `/worlds/:id/snapshots` | |
| POST | `/worlds/:id/entities` | |
| PATCH / DELETE | `/worlds/:id/entities/:eid` | |
| POST | `/worlds/:id/publish` | |
| POST | `/worlds/:id/forge` | WorldForge: `{ lat, lon, radiusKm, theme }` — real-world-anchored generation |
| GET | `/worlds/:id/semantic` | `sceneGraphToSemantic` text, the AI's world context |

### Games

| Method | Path | Notes |
|---|---|---|
| POST | `/games` | |
| GET | `/games` | |
| GET / PATCH | `/games/:id` | |
| POST | `/games/:id/publish` | |
| POST | `/games/:id/sessions` | |
| POST | `/sessions/:id/join` | |
| POST | `/sessions/:id/end` | |
| GET | `/sessions/:id` | |
| GET / PUT | `/games/:id/saves/:playerId` | |
| GET / POST | `/games/:id/leaderboard` | |

### Assets

| Method | Path | Notes |
|---|---|---|
| POST | `/assets/upload-url` | Presigned S3-compatible upload URL |
| POST | `/assets` | |
| GET | `/assets` | |
| GET | `/assets/:id` | |
| GET | `/assets/:id/passport` | `AssetPassport` |
| POST | `/assets/:id/versions` | |
| POST | `/assets/:id/publish` | |
| GET | `/assets/:id/variants` | ULTRA/HIGH/MEDIUM/LOW/MOBILE/WEB |

### NPCs & missions

| Method | Path | Notes |
|---|---|---|
| POST | `/npcs` | |
| GET | `/npcs` | |
| GET / PATCH | `/npcs/:id` | |
| POST | `/npcs/:id/chat` | |
| POST | `/npcs/generate` | AI-assisted NPC creation |
| POST | `/missions` | |
| GET | `/missions` | |
| GET / PATCH | `/missions/:id` | |
| POST | `/missions/generate` | AI-assisted mission creation |

### AI

| Method | Path | Notes |
|---|---|---|
| POST | `/ai/command` | `{ worldId, text, mode?, voice? }` — the AI Director entry point (CONTRACTS §8) |
| POST | `/ai/generate` | Direct asset/content generation (no tool pipeline) |
| GET | `/ai/tools` | List available `AIToolName`s and their schemas |
| GET | `/ai/executions` | Paginated `AIExecution` log |
| GET | `/ai/usage` | Token/cost usage |

### Marketplace

| Method | Path | Notes |
|---|---|---|
| GET | `/marketplace/search` | |
| GET | `/marketplace/map` | Spatial discovery tree: WORLD → CITY → DISTRICT → BUILDING → ROOM → ASSET |
| GET | `/marketplace/featured` | |
| GET | `/products/:slug` | |
| POST / PATCH | `/products` / `/products/:id` | |
| POST | `/products/:id/versions` | |
| POST / GET | `/products/:id/reviews` | |
| POST / GET | `/wishlist` | |
| GET | `/cart` | |
| POST | `/cart/items` | |
| DELETE | `/cart/items/:id` | |
| POST / GET | `/orders` / `/orders/:id` | |
| POST | `/orders/:id/refund` | |
| GET | `/library` | Purchased products |

### Licensing

| Method | Path | Notes |
|---|---|---|
| GET | `/licenses/:id` | |
| POST | `/licenses/check` | The GREEN/YELLOW/RED compatibility engine — same logic ported offline into the Unity and Unreal SDKs |
| GET | `/licenses/product/:productId` | |

### Payments

| Method | Path | Notes |
|---|---|---|
| POST | `/payments/checkout` | Stripe Checkout (or `MockPaymentProvider`) |
| POST | `/payments/webhook` | Raw-body, signature-verified — see `integrations/stripe/webhook-events.md` |
| POST | `/subscriptions` | |
| GET / DELETE | `/subscriptions/me` | |

### Analytics, search, recommendations, notifications, moderation, cloud, developer

| Method | Path | Notes |
|---|---|---|
| POST | `/analytics/events` | |
| GET | `/analytics` / `/analytics/creator` / `/analytics/game/:id` | |
| GET | `/recommendations` / `/recommendations/similar/:productId` | |
| GET | `/search?q=&category=&genre=&engine=` | Postgres `ILIKE` fallback when `OPENSEARCH_URL` unset |
| GET | `/notifications` | |
| POST | `/notifications/:id/read` | |
| GET | `/moderation/queue` | |
| POST | `/moderation/:id/resolve` | |
| POST | `/moderation/report` | |
| POST | `/cloud/matchmake` | |
| GET / POST | `/cloud/live-events` | |
| GET | `/cloud/servers` | |
| GET / POST | `/developer/webhooks` | |
| GET | `/developer/integrations` | |

### Health

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Liveness — used as `render.yaml`'s `healthCheckPath` |
| GET | `/ready` | Readiness (DB/Redis reachable) |
| GET | `/metrics` | |

## Events published (for context, not directly callable)

`services/api` and `workers/*` communicate over `@sonic-gameworld/events` (34 `EventType`s), not
over these REST routes. See `docs/ARCHITECTURE.md`'s "Events, workers, and eventual consistency"
section and `docs/CONTRACTS.md` §7 for the full type list and fan-out rules — most relevantly:
`PLAYER_PURCHASED_ASSET → billing, creator, analytics, inventory` and `GAME_PUBLISHED → search,
marketplace, recommendation`.
