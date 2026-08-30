// Environment configuration for the moderation worker.
export interface ModerationConfig {
  redisUrl: string;
  eventBusDriver: 'memory' | 'redis' | 'pubsub' | 'kafka';
  storageDriver: 's3' | 'memory';
  s3: {
    endpoint?: string;
    region: string;
    bucket: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    forcePathStyle: boolean;
    publicUrlBase?: string;
  };
  concurrency: number;
  anthropicApiKey?: string;
  /** When true, any non-NONE severity verdict still goes to HUMAN_REVIEW even if nothing else
   * would have flagged it — a conservative posture for launch; flip off once heuristics/providers
   * are trusted enough to auto-clear LOW severity. */
  requireHumanReviewForLowSeverity: boolean;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ModerationConfig {
  return {
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    eventBusDriver: (env.EVENT_BUS_DRIVER as ModerationConfig['eventBusDriver']) ?? 'redis',
    storageDriver: (env.STORAGE_DRIVER as ModerationConfig['storageDriver']) ?? 's3',
    s3: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION ?? 'us-east1',
      bucket: env.S3_BUCKET ?? 'gameworld-assets',
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
      forcePathStyle: Boolean(env.S3_ENDPOINT),
      publicUrlBase: env.CDN_BASE_URL,
    },
    concurrency: Number(env.MODERATION_WORKER_CONCURRENCY ?? 4),
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
    requireHumanReviewForLowSeverity: (env.MODERATION_REQUIRE_REVIEW_FOR_LOW ?? 'false') === 'true',
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
