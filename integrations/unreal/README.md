# Sonic GameWorld Unreal Plugin (`SonicGameWorld`)

Official Unreal Engine plugin for [Sonic GameWorld OS](../../docs/ARCHITECTURE.md) — authenticate,
browse & import from the GameWorld Marketplace, spawn GameWorld Asset Format worlds as actors,
drive worlds with GameWorld AI, and use GameWorld Cloud (sessions/saves/leaderboards) as
backend-as-a-service, all from inside Unreal.

This mirrors the same platform API surface as `@sonic-gameworld/gameworld-sdk` (the TypeScript SDK)
and the Unity SDK (`integrations/unity`) — **one GameWorld platform API, three client SDKs.**

## Install

Copy or symlink this directory into your project's `Plugins/` folder:

```
YourProject/Plugins/SonicGameWorld/   <-  integrations/unreal/SonicGameWorld
```

Then enable it in the Unreal Editor (`Edit > Plugins > Sonic GameWorld`) or add it to your
`.uproject`:

```json
{
  "Plugins": [
    { "Name": "SonicGameWorld", "Enabled": true }
  ]
}
```

### Requirements

* Unreal Engine 5.3+ (uses `Subsystems/GameInstanceSubsystem.h`, `ToolMenus`, and the modern HTTP module).
* No third-party dependencies — built entirely on stock `HTTP`, `Json`/`JsonUtilities`, `Sockets`/`WebSockets` engine modules.
* **Optional (runtime mesh loading):** `SpawnVisual` in `GameWorldLoader.cpp` currently renders kind-appropriate placeholder primitives (a capsule/cylinder for NPCs, a cube for buildings, etc. — using the engine's built-in `/Engine/BasicShapes/*` meshes) for every entity. Wire in a runtime glTF importer (e.g. the community `glTFRuntime` plugin) inside `SpawnVisual` to replace placeholders with real meshes resolved from `assetRef` + `CdnBaseUrl`, the same extension point the Unity SDK uses for glTFast.

## Quick start (C++)

```cpp
#include "GameWorldSubsystem.h"
#include "GameWorldMarketplace.h"
#include "GameWorldLoader.h"

UGameWorldSubsystem* GameWorld = UGameWorldSubsystem::Get(this);
GameWorld->BaseUrl = TEXT("https://api.sonicgameworld.com");
GameWorld->DevLogin(TEXT("me@example.com"));
// GameWorld->OnAuthSuccess / OnAuthError are BlueprintAssignable multicast delegates.

UGameWorldLoader* Loader = UGameWorldLoader::Create(this, GameWorld);
Loader->LoadWorld(this, TEXT("world_123"),
    FGwOnWorldLoaded::CreateLambda([](AGameWorldWorldActor* WorldActor) { /* ... */ }),
    FGwOnLoaderError::CreateLambda([](const FString& Error) { UE_LOG(LogTemp, Error, TEXT("%s"), *Error); }));
```

Every class here is also fully Blueprint-callable (`UGameWorldSubsystem::Get`,
`UGameWorldMarketplace::Create`, `UGameWorldLoader::Create`, ...) with `BlueprintAssignable`
delegates for async results, so none of this requires C++ to use from a Blueprint-only project.

## Editor tooling

`Window > Sonic GameWorld > GameWorld Dashboard` opens a Slate panel with three sections,
mirroring the Unity SDK's `GameWorldWindow`:

* **Login** — dev-login by email (non-production API only) or paste a server API key.
* **Marketplace** — search products and import a `WORLD` product directly into the open level as an `AGameWorldWorldActor`.
* **Publish** — push the open level's `AGameWorldWorldActor::Document` back to the server (`PUT /v1/worlds/:id/document`).

The panel keeps its own editor-lifetime HTTP session (`SGameWorldEditorPanel`) rather than reusing
`UGameWorldSubsystem`, since a `GameInstanceSubsystem` only exists while a game instance (e.g. PIE)
is running — editor tooling needs to work with no Play session active.

## Public API surface

| Class | Purpose |
|---|---|
| `UGameWorldSubsystem` | `GameInstanceSubsystem` entry point (`UGameWorldSubsystem::Get(WorldContextObject)`); owns `BaseUrl`/`ApiKey`, the low-level `SendJsonRequest`/`SendJsonArrayRequest` transport, and auth (`DevLogin`, `LoginWithFirebaseIdToken`, `RefreshSession`, `FetchMe`, `SignOut`) with session persistence to `Saved/SonicGameWorld/session.json`. |
| `UGameWorldMarketplace` | `Search`, `Featured`, `GetProduct`, `AddToCart`, `Checkout`, `ImportProduct` (resolves a `WORLD` product to its `FGwWorldDocument`, ready for `UGameWorldLoader`). |
| `UGameWorldLoader` | `LoadWorld`/`SpawnDocument` — spawns one `AGameWorldWorldActor` plus one `AGameWorldEntityActor` per `FGwWorldEntity`, attached per `parentId` and transformed via `ConvertToUnrealSpace` (GameWorld's right-handed/Y-up/meters -> Unreal's left-handed/Z-up/centimeters), with a kind-appropriate placeholder visual per entity. |
| `UGameWorldAI` | `Command` (the `POST /ai/command` natural-language pipeline), `Generate`, `ListTools`, `ListExecutions`, `GetUsage`. |
| `UGameWorldLicensing` | Server-side `GetLicense`/`GetLicenseForProduct`/`CheckCompatibility`/`GetAssetPassport`, plus a local, synchronous `CheckCompatibilityLocal` for instant UI feedback. |
| `FGameWorldJson` | Hand-written JSON <-> `USTRUCT` (de)serializers for every `FGw*` type — the single source of truth for the wire contract. |
| `FGw*` structs / `EGw*` enums (`GameWorldTypes.h`) | Mirror `@sonic-gameworld/world-schema` 1:1 (`FGwWorldDocument`, `FGwWorldEntity`, `FGwTransform`, `FGwLicenseRecord`, `FGwAssetPassport`, `FGwToolExecution`, ...). Fields typed `Record<string, unknown>` on the TypeScript side are carried as raw JSON strings (`...Json` suffix) since Unreal has no built-in "arbitrary JSON value" `UPROPERTY`. |

Every network call takes success/failure delegates (`FGwOn...` `DECLARE_DYNAMIC_DELEGATE_*`, so
they're assignable from Blueprint) and is fire-and-forget over Unreal's async `HTTP` module — no
blocking calls, no dependency beyond stock engine modules.

### Authentication

* **Player-facing games:** `UGameWorldSubsystem::DevLogin` (dev only) or `LoginWithFirebaseIdToken` (production — pair with the Firebase Unreal plugin to obtain the ID token; see `integrations/identity`).
* **Editor tooling / dedicated servers:** set `UGameWorldSubsystem::ApiKey` to a `gw_live_.../gw_test_...` key (see `integrations/stripe` and the Developer Portal for issuing keys) — every request then sends `x-api-key` instead of a bearer JWT. **Never ship a production API key in a client build**; use it only from the Editor or a server process you control.

## Module layout

```
SonicGameWorld.uplugin
Source/
  SonicGameWorld/            Runtime module (Public/Private): types, JSON, subsystem, marketplace, AI, licensing, loader.
  SonicGameWorldEditor/      Editor module: the GameWorld Dashboard Slate tab (Window > Sonic GameWorld).
```

## Testing

This plugin ships no automation spec (Unreal's `Automation` framework and UBT are not available
in this build environment). It was written to be exercised by Unreal's own Automation Testing
framework (`Test/Framework/Automation.h`, `IMPLEMENT_SIMPLE_AUTOMATION_TEST`) once opened inside
the Editor — recommended smoke tests: (1) `FGameWorldJson` round-tripping a fixture
`FGwWorldDocument` (e.g. one of `packages/world-schema`'s sample worlds, exported to JSON) and
asserting field-for-field equality, (2) `UGameWorldLoader::SpawnDocument` against the same fixture
in an automation test map, asserting `EntityActors.Num()` and parent/child attachment match the
source document, (3) `UGameWorldLoader::ConvertToUnrealSpace` on a few known vectors/quaternions
to lock in the coordinate-system remap.
