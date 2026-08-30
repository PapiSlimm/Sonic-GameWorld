# @sonic-gameworld/worker-builds

BullMQ worker for queue `build.compile`. Compiles a validated `WorldDocument` into:

- a **Web runtime bundle**: `manifest.json` (a compact, per-entity-variant-resolved JSON payload
  the `@sonic-gameworld/spatial-engine`-powered player reads at load time) + a minimal `index.html`
  stub, zipped;
- **Unity / Unreal export packages**: the same kind of manifest paired with a generated loader
  stub (`GameWorldLoader.cs` / `GameWorldLoader.h`+`.cpp`) rendered from templates in
  `src/templates/`, zipped.

Every package is built and zipped fully in memory (`archiver` piping into an in-memory buffer —
see `src/zip.ts`) and uploaded to object storage; the result is recorded on `GameVersion.buildRef`.

## Running

```bash
pnpm --filter @sonic-gameworld/worker-builds dev    # tsx watch
pnpm --filter @sonic-gameworld/worker-builds build  # tsc -> dist/
pnpm --filter @sonic-gameworld/worker-builds start  # node dist/index.js
```

## Environment variables

| Var | Default | Notes |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | BullMQ connection |
| `EVENT_BUS_DRIVER` | `redis` | `memory`\|`redis`\|`pubsub`\|`kafka` |
| `STORAGE_DRIVER` | `s3` | `s3`\|`memory` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` (default `gameworld-builds`), `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `CDN_BASE_URL` | — | S3-compatible object storage |
| `BUILD_WORKER_CONCURRENCY` | `2` | BullMQ concurrency |
| `LOG_LEVEL` | `info` | pino level |

## Job payload

```ts
{
  gameId: string; gameVersionId: string; worldId: string;
  worldVersionId?: string;         // fetched via prisma when worldDocument isn't inlined
  worldDocument?: WorldDocument;   // pass directly to skip the DB round-trip
  engines: EngineTarget[];         // 'WEB' | 'UNITY' | 'UNREAL' | 'GODOT'
  requestedBy?: string;
}
```

**Wired.** `POST /games/:id/publish` (`services/api/src/modules/games/index.ts`) enqueues onto
`build.compile` via `app.queues.buildCompile.add('compile', ...)` right after marking the game
PUBLISHED and creating its marketplace `Product`, passing the game's id, new `GameVersion` id,
`worldId`, and the creator-selected `engines`.

## Public API

- `startWorker(config?)` / `processBuildJob(job, deps)` — same shape as the other workers.
  `processBuildJob` compiles every requested engine independently: **one engine failing does not
  abort the others** (`result.ok` is true only when every requested engine succeeded;
  `result.failures` lists the rest) — a broken Unreal export shouldn't block shipping the Web build.
- `compileEnginePackage(doc, engine, now?)` (`src/compile.ts`) — one engine's manifest + zip.
- `compileManifest(doc, engine, now?)` (`src/manifest.ts`) — the manifest alone (no zipping),
  useful for inspecting what would ship.
- `pickVariant(engine, explicit?, available?)` (`src/variant.ts`) — the per-engine LOD/variant
  selection rule.

## Notable implementation choices

- **Variant selection** (`src/variant.ts`): WEB prefers `WEB→MOBILE→LOW→MEDIUM→HIGH→ULTRA`;
  UNITY/UNREAL invert that (richest first); GODOT sits in the middle. An entity's own
  `assetRef.variant` always wins when set. This worker does **not** join against
  `AssetVariantFile` to confirm a variant was actually generated for a given asset (that would
  require a per-entity DB round-trip this worker doesn't currently make) — `pickVariant` accepts
  an optional `available` list for a caller that has that data, and falls back to the engine's top
  preference otherwise. Noted as a known simplification, not a silent correctness gap: the
  manifest always names *a* valid `AssetVariant`, just not guaranteed-available-on-CDN today.
- **Unity/Unreal loader stubs are genuine, compilable starting points, not placeholders** — they
  parse the manifest, walk entities, convert glTF's right-handed coordinates to each engine's
  convention, and log what they would instantiate. They do **not** pretend to load real geometry:
  actually importing a `.glb` into a running Unity/Unreal scene needs a project-side plugin
  (GLTFast/UnityGLTF, glTFRuntime) this worker can't assume exists, so that step is a clearly
  marked `// TODO` rather than a silent no-op dressed up as a real load.
- **`BUILD_COMPILED`** is not yet one of CONTRACTS.md §7's fixed `EventType` members — this worker
  publishes it anyway via `createEvent`'s generic-string overload (which supports arbitrary event
  types), and flags it here as a proposed addition to that enum rather than quietly extending the
  contract unilaterally.
- **Partial failure is a first-class result shape**, not an exception: `processBuildJob` always
  returns `{ ok, artifacts, failures }` for a validation-passing world; only `startWorker`'s BullMQ
  handler throws (turning any failure into a BullMQ-visible job failure) — `processBuildJob` itself
  never hides a failed engine build behind a job that silently "completed" with fewer artifacts
  than requested.

## Tests

`pnpm --filter @sonic-gameworld/worker-builds test` (vitest):

- `src/variant.test.ts` — per-engine default/explicit/available-narrowed variant selection.
- `src/manifest.test.ts` — manifest carries over world metadata and entities, resolves variants
  per engine, omits `assetUrl` for entities with no `assetRef`.
- `src/compile.test.ts` — each engine's ZIP is well-formed (a hand-rolled ZIP central-directory
  reader asserts the exact expected file names/paths inside, without adding an unzip dependency
  just for tests), including the honest manifest-only fallback for GODOT.
- `src/index.test.ts` — `processBuildJob` end-to-end: multi-engine build records `buildRef` and
  publishes `BUILD_COMPILED`; fetching the document via `worldVersionId` when not inlined; and a
  world that fails `validateWorld` fails every requested engine with no artifacts.
