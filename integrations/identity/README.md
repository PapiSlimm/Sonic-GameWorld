# Firebase identity integration

Firebase Authentication is Sonic GameWorld's identity provider for end users (players and
creators signing in from the frontend apps and the Unity/Unreal SDKs). `services/api` never trusts
a Firebase ID token or its claims directly for authorization — it **exchanges** a verified Firebase
identity for GameWorld's own JWT (CONTRACTS.md §3), and GameWorld's own `User.roles`/`User.tier`
columns (not Firebase custom claims) are what every `fastify.requireRole`/`requirePermission`
check in the API is based on.

```
Client SDK (web/Unity/Unreal, Firebase Auth SDK)
  │  signInWithEmailAndPassword / signInWithPopup / signInWithCredential(phone, Google, Apple, ...)
  ▼
Firebase Auth  ──▶  ID token (JWT, signed by Google, ~1 hour lifetime)
  │
  ▼
POST /v1/auth/firebase  { idToken }        (services/api/src/modules/auth, src/plugins/auth.ts)
  │  verifyFirebaseIdToken(): firebase-admin `getAuth().verifyIdToken(idToken)`
  │  find-or-create GameWorld `User` by `firebaseUid` (falling back to matching by verified email)
  ▼
GameWorld JWT  { sub: userId, roles: Role[], tier: PlanTier, org? }   (HS256, JWT_SECRET)
  │
  ▼
Every other GameWorld API call: Authorization: Bearer <GameWorld JWT>
```

Because authorization is GameWorld-JWT-based rather than Firebase-custom-claims-based, **Firebase
custom claims are optional** for the API itself — see [`custom-claims-mapping.md`](./custom-claims-mapping.md)
for the cases where you'd still want them (native Firebase Security Rules on a Firestore/Realtime
Database surface, or any client code that reads `idTokenResult.claims` directly instead of going
through GameWorld's API) and the [`scripts/sync-custom-claims.mjs`](./scripts/sync-custom-claims.mjs)
script that keeps them mirrored from Postgres when you do.

## Docs in this directory

| Doc | Covers |
|---|---|
| [`firebase-setup.md`](./firebase-setup.md) | Creating the Firebase project, enabling sign-in providers, generating a service account, and every `FIREBASE_*` env var `services/api` actually reads. |
| [`custom-claims-mapping.md`](./custom-claims-mapping.md) | The GameWorld `Role[]`/`PlanTier` -> Firebase custom claims mapping, the 1000-byte claims size limit, propagation delay, and when you do/don't need this at all. |
| [`scripts/sync-custom-claims.mjs`](./scripts/sync-custom-claims.mjs) | Standalone Node script: reads `User` rows with a `firebaseUid` from Postgres and sets matching Firebase custom claims. Idempotent, safe to run on a schedule. |

## Env vars (must match `services/api/src/config.ts` exactly)

| Var | Purpose |
|---|---|
| `FIREBASE_PROJECT_ID` | Required. Used both for ID token verification audience checks and as a fallback when no service account JSON is configured (Application Default Credentials). |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | The full service account JSON key, as a **single-line JSON string** (`cert()` credential). Preferred for anywhere that isn't already running on GCP infrastructure with attached default credentials — e.g. Render. |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Alternative to the above: a filesystem path to the service account JSON key file. Convenient for local dev; not usable on most PaaS platforms with no persistent/mountable filesystem. |

> **Cross-check:** the root `.env.example` lists `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
> `FIREBASE_PRIVATE_KEY` — those last two are **not** read by `services/api/src/config.ts`
> (which reads `FIREBASE_SERVICE_ACCOUNT_JSON`/`FIREBASE_SERVICE_ACCOUNT_PATH` instead). Use the
> names in the table above; `infrastructure/environments/*.env.example` already uses them. See
> the root README's cross-package notes for the full list of env var name mismatches found while
> building this integration.
