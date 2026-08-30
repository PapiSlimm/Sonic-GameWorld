// Environment configuration for the asset-processing worker. Every value has a safe local-dev
// default so the worker can boot against docker-compose without any .env file present.
export interface AssetProcessingConfig {
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
  autoApproveAssets: boolean;
  anthropicApiKey?: string;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AssetProcessingConfig {
  return {
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    eventBusDriver: (env.EVENT_BUS_DRIVER as AssetProcessingConfig['eventBusDriver']) ?? 'redis',
    storageDriver: (env.STORAGE_DRIVER as AssetProcessingConfig['storageDriver']) ?? 's3',
    s3: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION ?? 'us-east1',
      bucket: env.S3_BUCKET ?? 'gameworld-assets',
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
      forcePathStyle: Boolean(env.S3_ENDPOINT),
      publicUrlBase: env.CDN_BASE_URL,
    },
    concurrency: Number(env.ASSET_WORKER_CONCURRENCY ?? 2),
    autoApproveAssets: (env.AUTO_APPROVE_ASSETS ?? 'true') !== 'false',
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
