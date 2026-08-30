// Fastify application shell: builds (but does not start listening) the whole API — cors,
// rate-limit, multipart, swagger/OpenAPI at /docs, realtime websocket bridge, the error handler,
// and every domain module (src/modules/registry.ts) mounted under `/v1`.
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import { getBus } from './bus.js';
import { type AppConfig, getConfig } from './config.js';
import { getPrisma } from './db.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { createLogger } from './logger.js';
import authPlugin from './plugins/auth.js';
import paginationPlugin from './plugins/pagination.js';
import quotasPlugin from './plugins/quotas.js';
import rbacPlugin from './plugins/rbac.js';
import queuesPlugin from './queues.js';
import { getRedis } from './redis.js';
import { registerRealtime } from './realtime/ws.js';
import { createSearchService } from './search.js';
import { getStorage } from './storage.js';
import { MODULES } from './modules/registry.js';

export interface BuildAppOptions {
  /** Override the resolved config (mainly for tests). Defaults to `getConfig()`. */
  config?: AppConfig;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = opts.config ?? getConfig();
  const logger = createLogger();

  // Cast away the precise pino `Logger` generic Fastify would otherwise infer from
  // `loggerInstance` — leaving it would parameterize every downstream `FastifyInstance` reference
  // (registerRealtime, module registrars, ...) with that concrete type instead of the default
  // `FastifyBaseLogger`, which the rest of this codebase (and other agents' modules) type against.
  const app = Fastify({
    // Request logging is controlled via LOG_LEVEL (silent in tests) rather than
    // `disableRequestLogging`, which is deprecated as of Fastify 5 (removed in 6).
    loggerInstance: logger,
    trustProxy: true,
  }) as unknown as FastifyInstance;

  // ---- Core service decorators — must run before any module/plugin that reads them. ----
  app.decorate('config', config);
  app.decorate('db', getPrisma());
  app.decorate('bus', getBus(config));
  app.decorate('redis', getRedis());
  app.decorate('storage', getStorage(config));
  app.decorate('searchService', createSearchService(config, app.db));

  // ---- Cross-cutting fastify plugins ----
  await app.register(cors, {
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  });
  await app.register(rateLimit, { max: config.rateLimit.max, timeWindow: config.rateLimit.window });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 * 1024 } });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Sonic GameWorld API',
        version: '0.1.0',
        description: 'The Spatial Operating System for Creating, Publishing, Discovering, and Monetizing Interactive Worlds.',
      },
      servers: [{ url: config.baseUrl }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          apiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' },
        },
      },
    },
  });
  await app.register(swaggerUI, { routePrefix: '/docs' });

  // ---- Auth / RBAC / quotas / pagination (order matters: auth before anything reading request.user) ----
  await app.register(authPlugin);
  await app.register(rbacPlugin);
  await app.register(quotasPlugin);
  await app.register(paginationPlugin);
  // Must be registered after `app.decorate('redis', ...)` above — real `Queue` construction reads
  // `app.redis` eagerly. Every domain module registered below (`MODULES`) may read `app.queues`.
  await app.register(queuesPlugin);

  // workers/analytics (queue `analytics.rollup`) has no natural HTTP trigger — it's an hourly
  // cron per its README. BullMQ's own repeatable-job scheduler covers this without a separate
  // cron dependency: `add()` with a `repeat` pattern is idempotent (BullMQ dedupes by the job's
  // repeat key), so it's safe to call on every boot. Skipped in tests: it would otherwise open a
  // real Redis connection and schedule a job no test ever wants to observe.
  if (!config.isTest) {
    await app.queues.analyticsRollup.add('hourly-rollup', {}, { repeat: { pattern: '0 * * * *' } });
  }

  // ---- Realtime (mounted at top-level `/ws`, not under `/v1` — see CONTRACTS.md §9) ----
  await registerRealtime(app);

  // ---- Error handling ----
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  // ---- Domain modules, all under /v1 ----
  await app.register(
    async (v1) => {
      for (const registerModule of MODULES) {
        await registerModule(v1);
      }
    },
    { prefix: '/v1' },
  );

  return app;
}
