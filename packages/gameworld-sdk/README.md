# @sonic-gameworld/gameworld-sdk

Typed fetch client for the Sonic GameWorld OS API (`/v1`, see `docs/CONTRACTS.md` §9). All
frontend apps (`studio`, `marketplace`, `player`, `creator`, `admin`, `developer-portal`) and
other SDK packages (`auth-sdk`, `marketplace-sdk`, `analytics-sdk`, `asset-sdk`, `ai-sdk`) build
on top of this package.

## Install

```bash
pnpm add @sonic-gameworld/gameworld-sdk
```

## Usage

```ts
import { createClient } from '@sonic-gameworld/gameworld-sdk';

const client = createClient({
  baseUrl: 'https://api.sonicgameworld.dev', // or http://localhost:4000 in dev
  token: myJwt, // optional bearer token
  // apiKey: 'gw_live_...', // or an SDK/service API key
});

const { items } = await client.worlds.list({ limit: 20 });
const result = await client.ai.command({ worldId: items[0].id, text: 'start the storm' });

// Realtime: subscribe to world/session/creator topics over `/ws`.
const rt = client.connectRealtime([`world:${items[0].id}`], (msg) => console.log(msg));
rt.close();
```

Errors are thrown as `ApiError` (`{ status, code, message, details? }`), matching the API's
`{ error: { code, message, details? } }` envelope.

## Env vars

None — configuration is passed to `createClient()`.

## Public API

- `createClient(options): GameWorldClient` — `options: { baseUrl, token?, apiKey?, fetch? }`.
- `GameWorldClient` — namespaced methods mirroring every route in CONTRACTS.md §9: `auth`,
  `users`, `orgs`, `creators`, `worlds`, `games`, `sessions`, `assets`, `npcs`, `missions`, `ai`,
  `marketplace`, `products`, `wishlist`, `cart`, `orders`, `library`, `licenses`, `payments`,
  `subscriptions`, `analytics`, `recommendations`, `search`, `notifications`, `moderation`,
  `cloud`, `developer`, `health`. Plus `client.setToken()`, `client.setApiKey()`,
  `client.connectRealtime(topics, onMessage, opts?)`.
- `connectRealtime(topics, onMessage, options)` — standalone realtime helper; uses the browser's
  global `WebSocket` when available, otherwise lazily `import('ws')` in Node (optional peer dep).
- `ApiError`, `HttpClient` — lower-level building blocks re-exported for advanced use.
- All DTO types from `src/types.ts` (re-exported), plus re-exports of the world-schema types
  (`AIToolName`, `WorldDocument`, `LicenseRecord`, etc.) used across the API surface.

## Build & test

```bash
pnpm --filter @sonic-gameworld/gameworld-sdk build
pnpm --filter @sonic-gameworld/gameworld-sdk test
```
