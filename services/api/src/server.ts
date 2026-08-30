// Process bootstrap: build the app and start listening on API_HOST:API_PORT.
import { buildApp } from './app.js';
import { getConfig } from './config.js';
import { closeBus } from './bus.js';
import { disconnectPrisma } from './db.js';
import { closeRedis } from './redis.js';

export async function start(): Promise<void> {
  const config = getConfig();
  const app = await buildApp({ config });

  // Schedule the hourly analytics rollup (CONTRACTS.md §13's `analytics.rollup` queue has no HTTP
  // trigger of its own — it's a cron). BullMQ's repeatable-job API dedupes by
  // name+repeat-pattern, so calling `.add` again on every restart is safe (it upserts the
  // schedule rather than piling up duplicate repeatable jobs). Skipped in tests: it would open a
  // real BullMQ/Redis connection that `pnpm test` (fakePrisma/fake queues, no live Redis) never has.
  if (!config.isTest) {
    await app.queues.analyticsRollup.add('hourly-rollup', {}, { repeat: { pattern: '0 * * * *' } });
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await Promise.all([disconnectPrisma(), closeBus(), closeRedis()]);
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    const address = await app.listen({ port: config.port, host: config.host });
    app.log.info({ address }, `@sonic-gameworld/api listening (env=${config.env})`);
  } catch (err) {
    app.log.error({ err }, 'failed to start server');
    process.exit(1);
  }
}
