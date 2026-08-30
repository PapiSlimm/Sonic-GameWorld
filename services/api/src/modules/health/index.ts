// health module: GET /health, GET /ready, GET /metrics (§9).
import type { FastifyInstance } from 'fastify';
import { pingRedis } from '../../redis.js';

const START_TIME = Date.now();
const VERSION = process.env.npm_package_version ?? '0.1.0';

export async function registerHealthModule(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    status: 'ok' as const,
    version: VERSION,
    uptimeS: Math.round((Date.now() - START_TIME) / 1000),
    timestamp: new Date().toISOString(),
  }));

  app.get('/ready', async (_request, reply) => {
    const checks: Record<string, boolean> = {};

    try {
      await app.db.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch {
      checks.database = false;
    }

    checks.redis = await pingRedis(500);
    checks.eventBus = true; // in-process bus (or connected driver) is always "ready" once constructed

    const ready = Object.values(checks).every(Boolean);
    reply.status(ready ? 200 : 503);
    return { ready, checks };
  });

  app.get('/metrics', async () => {
    const mem = process.memoryUsage();
    return {
      uptimeS: Math.round((Date.now() - START_TIME) / 1000),
      timestamp: new Date().toISOString(),
      process: {
        pid: process.pid,
        memory: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed, heapTotalBytes: mem.heapTotal, externalBytes: mem.external },
        nodeVersion: process.version,
      },
      eventLoop: { delayMsSample: await measureEventLoopDelay() },
    };
  });
}

function measureEventLoopDelay(): Promise<number> {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const delta = process.hrtime.bigint() - start;
      resolve(Number(delta) / 1_000_000);
    });
  });
}
