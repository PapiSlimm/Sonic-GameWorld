# @sonic-gameworld/worker-thumbnails

BullMQ worker for queue `asset.thumbnail`. Consumes the hand-off enqueued by
`worker-asset-processing`'s `THUMBNAILS` pipeline stage, renders a marketplace-grid PNG "card"
(asset name / category / poly count) with `sharp`, uploads it to object storage, and writes the
result back onto `Asset.thumbnailUrl`.

## Running

```bash
pnpm --filter @sonic-gameworld/worker-thumbnails dev    # tsx watch
pnpm --filter @sonic-gameworld/worker-thumbnails build  # tsc -> dist/
pnpm --filter @sonic-gameworld/worker-thumbnails start  # node dist/index.js
```

## Environment variables

| Var | Default | Notes |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | BullMQ connection |
| `EVENT_BUS_DRIVER` | `redis` | `memory`\|`redis`\|`pubsub`\|`kafka` |
| `STORAGE_DRIVER` | `s3` | `s3`\|`memory` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `CDN_BASE_URL` | — | S3-compatible object storage |
| `THUMBNAIL_WORKER_CONCURRENCY` | `4` | BullMQ concurrency |
| `THUMBNAIL_CARD_SIZE_PX` | `512` | Square card resolution |
| `LOG_LEVEL` | `info` | pino level |

## Job payload

Enqueued by `worker-asset-processing` (job name `generate-thumbnail`, `jobId: thumb-<versionId>`):

```ts
{ assetId: string; versionId: string; name: string; category: string; polyCount?: number; sourceKey?: string }
```

## Public API

- `startWorker(config?)` — boots the real BullMQ `Worker` + Prisma + storage. Returns
  `{ worker, connection, bus, close() }`.
- `processThumbnailJob(job, deps)` — renders + uploads + persists one thumbnail against injected
  `{ prisma, storage, config }`, no BullMQ/Redis required. Used directly by the test suite.
- `createThumbnailQueue(connection)` — a typed `Queue<ThumbnailJobPayload>` for `asset.thumbnail`,
  for other services/workers that need to enqueue without re-deriving the queue name/payload shape.
- `renderCardPng({ name, category, polyCount, sizePx })` / `formatPolyCount(n)` (`src/card.ts`) —
  the actual rendering logic, unit-testable in isolation.
- `Renderer`, `RenderSceneOptions`, `RenderSceneResult`, `resolveRenderer()` (`src/renderer.ts`) —
  see below.

## What's real vs. documented-only

**Real, in production use today:** the sharp/SVG card renderer (`card.ts`). It's a genuine
rendering pipeline — background gradient + category badge + name + poly-count label, using the
CONTRACTS.md §12 dark "command-center" design tokens — not a placeholder image. Every asset kind
gets a card; there's no code path that fails to produce one for well-formed input.

**Documented, not implemented:** `renderer.ts`'s `Renderer` interface is the extension point for a
real GPU-backed 3D preview render (load the GLB, frame it, light it, rasterize — the way the
studio's spatial-engine viewport renders live). This plain Node worker container has no GPU
context available (no headless-GL / headless-browser WebGL), and a screenshot-shaped PNG that
isn't actually a render of the model would be worse than being honest about the gap. So:
`UnavailableGpuRenderer.isAvailable()` returns `false`, `resolveRenderer()` returns `undefined`,
and `processThumbnailJob` always falls through to the card renderer. Wiring in a real
implementation later is a one-file change (`resolveRenderer()`); `index.ts` already calls it
through the `Renderer` interface and falls back to the card on any failure.

## Tests

`pnpm --filter @sonic-gameworld/worker-thumbnails test` (vitest):

- `src/card.test.ts` — renders at the requested resolution, handles a missing poly count, escapes
  XML-unsafe names/categories, and asserts different inputs produce different image bytes (i.e.
  it's not silently returning a static fallback).
- `src/index.test.ts` — `processThumbnailJob` end-to-end against `MemoryStorage` + a fake Prisma:
  asserts the uploaded object is a valid PNG at the configured size, `Asset.thumbnailUrl` is
  updated, and re-running for the same asset/version is idempotent (same storage key).
