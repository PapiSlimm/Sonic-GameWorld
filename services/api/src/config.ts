// Zod-validated environment configuration for the Sonic GameWorld API.
// See docs/CONTRACTS.md §2 (tech stack) and §3 (identity & auth) for the source of truth.
import { z } from 'zod';

const boolFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())))
  .default(false);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  API_BASE_URL: z.string().default('http://localhost:4000'),
  WEB_URL: z.string().optional(),

  // Auth
  JWT_SECRET: z.string().default('dev-insecure-secret-change-me'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(3600),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  API_KEY_PREFIX: z.string().default('gw_live_'),

  // Database
  DATABASE_URL: z.string().default('postgresql://gameworld:gameworld@localhost:5432/gameworld?schema=public'),

  // Redis / bus
  REDIS_URL: z.string().default('redis://localhost:6379'),
  EVENT_BUS_DRIVER: z.enum(['memory', 'redis', 'pubsub', 'kafka']).default('memory'),
  GCP_PROJECT_ID: z.string().optional(),
  PUBSUB_TOPIC_PREFIX: z.string().optional(),
  KAFKA_BROKERS: z.string().optional(),

  // CORS / rate limit
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),

  // Storage (S3-compatible). Two naming conventions are accepted: the AWS-style
  // S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY/S3_PUBLIC_URL_BASE used internally by this service,
  // and the shorter S3_ACCESS_KEY/S3_SECRET_KEY/CDN_BASE_URL used by the root .env.example and
  // every worker package — whichever is set wins, so either convention works out of the box.
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('gameworld-dev'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: boolFromEnv,
  S3_PUBLIC_URL_BASE: z.string().optional(),
  CDN_BASE_URL: z.string().optional(),
  S3_UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  S3_DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

  // Search
  OPENSEARCH_URL: z.string().optional(),
  OPENSEARCH_USERNAME: z.string().optional(),
  OPENSEARCH_PASSWORD: z.string().optional(),
  SEARCH_INDEX: z.string().default('gameworld'),

  // Payments
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Firebase (lazy-loaded). Either a full service-account JSON/file path, or the
  // projectId + clientEmail + privateKey triple (the root .env.example convention) works.
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),

  // Misc
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  WEBHOOK_MAX_FAILURES: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof EnvSchema>;

export interface AppConfig {
  env: Env['NODE_ENV'];
  isProd: boolean;
  isTest: boolean;
  port: number;
  host: string;
  baseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtExpiresInSeconds: number;
  refreshTokenTtlDays: number;
  apiKeyPrefix: string;
  databaseUrl: string;
  redisUrl: string;
  eventBus: { driver: Env['EVENT_BUS_DRIVER']; gcpProjectId?: string; pubsubTopicPrefix?: string; kafkaBrokers?: string[] };
  corsOrigin: string;
  rateLimit: { max: number; window: string };
  s3: {
    endpoint?: string;
    region: string;
    bucket: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    forcePathStyle: boolean;
    publicUrlBase?: string;
    uploadUrlTtlSeconds: number;
    downloadUrlTtlSeconds: number;
  };
  search: { openSearchUrl?: string; username?: string; password?: string; index: string };
  stripe: { secretKey?: string; webhookSecret?: string };
  firebase: {
    projectId?: string;
    serviceAccountJson?: string;
    serviceAccountPath?: string;
    clientEmail?: string;
    privateKey?: string;
  };
  logLevel: string;
  webhook: { timeoutMs: number; maxFailures: number };
}

/** Parse + validate `process.env` (or a supplied record) into a strongly-typed AppConfig. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  const env = parsed.data;

  if (env.NODE_ENV === 'production' && env.JWT_SECRET === 'dev-insecure-secret-change-me') {
    throw new Error('JWT_SECRET must be set to a strong secret in production');
  }

  return {
    env: env.NODE_ENV,
    isProd: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    port: env.API_PORT,
    host: env.API_HOST,
    baseUrl: env.API_BASE_URL,
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    jwtExpiresInSeconds: env.JWT_EXPIRES_IN_SECONDS,
    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    apiKeyPrefix: env.API_KEY_PREFIX,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    eventBus: {
      driver: env.EVENT_BUS_DRIVER,
      gcpProjectId: env.GCP_PROJECT_ID,
      pubsubTopicPrefix: env.PUBSUB_TOPIC_PREFIX,
      kafkaBrokers: env.KAFKA_BROKERS?.split(',').map((s) => s.trim()).filter(Boolean),
    },
    corsOrigin: env.CORS_ORIGIN,
    rateLimit: { max: env.RATE_LIMIT_MAX, window: env.RATE_LIMIT_WINDOW },
    s3: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID ?? env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? env.S3_SECRET_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      publicUrlBase: env.S3_PUBLIC_URL_BASE ?? env.CDN_BASE_URL,
      uploadUrlTtlSeconds: env.S3_UPLOAD_URL_TTL_SECONDS,
      downloadUrlTtlSeconds: env.S3_DOWNLOAD_URL_TTL_SECONDS,
    },
    search: {
      openSearchUrl: env.OPENSEARCH_URL,
      username: env.OPENSEARCH_USERNAME,
      password: env.OPENSEARCH_PASSWORD,
      index: env.SEARCH_INDEX,
    },
    stripe: { secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET },
    firebase: {
      projectId: env.FIREBASE_PROJECT_ID,
      serviceAccountJson: env.FIREBASE_SERVICE_ACCOUNT_JSON,
      serviceAccountPath: env.FIREBASE_SERVICE_ACCOUNT_PATH,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY,
    },
    logLevel: env.LOG_LEVEL ?? (env.NODE_ENV === 'production' ? 'info' : env.NODE_ENV === 'test' ? 'silent' : 'debug'),
    webhook: { timeoutMs: env.WEBHOOK_TIMEOUT_MS, maxFailures: env.WEBHOOK_MAX_FAILURES },
  };
}

/** Process-wide singleton config, lazily parsed on first access so tests can set env vars first. */
let cached: AppConfig | undefined;
export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}

/** Test-only: force the cached config to be re-derived from current `process.env` on next getConfig(). */
export function resetConfigForTests(): void {
  cached = undefined;
}
