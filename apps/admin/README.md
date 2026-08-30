# @sonic-gameworld/admin

GameWorld Admin — the trust & safety, fraud review, account management and platform-operations
console for Sonic GameWorld OS. Next.js 15 (App Router), Tailwind, `@sonic-gameworld/ui`. Runs on
**port 3004**.

## Run

```bash
pnpm --filter @sonic-gameworld/admin dev     # http://localhost:3004
pnpm --filter @sonic-gameworld/admin build
pnpm --filter @sonic-gameworld/admin typecheck
pnpm --filter @sonic-gameworld/admin test
```

## Env vars

| Var | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Base URL of `services/api`. |

No API key/secret is baked into the app — the console signs in with a dev-login email
(`POST /v1/auth/dev`, top-right of the shell) and keeps the resulting JWT in `localStorage`.

## Offline-first by design

Every page tries the real API first, through `@sonic-gameworld/gameworld-sdk`, and falls back to a
complete, realistic **demo dataset** the instant a call fails (API not running, endpoint not yet
implemented, no session). A `Live` / `Demo data` badge on each page always shows which one is
rendering. This means `next build` and every page render correctly with zero backend dependency.

## Pages → API mapping

| Route | Backed by | Notes |
|---|---|---|
| `/moderation` | `GET /v1/moderation/queue`, `POST /v1/moderation/:id/resolve` | Real. The 7 admin categories (stolen assets, malware, prohibited content, suspicious files, trademark, copyright similarity, manipulated metadata) are inferred client-side from `reason`/`stage` via `lib/moderation.ts#inferModerationCategory`, since `ModerationItem` carries free text, not a fixed taxonomy. |
| `/fraud` | — | **Demo only.** No `/fraud` route exists in CONTRACTS §9 or the SDK. Payout-hold toggles are staged in `localStorage` (`lib/overrides.ts`). |
| `/users` | `GET /v1/users/:id` (best-effort, when the search box looks like a `user_id`) | No list/search route exists, so the table is a demo directory. Role/tier edits are staged locally — `UserPatch` has no `role`/`tier` field. |
| `/orgs` | `GET /v1/orgs/:id`, `PATCH /v1/orgs/:id/members/:userId` | Member role edits are real. Search is over a demo directory (no org list route). Tier override is staged locally (no `PATCH /v1/orgs/:id`). |
| `/products` | `GET /v1/marketplace/search`, `PATCH /v1/products/:id` | Real — delist/relist toggles `status`, feature toggles `featured`. Falls back to local staging if the write fails. |
| `/payouts` | — | **Demo only.** `creators.listPayouts()` is scoped to the caller; there is no admin-wide payout list/approve/hold route. Approve/hold staged locally. |
| `/flags` | — | **Demo only**, fully local (`localStorage`). No feature-flag route exists. |
| `/observability` | `GET /v1/health`, `GET /v1/ready`, `GET /v1/analytics` | Health/ready tiles and the business-telemetry row (creator activation, asset uploads, world creation, AI usage, marketplace/purchase conversion, retention, revenue, payouts) are real when the analytics module returns matching `totals` keys, and fall back per-metric to demo numbers otherwise. The six "system operations" tiles (logs/metrics/traces/errors/alerts/audit) are demo-only — CONTRACTS §9 only exposes a Prometheus-style `GET /v1/metrics`, not JSON. |

## Cross-package gaps found while building this app

The assignment for `/admin` calls for several capabilities that CONTRACTS.md §9 and the current
`gameworld-sdk` do not yet expose as REST routes. Recorded here rather than invented:

1. **No admin fraud API** (`/fraud` signals feed + payout holds). Would need e.g.
   `GET /v1/admin/fraud/signals`, `POST /v1/admin/fraud/signals/:id/hold`.
2. **No admin user/org directory** (`GET /v1/users`, `GET /v1/orgs` with search/pagination) —
   only single-resource `GET /users/:id` / `GET /orgs/:id` exist.
3. **`UserPatch` has no `role`/`tier` fields** and there is no `PATCH /v1/orgs/:id` for org tier —
   admin overrides of plan tier and platform role have nowhere to persist server-side yet.
4. **No admin-wide payouts endpoint** — `GET/POST /v1/creators/me/payouts` is creator-self-scoped
   only; an admin approve/hold flow needs something like `GET/PATCH /v1/admin/payouts`.
5. **No feature-flag API** at all.
6. **Observability**: no JSON endpoints for logs/traces/errors/alerts/audit (`/v1/metrics` is
   Prometheus text, not admin-dashboard-friendly JSON).

None of these block the console from being fully usable today — every affected screen degrades to
a clearly-labeled local/demo mode — but they're the concrete API surface a follow-up phase should
add.

## Public surface

This is a leaf Next.js app (no package exports). Shared logic lives under `lib/` (typed wrappers
around `@sonic-gameworld/gameworld-sdk` + demo datasets + a small localStorage override store) and
`components/` (the app shell, nav, data-source badge).
