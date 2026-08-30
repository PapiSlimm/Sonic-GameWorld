export const PACKAGE_NAME = '@sonic-gameworld/analytics-sdk';

import { createClient, type GameWorldClient, type GameWorldClientOptions } from '@sonic-gameworld/gameworld-sdk';

export type {
  AnalyticsEventInput, AnalyticsIngestResult, AnalyticsOverview, AnalyticsQuery, CreatorAnalytics,
  GameAnalytics, Recommendation, RecommendationQuery, TimeseriesPoint,
} from '@sonic-gameworld/gameworld-sdk';
export { ApiError } from '@sonic-gameworld/gameworld-sdk';

/**
 * The analytics + recommendations namespaces of {@link GameWorldClient} (§9 `analytics:`,
 * `recommend:`).
 */
export interface AnalyticsClient {
  analytics: GameWorldClient['analytics'];
  recommendations: GameWorldClient['recommendations'];
}

/**
 * Create a scoped client exposing only the analytics/recommendations routes.
 * Thin wrapper over `@sonic-gameworld/gameworld-sdk`'s `createClient(options)`.
 */
export function createAnalyticsClient(options: GameWorldClientOptions): AnalyticsClient {
  const client = createClient(options);
  return { analytics: client.analytics, recommendations: client.recommendations };
}

/** Escape hatch to the full client when other SDKs (marketplace/assets) are also needed. */
export function createFullClient(options: GameWorldClientOptions): GameWorldClient {
  return createClient(options);
}
