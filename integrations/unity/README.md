# Sonic GameWorld Unity SDK (`com.sonicgameworld.sdk`)

Official Unity Package Manager (UPM) package for [Sonic GameWorld OS](../../docs/ARCHITECTURE.md) —
authenticate, browse & import from the GameWorld Marketplace, load GameWorld Asset Format worlds
into a scene, drive worlds with GameWorld AI, and use GameWorld Cloud as backend-as-a-service, all
from inside Unity.

This mirrors the same platform API surface as `@sonic-gameworld/gameworld-sdk` (the TypeScript SDK)
and the Unreal plugin (`integrations/unreal`) — **one GameWorld platform API, three client SDKs.**

## Install

### Option A — local package (this monorepo / a git submodule)
In your Unity project's `Packages/manifest.json`:

```json
{
  "dependencies": {
    "com.sonicgameworld.sdk": "file:../../sonic-gameworld/integrations/unity/com.sonicgameworld.sdk"
  }
}
```

### Option B — Git URL
```json
{
  "dependencies": {
    "com.sonicgameworld.sdk": "https://github.com/sonic-gameworld/unity-sdk.git#1.0.0"
  }
}
```

### Requirements
* Unity 2022.3 LTS or newer.
* [`com.unity.nuget.newtonsoft-json`](https://docs.unity3d.com/Packages/com.unity.nuget.newtonsoft-json@latest) (pulled in automatically as a dependency).
* **Optional:** [`com.unity.cloud.gltfast`](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@latest) — install it to render real GLB meshes for entities with an `assetRef`. Without it, `GameWorldWorldLoader` renders kind-appropriate primitive placeholders (capsule for NPCs, cube for buildings, etc.) so worlds still load correctly. Once installed, the package auto-detects it via a `versionDefines` entry (`GAMEWORLD_GLTFAST`) — no manual scripting-define setup needed.

## Quick start

```csharp
using SonicGameWorld;

var config = GameWorldConfig.CreateDefault("https://api.sonicgameworld.com");
var client = GameWorldClient.GetOrCreate(config);

StartCoroutine(client.Auth.DevLogin("me@example.com",
    user => Debug.Log($"Signed in as {user.displayName}"),
    err => Debug.LogError(err)));

StartCoroutine(client.Marketplace.Search("cyberpunk city", category: "WORLD",
    onSuccess: results => Debug.Log($"{results.total} results"),
    onError: err => Debug.LogError(err)));

StartCoroutine(client.WorldLoader.LoadWorld("world_123", parent: null,
    onLoaded: (root, doc) => Debug.Log($"Loaded {doc.name} into {root.name}"),
    onError: err => Debug.LogError(err)));
```

A runnable version of the above lives in the **Quick Start** sample
(`Window > Package Manager > Sonic GameWorld SDK > Samples > Import`).

## Editor tooling

`Window > Sonic GameWorld > Dashboard` opens an editor window with three tabs:

* **Login** — dev-login by email (non-production API only) or paste a server API key.
* **Marketplace** — search products and import a `WORLD` product directly into the open scene.
* **Publish** — push the open scene's loaded world document back to the server.

## Public API surface

| Class | Purpose |
|---|---|
| `GameWorldClient` | Entry point; owns `Http`, `Auth`, `Marketplace`, `WorldLoader`, `AI`, `Cloud`, `License`. |
| `GameWorldAuth` | `DevLogin`, `LoginWithFirebaseIdToken`, `Refresh`, `FetchMe`, `CreateApiKey`/`RevokeApiKey`. JWT cached in `PlayerPrefs`. |
| `GameWorldMarketplace` | `Search`, `Featured`, `GetProduct`, `AddToCart`, `Checkout`, `GetLibrary`, `ImportProduct`. |
| `GameWorldWorldLoader` | `FetchDocument`/`SaveDocument`, `LoadWorld`, `Instantiate` — builds a `GameObject` per `WorldEntity`, parented/transformed per the document, with GLB loading via glTFast when present. |
| `GameWorldAI` | `Command` (the `POST /ai/command` natural-language pipeline), `Generate`, `ListTools`, `ListExecutions`, `GetUsage`. |
| `GameWorldCloud` | Sessions, cloud saves, leaderboards, matchmaking, live events, analytics events. |
| `GameWorldLicense` | Server-side `CheckCompatibility` plus a local, synchronous `CheckCompatibilityLocal` for instant UI feedback. |
| `SonicGameWorld.Models.*` | Plain C# DTOs mirroring `@sonic-gameworld/world-schema` 1:1 (`WorldDocument`, `WorldEntity`, `Transform`, `LicenseRecord`, `AssetPassport`, `ToolCall`, ...). |

Every network call is `IEnumerator`-shaped (`StartCoroutine(client.X.Method(...))`) and reports
success/failure via `Action<T>` / `Action<GameWorldApiException>` callbacks — no async/await
dependency, so it works on every Unity scripting backend (Mono and IL2CPP alike).

### Authentication

* **Player-facing games:** `GameWorldAuth.DevLogin` (dev only) or `LoginWithFirebaseIdToken` (production — pair with the Firebase Unity SDK to obtain the ID token, see `integrations/identity`).
* **Editor tooling / dedicated servers:** set `GameWorldConfig.ApiKey` to a `gw_live_...`/`gw_test_...` key (see `integrations/stripe` and the Developer Portal for issuing keys) — every request then sends `x-api-key` instead of a bearer JWT. **Never embed a production API key in a shipped client build**; use it only from the Editor or a server process you control.

## Env vars / config

There are no environment variables — configuration is a `GameWorldConfig` `ScriptableObject`
(`Assets/Create/Sonic GameWorld/Config`) or an inline instance:

| Field | Purpose |
|---|---|
| `BaseUrl` | GameWorld API base URL (no `/v1` suffix — the SDK appends it). |
| `RealtimeUrl` | WebSocket base URL for future realtime topic support. |
| `ApiKey` | Server/editor API key, used when no user JWT is present. |
| `TimeoutSeconds` | Per-request timeout. |

## Testing

This package ships no Unity Test Runner suite (Unity's compiler/test runner is not available in
this build environment). The DTOs and HTTP layer were written to be exercised by Unity's own
EditMode/PlayMode test runner (`com.unity.test-framework`) once opened inside the Unity Editor —
recommended smoke tests: (1) `GameWorldHttp` against a local mock server returning the exact
envelope shapes from `services/api`, (2) `GameWorldWorldLoader.Instantiate` against a fixture
`WorldDocument` (e.g. `packages/world-schema`'s sample worlds, exported to JSON) asserting entity
count and parenting.
