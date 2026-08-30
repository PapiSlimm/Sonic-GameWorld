# @sonic-gameworld/worker-analytics

BullMQ worker for queue `analytics.rollup`. Two jobs, both real:

1. **Hourly rollups** into `PlayerMetric` / `GameMetric` / `AssetMetric` / `CreatorMetric` /
   `MarketplaceMetric` (CONTRACTS.md §13) — see **"Schema gap"** below, this is the one part of
   this worker that can't run against the real database yet.
2. **Creator reputation recompute** (CONTRACTS.md §14) — `CreatorProfile`'s own schema comment
   says it outright: *"Cached reputation breakdown (§14) — recomputed by analytics workers."* This
   part runs against the real, already-existing schema today.

## Running

```bash
pnpm --filter @sonic-gameworld/worker-analytics dev    # tsx watch
pnpm --filter @sonic-gameworld/worker-analytics build  # tsc -> dist/
pnpm --filter @sonic-gameworld/worker-analytics start  # node dist/index.js
```

## Environment variables

| Var | Default | Notes |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | BullMQ connection |
| `EVENT_BUS_DRIVER` | `redis` | `memory`\|`redis`\|`pubsub`\|`kafka` |
| `ANALYTICS_WORKER_CONCURRENCY` | `1` | BullMQ concurrency (rollups aren't parallelizable across overlapping windows) |
| `REPUTATION_LOOKBACK_DAYS` | `90` | Trailing window creator reputation signals are drawn from — independent of the hourly rollup window a given job covers |
| `LOG_LEVEL` | `info` | pino level |

## Job payload

```ts
{ periodStart?: string; periodEnd?: string }  // ISO timestamps; both omitted = "the last fully-completed hour"
```

**Wired.** `services/api/src/app.ts` schedules a BullMQ repeatable job on every boot —
`app.queues.analyticsRollup.add('hourly-rollup', {}, { repeat: { pattern: '0 * * * *' } })` —
guarded by `!config.isTest` so the test suite never opens a real Redis connection for it. BullMQ
dedupes repeatable jobs by their repeat key, so re-registering on every boot is safe and does not
create duplicate schedules.

## Schema gap: PlayerMetric / GameMetric / AssetMetric / CreatorMetric / MarketplaceMetric

These five models are named explicitly in CONTRACTS.md §13 and in the product spec's "Complete
Data Model → Analytics" section, but **do not exist yet** in
`services/api/prisma/schema.prisma` — confirmed by grepping the schema for `Metric` (no matches)
and cross-checking every model name in the file. This worker's assignment is scoped to
`workers/*`, so rather than editing another package's schema unilaterally, it's built against a
`PrismaLike` interface (`src/types.ts`) declaring exactly the five delegates below, with real
aggregation logic feeding them (`src/rollups.ts`, fully unit-tested against plain fixtures) — so
the moment these models are added to the shared schema and `prisma generate` is re-run, **this
worker needs zero code changes** to start writing real rows.

Proposed model definitions (append to `services/api/prisma/schema.prisma`; every one keyed so an
hourly re-run of the same window safely upserts instead of duplicating):

```prisma
model PlayerMetric {
  id              String   @id @default(cuid())
  userId          String
  periodStart     DateTime
  periodEnd       DateTime
  sessionsJoined  Int      @default(0)
  gamesPlayed     Int      @default(0)
  playtimeMinutes Float    @default(0)
  eventsCount     Int      @default(0)
  createdAt       DateTime @default(now())

  @@unique([userId, periodStart])
  @@index([periodStart])
}

model GameMetric {
  id                String   @id @default(cuid())
  gameId            String
  periodStart       DateTime
  periodEnd         DateTime
  sessionsStarted   Int      @default(0)
  sessionsEnded     Int      @default(0)
  uniquePlayers     Int      @default(0)
  playtimeMinutes   Float    @default(0)
  avgSessionMinutes Float    @default(0)
  createdAt         DateTime @default(now())

  @@unique([gameId, periodStart])
  @@index([periodStart])
}

model AssetMetric {
  id            String   @id @default(cuid())
  assetId       String
  periodStart   DateTime
  periodEnd     DateTime
  views         Int      @default(0)
  purchases     Int      @default(0)
  revenueCents  Int      @default(0)
  createdAt     DateTime @default(now())

  @@unique([assetId, periodStart])
  @@index([periodStart])
}

model CreatorMetric {
  id                String   @id @default(cuid())
  creatorId         String
  periodStart       DateTime
  periodEnd         DateTime
  salesCount        Int      @default(0)
  grossRevenueCents Int      @default(0)
  royaltyCents      Int      @default(0)
  reviewsReceived   Int      @default(0)
  avgRating         Float    @default(0)
  repScoreSnapshot  Int      @default(0)
  createdAt         DateTime @default(now())

  @@unique([creatorId, periodStart])
  @@index([periodStart])
}

model MarketplaceMetric {
  id                String   @id @default(cuid())
  periodStart       DateTime @unique
  periodEnd         DateTime
  ordersCount       Int      @default(0)
  grossRevenueCents Int      @default(0)
  platformFeeCents  Int      @default(0)
  refundsCents      Int      @default(0)
  newProducts       Int      @default(0)
  newUsers          Int      @default(0)
  activeSessions    Int      @default(0)
  createdAt         DateTime @default(now())
}
```

## Public API

- `startWorker(config?)` / `processRollupJob(payload, deps)` — same shape as the other workers.
- `resolveWindow(payload, now?)` — resolves the job's `[start, end)` window, defaulting to the last
  completed hour.
- `computeCreatorReputation(signals)` (`src/reputation.ts`) — the pure §14 scoring formula.
- Pure aggregation functions (`src/rollups.ts`): `computePlayerMetrics`, `computeGameMetrics`,
  `computeAssetMetrics`, `computeCreatorMetrics`, `computeMarketplaceMetric`.
- `buildCreatorSignalsMap(inputs)` (`src/reputationSignals.ts`) — turns raw DB rows into the
  `CreatorSignals` the reputation formula consumes.

## Notable implementation choices

- **Everything is fetch → pure-compute → persist**, with the pure compute functions
  (`rollups.ts`, `reputation.ts`, `reputationSignals.ts`) taking plain arrays/objects and having no
  Prisma awareness at all — this is what makes them fully unit-testable with fixtures, independent
  of the "which five models don't exist yet" question above.
- **Reputation lookback is independent of the hourly rollup window**: an hourly job still only
  reports *that hour's* Player/Game/Asset/Creator activity, but reputation signals are drawn from a
  trailing `REPUTATION_LOOKBACK_DAYS`-day window so a single quiet hour doesn't tank a creator's
  score, and every creator with at least one product/asset gets a row in `CreatorMetric` each hour
  (even with zero sales) purely to keep `repScoreSnapshot` current.
- **Playtime/session attribution**: a session-segment's minutes and join-count are attributed
  entirely to the hour it *joined* in, even if it spans into the next hour — a documented
  simplification (see `rollups.ts`), not a silent inaccuracy: it's exact to within one session's
  length, which is fine for hourly dashboards.
- **Asset views** use the convention that an `AnalyticsEvent` named `asset_view` carries
  `props.assetId` (the schema has no dedicated `assetId` column on `AnalyticsEvent`) — documented
  in `rollups.ts` so whichever module emits that event knows the contract.
- **Partial-failure tolerance**: every metric family is computed from an independent `Promise.all`
  fetch and upserted independently; a reputation-persist failure for one creator (caught per-creator
  in `recomputeReputations`) doesn't abort the rest of that hour's rollup.

## Tests

`pnpm --filter @sonic-gameworld/worker-analytics test` (vitest):

- `src/reputation.test.ts` — bounded to [0,100], deterministic, monotonic in every individual
  signal (including a decreasing check for compliance violations), and a zero-listing creator
  gets neutral (not punished) compliance/originality scores.
- `src/rollups.test.ts` — each pure aggregation function against small fixtures (playtime
  clipping to the window, cross-window exclusion, ASSET-only revenue attribution, etc.).
- `src/reputationSignals.test.ts` — raw-row-to-signals translation, including the "no assets yet"
  edge case.
- `src/index.test.ts` — `processRollupJob` end-to-end against the in-memory fake in
  `src/test/fakePrisma.ts` (covering all eleven read models plus the five upsert sinks): a full
  seeded hour produces every metric family and a real `CreatorProfile.repScore` write; re-running
  the same window is idempotent (upsert, not duplicate); a quiet hour with no data still completes
  cleanly.
