# @sonic-gameworld/auth-sdk

Thin wrapper over `@sonic-gameworld/gameworld-sdk` scoped to identity/auth routes
(docs/CONTRACTS.md §9 `auth:`, §3 Identity & auth).

## Install

```bash
pnpm add @sonic-gameworld/auth-sdk
```

## Usage

```ts
import { createAuthClient } from '@sonic-gameworld/auth-sdk';

const auth = createAuthClient({ baseUrl: 'http://localhost:4000' });
const { tokens, user } = await auth.dev({ email: 'dev@example.com' }); // NODE_ENV !== 'production' only
const me = await createAuthClient({ baseUrl: 'http://localhost:4000', token: tokens.accessToken }).me();
```

Need more than auth (users/orgs/etc.)? Use `createFullClient(options)` to get the full
`GameWorldClient` from `@sonic-gameworld/gameworld-sdk`.

## Env vars

None.

## Public API

- `createAuthClient(options): AuthClient` — `AuthClient` is `GameWorldClient['auth']`
  (`dev`, `firebase`, `refresh`, `me`, `createApiKey`, `deleteApiKey`).
- `createFullClient(options): GameWorldClient`.
- Re-exported types: `ApiKey`, `ApiKeyCreated`, `AuthContext`, `AuthSession`, `AuthTokens`,
  `CreateApiKeyInput`, `DevLoginInput`, `FirebaseLoginInput`, `PlanTier`, `Role`, `User`,
  `UserPatch`, `ApiError`.

## Build & test

```bash
pnpm --filter @sonic-gameworld/auth-sdk build
pnpm --filter @sonic-gameworld/auth-sdk test
```
