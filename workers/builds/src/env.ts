export interface BuildsConfig {
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
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BuildsConfig {
  return {
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    eventBusDriver: (env.EVENT_BUS_DRIVER as BuildsConfig['eventBusDriver']) ?? 'redis',
    storageDriver: (env.STORAGE_DRIVER as BuildsConfig['storageDriver']) ?? 's3',
    s3: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION ?? 'us-east1',
      bucket: env.S3_BUCKET ?? 'gameworld-builds',
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
      forcePathStyle: Boolean(env.S3_ENDPOINT),
      publicUrlBase: env.CDN_BASE_URL,
    },
    concurrency: Number(env.BUILD_WORKER_CONCURRENCY ?? 2),
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
