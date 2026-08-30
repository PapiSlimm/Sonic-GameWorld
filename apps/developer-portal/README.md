# @sonic-gameworld/developer-portal

GameWorld Developer Portal — API keys, webhooks, interactive API docs, SDK guides (Web/Unity/Unreal)
and a live request sandbox for building on Sonic GameWorld OS. Next.js 15 (App Router), Tailwind,
`@sonic-gameworld/ui`. Runs on **port 3005**.

## Run

```bash
pnpm --filter @sonic-gameworld/developer-portal dev     # http://localhost:3005
pnpm --filter @sonic-gameworld/developer-portal build
pnpm --filter @sonic-gameworld/developer-portal typecheck
pnpm --filter @sonic-gameworld/developer-portal test
```

## Env vars

| Var | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Base URL of `services/api`. Also used to build the `/docs` OpenAPI explorer iframe URL and the quickstart's `curl` examples. |

No secret is baked into the app — sign in with a dev-login email (`POST /v1/auth/dev`, top-right of
the shell) to create real API keys/webhooks against a running API; without signing in, every page
still works fully against demo data.

## Offline-first by design

Every page that talks to the API tries a live call first, through `@sonic-gameworld/gameworld-sdk`,
and falls back to a complete demo dataset the instant a call fails (API not running, endpoint not
implemented, no session). A `Live` / `Demo data` badge shows which is rendering where relevant.
This means `next build` and every page render correctly with zero backend dependency.

## Pages

| Route | Backed by | Notes |
|---|---|---|
| `/` | — | Overview + install/quickstart snippet. |
| `/keys` | `POST /v1/auth/api-keys`, `DELETE /v1/auth/api-keys/:id` | Create/revoke are real when signed in. There is no `GET /v1/auth/api-keys` (list) route, so created-key metadata (never the raw secret, once dismissed) is kept in `localStorage` as the table's source of truth — see "Cross-package gaps". The secret is shown exactly once, at creation, with a copy button. |
| `/webhooks` | `GET/POST /v1/developer/webhooks` | List/create are real. Delete, active/inactive toggle, test-send and the delivery log have no backing route yet (see gaps) and are layered on top as a local overlay per webhook id, clearly usable but not server-persisted. |
| `/docs` | `GET {NEXT_PUBLIC_API_URL}/docs` (iframe) | OpenAPI explorer tab, plus a REST quickstart tab with grouped `curl` + TypeScript (`gameworld-sdk`) examples across auth, worlds, assets, marketplace, ai, moderation, developer and analytics/search. |
| `/sdks`, `/sdks/web`, `/sdks/unity`, `/sdks/unreal` | — | Static install + code-sample guides. Web SDK samples call the real `gameworld-sdk` API surface; Unity/Unreal samples describe the intended C#/C++/Blueprint surface for those (not-yet-shipped-in-this-repo) client packages. |
| `/sandbox` | Any `gameworld-sdk` method the visitor picks | An interactive request builder: pick a preset (health, dev login, worlds.list, marketplace.search, ai.command, moderation.queue, analytics.overview, search), edit its JSON body/query, and send it through the real typed client. On `ApiError` the real status/code/message/details are shown; if the API is unreachable entirely, a labeled canned demo response is shown instead so the sandbox is still useful offline. |

## Cross-package gaps found while building this app

CONTRACTS.md §9 and the current `gameworld-sdk` don't yet expose everything the assignment calls
for as real REST routes. Recorded here rather than invented:

1. **No `GET /v1/auth/api-keys`** (list) — only create/delete exist, so `/keys` has no
   server-side source of truth to list from; it keeps created-key metadata in `localStorage`.
2. **No webhook update/delete/test-send/delivery-log routes** — CONTRACTS §9's `developer` section
   only has `GET/POST /v1/developer/webhooks` and `GET /v1/developer/integrations`. A real
   implementation would need `PATCH/DELETE /v1/developer/webhooks/:id`,
   `POST /v1/developer/webhooks/:id/test`, and `GET /v1/developer/webhooks/:id/deliveries`.
3. **`gameworld-sdk` re-exports world-schema types but not `@sonic-gameworld/events`' `EventType`
   union** — the webhook event-type multi-select imports `EventType`/`EVENT_TYPES` directly from
   `@sonic-gameworld/events` (already a workspace dependency of this app) instead. Fine as-is, but
   worth aligning with the SDK's stated "one canonical source" goal in a follow-up.
4. **No Unity SDK / Unreal plugin packages exist yet in this monorepo** (only `gameworld-sdk` for
   TypeScript). The `/sdks/unity` and `/sdks/unreal` pages document the intended surface/shape for
   when those packages ship; their code samples are illustrative, not generated from a real package.
