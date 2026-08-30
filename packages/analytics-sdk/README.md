# @sonic-gameworld/analytics-sdk

Thin wrapper over `@sonic-gameworld/gameworld-sdk` scoped to analytics/recommendation routes
(docs/CONTRACTS.md §9 `analytics:`, `recommend:`).

## Install

```bash
pnpm add @sonic-gameworld/analytics-sdk
```

## Usage

```ts
import { createAnalyticsClient } from '@sonic-gameworld/analytics-sdk';

const analytics = createAnalyticsClient({ baseUrl: 'http://localhost:4000', token });
await analytics.analytics.track([{ name: 'view_product', productId: 'p1' }]);
const overview = await analytics.analytics.overview({ granularity: 'DAY' });
const recs = await analytics.recommendations.list({ context: 'HOME' });
```

Need more than analytics (marketplace/assets/etc.)? Use `createFullClient(options)` to get the
full `GameWorldClient` from `@sonic-gameworld/gameworld-sdk`.

## Env vars

None.

## Public API

- `createAnalyticsClient(options): AnalyticsClient` — `{ analytics, recommendations }`, each the
  matching namespace of `GameWorldClient`.
- `createFullClient(options): GameWorldClient`.
- Re-exported types: `AnalyticsEventInput`, `AnalyticsIngestResult`, `AnalyticsOverview`,
  `AnalyticsQuery`, `CreatorAnalytics`, `GameAnalytics`, `Recommendation`,
  `RecommendationQuery`, `TimeseriesPoint`, `ApiError`.

## Build & test

```bash
pnpm --filter @sonic-gameworld/analytics-sdk build
pnpm --filter @sonic-gameworld/analytics-sdk test
```
