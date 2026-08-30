# Custom claims mapping

## Do you need this at all?

**Probably not, for the API.** `services/api` authorizes every request off its own GameWorld JWT
(`sub`, `roles`, `tier`, `org?` — signed with `JWT_SECRET`, CONTRACTS.md §3), which it mints at
`POST /v1/auth/firebase` by looking up the GameWorld `User` row (by `firebaseUid`) — it never
reads `idTokenResult.claims` from the Firebase token itself for authorization decisions. If your
only use of Firebase is "sign in, then talk to the GameWorld API," you can stop reading here.

Set Firebase custom claims when you have a surface that checks Firebase claims **directly**,
without going through GameWorld's API — the two realistic cases for this platform:

1. A **Firestore/Realtime Database security rule** on some Firebase-native feature (e.g. an
   ephemeral presence/typing-indicator collection for the AI Director chat log) that needs to gate
   access by role/tier without a round-trip to `services/api`.
2. A **client-side UI gate** that wants to branch on role/tier before the first API call resolves
   (e.g. hide a "Creator Dashboard" nav link) — `idTokenResult.claims` is available synchronously
   from the cached ID token, whereas `GET /v1/auth/me` requires a network round-trip. This is a UX
   nicety only; never treat a client-visible custom claim as an authorization boundary on its own,
   since a client can send a stale token — the API's own `roles`/`tier` check is always the real
   gate.

## Mapping

| GameWorld (`User` row / GameWorld JWT) | Firebase custom claim | Type | Notes |
|---|---|---|---|
| `User.roles` (`Role[]`: `owner\|admin\|editor\|viewer\|player\|moderator\|platform_admin`) | `roles` | `string[]` | Copied verbatim — same enum values as `@prisma/client`'s `Role`. |
| `User.tier` (`PlanTier`) | `tier` | `string` | One of `STARTER\|CREATOR\|PRO\|STUDIO\|ENTERPRISE` (CONTRACTS.md §4). |
| `User.orgId` | `orgId` | `string \| null` | Omit the key entirely when `null` rather than setting it to `null` — smaller claims payload. |
| `User.id` | *(not mapped)* | — | Already available as the token's own `sub`/`uid` — don't duplicate it into a custom claim. |

## Size limit

Firebase cap custom claims at **1000 bytes** (the serialized JSON of the claims object, checked by
`auth.setCustomUserClaims`). The mapping above is small per user (a handful of role strings, one
tier string, one optional org id) and will never come close — but if you extend this mapping later
(e.g. adding permission lists), keep it to identifiers only, never full objects/arrays of records.

## Propagation delay

Custom claims only appear on a **newly issued** ID token — an already-signed-in client keeps its
old claims until its token naturally refreshes (up to 1 hour) or the client calls
`getIdToken(true)` / `getIdTokenResult(true)` to force a refresh. If claims must take effect
immediately (e.g. right after an admin promotes a user to `moderator`), have that action's
success handler force a token refresh client-side rather than waiting on the natural cycle.

## Keeping claims in sync

`User.roles`/`User.tier` change inside `services/api` (role changes via `PATCH /orgs/:id/members/:userId`,
tier changes via the subscription webhook flow in `integrations/stripe`) — Firebase custom claims
don't update themselves. Two options, both fine to use together:

1. **Event-driven (recommended for production):** have the relevant `services/api` handlers
   publish to the event bus (§7) and add a small subscriber (in `workers/` or inline in
   `services/api`) that calls `getAuth().setCustomUserClaims(firebaseUid, {...})` whenever
   `User.roles`/`User.tier` changes for a user with a `firebaseUid`. This is the lowest-latency
   option but means writing that subscriber as part of the identity/auth or workers assignment —
   out of scope for this `integrations/identity` doc, which only owns the *mapping contract* and a
   standalone reconciliation tool.
2. **Scheduled reconciliation (what ships here):**
   [`scripts/sync-custom-claims.mjs`](./scripts/sync-custom-claims.mjs) — a standalone script that
   reads every `User` row with a non-null `firebaseUid` directly from Postgres and calls
   `setCustomUserClaims` for each, skipping users whose claims already match (so it's cheap to run
   frequently, e.g. every 5 minutes via a cron job / Render Cron Job / `workers` scheduled task).
   Good enough on its own for anything that only needs eventual consistency (the UI-gate use case
   above); pair it with the event-driven approach if you add a hard Firestore security rule
   dependency on these claims.

## Reading claims back out (client side)

```ts
const idTokenResult = await firebaseUser.getIdTokenResult();
const roles = (idTokenResult.claims.roles as string[] | undefined) ?? [];
const tier = (idTokenResult.claims.tier as string | undefined) ?? 'STARTER';
```

Unity (Firebase Unity SDK): `user.TokenAsync(true)` returns the raw JWT — decode it client-side
(base64) or, simpler, just call `GET /v1/auth/me` through `GameWorldAuth` after
`LoginWithFirebaseIdToken` completes, which is already exact and always fresh.
