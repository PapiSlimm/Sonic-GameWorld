export interface AnalyticsConfig {
  redisUrl: string;
  eventBusDriver: 'memory' | 'redis' | 'pubsub' | 'kafka';
  concurrency: number;
  /** How far back (days) CreatorProfile reputation recompute looks for signals — a stable,
   * trailing window, independent of the hourly rollup window each job actually covers. */
  reputationLookbackDays: number;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AnalyticsConfig {
  return {
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    eventBusDriver: (env.EVENT_BUS_DRIVER as AnalyticsConfig['eventBusDriver']) ?? 'redis',
    concurrency: Number(env.ANALYTICS_WORKER_CONCURRENCY ?? 1),
    reputationLookbackDays: Number(env.REPUTATION_LOOKBACK_DAYS ?? 90),
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
