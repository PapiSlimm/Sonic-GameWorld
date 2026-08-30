// Environment configuration for the thumbnails worker. Every value has a safe local-dev default
// so the worker can boot against docker-compose without any .env file present.
export interface ThumbnailsConfig {
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
  logLevel: string;
  /** Square card size in px. Marketplace grid cards are rendered at a fixed resolution. */
  cardSizePx: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ThumbnailsConfig {
  return {
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    eventBusDriver: (env.EVENT_BUS_DRIVER as ThumbnailsConfig['eventBusDriver']) ?? 'redis',
    storageDriver: (env.STORAGE_DRIVER as ThumbnailsConfig['storageDriver']) ?? 's3',
    s3: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION ?? 'us-east1',
      bucket: env.S3_BUCKET ?? 'gameworld-assets',
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
      forcePathStyle: Boolean(env.S3_ENDPOINT),
      publicUrlBase: env.CDN_BASE_URL,
    },
    concurrency: Number(env.THUMBNAIL_WORKER_CONCURRENCY ?? 4),
    logLevel: env.LOG_LEVEL ?? 'info',
    cardSizePx: Number(env.THUMBNAIL_CARD_SIZE_PX ?? 512),
  };
}
