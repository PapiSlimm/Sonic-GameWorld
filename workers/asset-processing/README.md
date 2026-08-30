# @sonic-gameworld/worker-asset-processing

BullMQ worker that runs the full asset ingestion pipeline for the marketplace (CONTRACTS.md §13):

```
UPLOAD → MALWARE_SCAN → FILE_VALIDATION → METADATA_EXTRACTION → LICENSE_VALIDATION → 3D_VALIDATION
→ OPTIMIZATION → LOD_GENERATION → TEXTURE_OPTIMIZATION → THUMBNAILS → PREVIEW_BUILD
→ COMPATIBILITY_CHECK → AI_TAGGING → QUALITY_SCORE → CREATOR_APPROVAL → MARKETPLACE
```

Queue: `asset.process` (`QUEUE_NAMES.ASSET_PROCESS`). Every stage is an independently testable
`Stage { name, run(ctx) }` (see `src/stages/*.ts`); `src/index.ts` only wires up infrastructure
(Redis, Prisma, the event bus, object storage) and drives the BullMQ `Worker` loop.

## Running

```bash
pnpm --filter @sonic-gameworld/worker-asset-processing dev    # tsx watch
pnpm --filter @sonic-gameworld/worker-asset-processing build  # tsc -> dist/
pnpm --filter @sonic-gameworld/worker-asset-processing start  # node dist/index.js
```

`prisma:generate` regenerates `@prisma/client` from the shared schema at
`../../services/api/prisma/schema.prisma` (see that package for migrations — this worker never
owns the schema).

## Environment variables

| Var | Default | Notes |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | BullMQ connection |
| `EVENT_BUS_DRIVER` | `redis` | `memory`\|`redis`\|`pubsub`\|`kafka` — see `@sonic-gameworld/events` |
| `STORAGE_DRIVER` | `s3` | `s3`\|`memory` (memory is for local dev/tests only) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `CDN_BASE_URL` | — | S3-compatible object storage (AWS/MinIO/R2) |
| `ASSET_WORKER_CONCURRENCY` | `2` | BullMQ worker concurrency |
| `AUTO_APPROVE_ASSETS` | `true` | `false` pauses every job at `CREATOR_APPROVAL` (`WAITING`) until a follow-up job with `forceApprove: true` resumes it |
| `ANTHROPIC_API_KEY` | — | Optional: enables the AI tagging provider for `AI_TAGGING`; falls back to keyword extraction on any failure or if unset |
| `LOG_LEVEL` | `info` | pino level |

## Job payload (`JobPayload`)

```ts
{
  assetId: string; versionId: string; fileKey: string; fileName: string;
  mimeType: string; sizeBytes: number; creatorId?: string;
  resumeFromIndex?: number;   // resume a WAITING job from a given stage index
  forceApprove?: boolean;     // bypass AUTO_APPROVE_ASSETS on resume
}
```

## Public API

- `startWorker(config?)` — boots the real BullMQ `Worker`, a `Queue` for `asset.thumbnail`
  hand-off, Prisma, and the event bus. Returns `{ worker, thumbnailQueue, connection, bus, close() }`.
- `processJob(job, deps)` / `buildContext(job, deps)` — drive one job through the pipeline against
  injected dependencies, without BullMQ/Redis. This is what the test suite uses.
- `runPipeline(ctx, stages, startIndex?)` (`src/pipeline.ts`) — runs an ordered `Stage[]`, persisting
  `AssetVersion.pipeline` (JSON) after every stage so a crash mid-pipeline loses at most one stage
  of progress. Stops early on `FAILED` (rejects the asset) or `WAITING` (creator-approval gate).
- `PIPELINE` (`src/stages/index.ts`) — the ordered stage list, and each stage is exported
  individually for direct unit testing.
- `computeQualityScore(metrics)` (`src/quality.ts`) — pure 0–100 scoring function.
- `scanBuffer(buffer, fileName)` / `zipExpansionRatio(buffer)` (`src/malware.ts`) — dependency-free
  malware heuristics (magic-byte signature checks, extension allowlist, zip-bomb expansion ratio).
- glTF helpers (`src/gltf.ts`): `loadDocument`, `computeMetrics`, `findDegenerateGeometry`,
  `findMissingTextures`, `optimizeDocument`, `simplifyClone`, `writeGLB`, `VARIANT_RATIOS`,
  `VARIANT_TEXTURE_MAX_PX`.

## Notable implementation choices

- **LOD_GENERATION** uses the real `meshoptimizer` WASM decimator via `@gltf-transform/functions`'
  `simplify()` when the module resolves. If it fails to load in a given environment, the stage does
  **not** silently fabricate decimated geometry — it reports `SKIPPED_NO_DECIMATOR` with
  ratio-based *estimated* triangle counts, clearly labeled as estimates.
- **TEXTURE_OPTIMIZATION** is where variant files actually become durable artifacts (uploaded GLBs
  per `AssetVariant`, recorded as `AssetVariantFile` rows) — `LOD_GENERATION` only produces
  in-memory `Document`s.
- **THUMBNAILS** does not render anything itself; it enqueues onto `asset.thumbnail`
  (`@sonic-gameworld/worker-thumbnails` owns rendering).
- **CREATOR_APPROVAL** is a real pause/resume gate, not a rubber stamp: with
  `AUTO_APPROVE_ASSETS=false` a job returns `WAITING`, and a later job carrying
  `{ resumeFromIndex, forceApprove: true }` continues from exactly that stage.
- **Malware scanning** has no network egress / external AV engine — it's magic-byte signature
  detection, extension/content cross-checks, and ZIP Central-Directory expansion-ratio analysis
  (catches zip bombs without inflating them).

## Tests

`pnpm --filter @sonic-gameworld/worker-asset-processing test` (vitest). Highlights:

- `src/pipeline.test.ts` builds a tiny GLB **in-memory** with `@gltf-transform/core` (no fixture
  files) and runs it through the real 16-stage pipeline against an in-memory Prisma fake, event
  bus, and object store — asserting full completion, resume-from-index, and the
  `CREATOR_APPROVAL` wait/resume gate. A second case feeds a 100%-degenerate mesh and asserts the
  pipeline fails fast at `3D_VALIDATION`.
- `src/malware.test.ts` hand-assembles a ZIP whose Central Directory declares a huge
  expansion ratio and asserts it's rejected as a zip bomb, plus extension-allowlist and
  disguised-executable cases.
- `src/quality.test.ts` asserts `computeQualityScore` is bounded to [0, 100] and monotonic in
  every individual input metric.
